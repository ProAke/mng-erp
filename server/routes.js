/* MNG ERP — REST API (all data lives in MariaDB; two pools, merged here) */
const express = require('express');
const { workPool, authPool } = require('./db');

const router = express.Router();

/* ---------------- helpers ---------------- */
const J = (x, fb) => { if (x == null) return fb; if (typeof x !== 'string') return x; try { return JSON.parse(x); } catch { return fb; } };
const numid = fid => parseInt(String(fid).replace(/^[a-z_]+/i, ''), 10);
const pad = n => String(n).padStart(2, '0');
const escS = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LEAD_ROLES = ['super_admin', 'admin', 'manager'];
const guardManage = (req, res, roles = LEAD_ROLES) => {
  if (!roles.includes(req.user?.role)) { res.status(403).json({ error: 'สิทธิ์ไม่พอ — เฉพาะ Admin/Manager' }); return false; }
  return true;
};
const STATUS_MAP  = { delivery: 'done', hold: 'todo', cancel: 'done' };
const PRIO_BASE   = { high: 'high', normal: 'med' };
const toDbPrio    = p => (p === 'urgent' || p === 'high') ? 'high' : 'normal';

const EVENT_CATS = {
  task:     { label:'งาน/เดดไลน์',  cls:'ev-task',     color:'#3BA7FF' },
  meeting:  { label:'ประชุม',        cls:'ev-meeting',  color:'#8E7CF3' },
  deadline: { label:'ส่งมอบ',        cls:'ev-deadline', color:'#FF5C7A' },
  finance:  { label:'การเงิน',       cls:'ev-finance',  color:'#FFB020' },
  holiday:  { label:'วันหยุด/ลางาน', cls:'ev-holiday',  color:'#22C793' },
  personal: { label:'ส่วนตัว',       cls:'ev-personal', color:'#B39EF0' },
};

function shapeTask(r) {
  return {
    id: 't' + r.id,
    code: r.erp_code || ('MNG-' + (1000 + r.id)),
    project: 'p' + r.project_id,
    title: r.title,
    desc: r.description || '',
    status: STATUS_MAP[r.status] || r.status,
    priority: r.erp_prio || PRIO_BASE[r.priority] || 'med',
    assignee: r.erp_assignee ? 'u' + r.erp_assignee : null,
    start: r.erp_start, due: r.due_date,
    progress: r.progress || 0,
    est: r.erp_est ? +r.erp_est : 0,
    spent: r.erp_spent ? +r.erp_spent : 0,
    blocked: !!r.erp_blocked,
    blockReason: r.erp_block_reason || '',
    aiGenerated: !!r.erp_ai_generated,
    tags: J(r.erp_tags, []), subtasks: J(r.erp_subtasks, []), comments: J(r.erp_comments, []),
  };
}
const PALETTE = [['#2F6BF0','g-blue'],['#6C5CE7','g-purple'],['#F25C8B','g-pink'],['#14B890','g-green'],['#F2762E','g-orange'],['#17A2B8','g-teal'],['#4B5ED9','g-indigo'],['#5A6280','g-slate']];
function shapeProject(r, tasks) {
  const pts = tasks.filter(t => t.project === 'p' + r.id);
  const open = pts.filter(t => t.status !== 'done').length;
  const done = pts.length - open;
  const prog = pts.length ? Math.round(done / pts.length * 100) : (r.erp_progress || 0);
  const pal = PALETTE[(r.id - 1) % PALETTE.length];
  const fallbackCode = String(r.hub_id || r.title || ('P' + r.id)).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || ('P' + r.id);
  return {
    id: 'p' + r.id,
    code: r.erp_code || fallbackCode,
    name: r.title,
    short: (r.title || '').split('—')[0].trim().slice(0, 16),
    client: r.erp_client_id ? 'c' + r.erp_client_id : (r.erp_client || 'Internal — MNG Groups'),
    clientName: r.erp_client || '',
    grad: r.erp_grad || pal[1], color: r.erp_color || pal[0],
    status: r.erp_status || (r.stat === 'live' ? 'done' : 'doing'),
    progress: r.erp_progress || prog,
    budget: r.erp_budget ? +r.erp_budget : 0,
    spent: r.erp_spent ? +r.erp_spent : 0,
    start: r.erp_start || (r.created_at ? String(r.created_at).slice(0, 10) : '2026-10-01'),
    end: r.erp_end || '2026-12-31',
    owner: 'u1', members: J(r.erp_members, []).map(i => 'u' + i),
    desc: r.description || '', icon: r.icon || '📁', hub: r.hub_id,
    open, taskCount: pts.length,
  };
}
const shapeEvent = r => ({
  id: 'e' + r.id, title: r.title, cat: r.cat, date: r.date,
  start: r.start, end: r.end, allday: !!r.allday,
  loc: r.loc || '', desc: r.descp || '',
  members: J(r.members, []).map(i => 'u' + i),
  project: r.project_id ? 'p' + r.project_id : undefined,
  task: r.task_id ? 't' + r.task_id : undefined,
});
const shapeClient = r => ({
  id: 'c' + r.id, name: r.name, short: r.short, color: r.color,
  contact: r.contact || '', phone: r.phone || '', email: r.email || '',
  addr: r.addr || '', since: r.since || '2026-01-01',
});
const shapeInvoice = r => ({
  id: 'i' + r.id, no: r.no, client: r.client_id ? 'c' + r.client_id : '', title: r.title,
  amount: +r.amount, vat: +r.vat, issue: r.issue, due: r.due,
  paid: r.paid || undefined, status: r.status, items: J(r.items, []),
});

async function resolveActorTeamId(req) {
  try {
    if (req?.user?.user_id) {
      const [byAuth] = await workPool.query('SELECT id FROM erp_team WHERE auth_user_id = ? LIMIT 1', [req.user.user_id]);
      if (byAuth[0]?.id) return byAuth[0].id;
    }
    if (req?.user?.email) {
      const [byEmail] = await workPool.query('SELECT id FROM erp_team WHERE email = ? LIMIT 1', [req.user.email]);
      if (byEmail[0]?.id) return byEmail[0].id;
    }
  } catch {}
  return 1;
}

async function logActivity(text, teamIdOrReq) {
  try {
    const teamId = typeof teamIdOrReq === 'number' ? teamIdOrReq : await resolveActorTeamId(teamIdOrReq);
    await workPool.query('INSERT INTO erp_activity (team_id, text) VALUES (?,?)', [teamId || 1, text]);
  } catch {}
}

async function resolveClientRef(rawClient, rawClientName) {
  const val = rawClient ?? rawClientName ?? null;
  if (!val) return { clientId: null, clientName: null };
  const s = String(val).trim();
  if (!s) return { clientId: null, clientName: null };
  if (/^c\d+$/i.test(s)) {
    const cid = numid(s);
    const [rows] = await workPool.query('SELECT id, name FROM erp_clients WHERE id = ? LIMIT 1', [cid]);
    if (rows[0]) return { clientId: rows[0].id, clientName: rows[0].name };
  }
  const cname = String(rawClientName || s).trim();
  const [rows] = await workPool.query('SELECT id, name FROM erp_clients WHERE name = ? LIMIT 1', [cname]);
  return { clientId: rows[0]?.id ?? null, clientName: cname };
}

async function safeQuery(sql, params = []) {
  try {
    const [rows] = await workPool.query(sql, params);
    return rows;
  } catch {
    return [];
  }
}

/* ---------------- BOOTSTRAP (one round-trip for the SPA) ---------------- */
router.get('/bootstrap', async (req, res) => {
  try {
    const [team]    = await workPool.query('SELECT * FROM erp_team ORDER BY id');
    const [clients] = await workPool.query('SELECT * FROM erp_clients ORDER BY id');
    const [projR]   = await workPool.query('SELECT * FROM projects WHERE COALESCE(erp_archived,0)=0 ORDER BY id');
    const [taskR]   = await workPool.query('SELECT * FROM tasks WHERE archived = 0 ORDER BY id');
    const [archP]   = await workPool.query('SELECT id FROM projects WHERE COALESCE(erp_archived,0)=1');
    const [eventR]  = await workPool.query('SELECT * FROM erp_events ORDER BY date, start');
    const [invR]    = await workPool.query('SELECT * FROM erp_invoices ORDER BY no');
    const [actR]    = await workPool.query('SELECT * FROM erp_activity ORDER BY id DESC LIMIT 40');
    const [setR]    = await workPool.query('SELECT data FROM erp_settings WHERE id = 1');

    // Agency OS collections (safe fallback to [] if migration hasn't run yet)
    const aiRunsR   = await safeQuery('SELECT * FROM erp_ai_runs ORDER BY id DESC LIMIT 60');
    const chanR     = await safeQuery('SELECT * FROM erp_channels ORDER BY pinned DESC, id ASC');
    const msgR      = await safeQuery('SELECT * FROM erp_messages ORDER BY id ASC LIMIT 400');
    const checkinR  = await safeQuery('SELECT * FROM erp_checkins ORDER BY work_date DESC, id DESC LIMIT 120');
    const leaveR    = await safeQuery('SELECT * FROM erp_leaves ORDER BY id DESC LIMIT 100');
    const roomR     = await safeQuery('SELECT * FROM erp_rooms ORDER BY id ASC');
    const bookingR  = await safeQuery('SELECT * FROM erp_bookings ORDER BY book_date ASC, start_time ASC LIMIT 150');

    const archIds = new Set(archP.map(x => 'p' + x.id));
    const tasks = taskR.map(shapeTask).filter(t => !archIds.has(t.project));
    const projects = projR.map(r => shapeProject(r, tasks));

    const emails = team.map(t => t.email).filter(Boolean);
    let authByEmail = {};
    if (emails.length) {
      try {
        const [au] = await authPool.query('SELECT id, email, role, status, avatar FROM users WHERE email IN (?)', [emails]);
        authByEmail = Object.fromEntries(au.map(a => [a.email, a]));
      } catch {
        try {
          const [au] = await authPool.query('SELECT id, email, role, status FROM users WHERE email IN (?)', [emails]);
          authByEmail = Object.fromEntries(au.map(a => [a.email, a]));
        } catch {}
      }
    }

    const [createdM]  = await workPool.query("SELECT MONTH(created_at) m, COUNT(*) c FROM tasks WHERE YEAR(created_at)=2026 GROUP BY MONTH(created_at)");
    const [doneM]     = await workPool.query("SELECT MONTH(updated_at) m, COUNT(*) c FROM tasks WHERE status IN ('done','delivery') AND YEAR(updated_at)=2026 GROUP BY MONTH(updated_at)");
    const [revM]      = await workPool.query("SELECT MONTH(COALESCE(paid,due)) m, SUM(amount)/1000 v FROM erp_invoices WHERE status='paid' AND YEAR(COALESCE(paid,due))=2026 GROUP BY MONTH(COALESCE(paid,due))");
    const idx = a => { const o = Array(12).fill(0); a.forEach(r => o[r.m - 1] = +((r.c ?? r.v) || 0)); return o; };
    const workload = projects
      .map(p => [p.short.replace(/\s+/g,' '), tasks.filter(t => t.project === p.id && t.status !== 'done')
        .reduce((s, t) => s + (t.est || 4) * (1 - t.progress / 100), 0), p.color])
      .filter(w => w[1] > 0.5).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(w => [w[0], Math.round(w[1]), w[2]]);

    res.json({
      user: req.user,
      team: team.map(r => {
        const uid = 'u' + r.id;
        const memberLoad = Math.round(
          tasks
            .filter(t => t.assignee === uid && t.status !== 'done')
            .reduce((s, t) => s + (t.est || 4) * (1 - (t.progress || 0) / 100), 0)
        );
        return {
          id: uid,
          name: r.name,
          nickname: r.nickname || r.name.split(' ')[0],
          kind: r.kind || 'human',
          state: r.state || 'online',
          skills: J(r.skills, []),
          model: r.model || null,
          paused: !!r.paused,
          autonomy: r.autonomy ?? 70,
          runs: r.runs || 0,
          successRate: r.success_rate ?? 92,
          tokensToday: r.tokens_today || 0,
          currentTaskId: r.current_task_id ? 't' + r.current_task_id : null,
          load: memberLoad,
          capacity: r.capacity || 40,
          role: r.role,
          color: r.color,
          email: r.email || '',
          phone: r.phone || '',
          me: !!r.is_me || Boolean(req.user?.email && r.email === req.user.email),
          avatar: authByEmail[r.email]?.avatar || null,
          authUserId: authByEmail[r.email]?.id || null,
          authRole: authByEmail[r.email]?.role || null,
          authStatus: authByEmail[r.email]?.status || null,
        };
      }),
      projects,
      tasks,
      events: eventR.map(shapeEvent),
      clients: clients.map(shapeClient),
      invoices: invR.map(shapeInvoice),
      activity: actR.map(r => ({ at: String(r.created_at).slice(0, 16), u: 'u' + (r.team_id || 1), text: r.text })).reverse(),
      aiRuns: aiRunsR.map(r => ({
        id: 'ar' + r.id,
        agentId: 'u' + r.agent_id,
        taskId: r.task_id ? 't' + r.task_id : null,
        action: r.action,
        detail: r.detail || '',
        output: r.output || '',
        durationSec: r.duration_sec || 0,
        tokens: r.tokens || 0,
        status: r.status || 'success',
        at: String(r.created_at).slice(0, 19).replace('T', ' '),
      })),
      channels: chanR.map(r => ({
        id: 'ch' + r.id,
        name: r.name,
        emoji: r.emoji || '💬',
        type: r.type || 'group',
        topic: r.topic || '',
        projectId: r.project_id ? 'p' + r.project_id : null,
        members: J(r.members, []).map(i => 'u' + i),
        pinned: !!r.pinned,
      })),
      messages: msgR.map(r => ({
        id: 'm' + r.id,
        channelId: 'ch' + r.channel_id,
        authorId: r.author_id ? 'u' + r.author_id : 'u1',
        text: r.text,
        kind: r.kind || 'text',
        attachmentUrl: r.attachment_url || null,
        attachmentName: r.attachment_name || null,
        pinned: !!r.pinned,
        reactions: J(r.reactions, {}),
        at: String(r.created_at).slice(0, 16).replace('T', ' '),
      })),
      checkins: checkinR.map(r => ({
        id: 'ck' + r.id,
        teamId: 'u' + r.team_id,
        date: typeof r.work_date === 'string' ? r.work_date.slice(0, 10) : new Date(r.work_date).toISOString().slice(0, 10),
        clockIn: r.clock_in,
        clockOut: r.clock_out || null,
        mode: r.mode || 'office',
        lat: r.lat != null ? +r.lat : null,
        lng: r.lng != null ? +r.lng : null,
        distanceM: r.distance_m != null ? +r.distance_m : null,
        note: r.note || '',
        lateMin: r.late_min || 0,
      })),
      leaves: leaveR.map(r => ({
        id: 'lv' + r.id,
        teamId: 'u' + r.team_id,
        leaveType: r.leave_type || 'annual',
        startDate: typeof r.start_date === 'string' ? r.start_date.slice(0, 10) : new Date(r.start_date).toISOString().slice(0, 10),
        endDate: typeof r.end_date === 'string' ? r.end_date.slice(0, 10) : new Date(r.end_date).toISOString().slice(0, 10),
        days: +r.days || 1,
        reason: r.reason || '',
        status: r.status || 'pending',
        approvedBy: r.approved_by ? 'u' + r.approved_by : null,
      })),
      rooms: roomR.map(r => ({
        id: 'rm' + r.id,
        name: r.name,
        kind: r.kind || 'room',
        capacity: r.capacity || 8,
        floor: r.floor || '',
        color: r.color || '#3BA7FF',
        equipment: J(r.equipment, []),
        status: r.status || 'available',
      })),
      bookings: bookingR.map(r => ({
        id: 'bk' + r.id,
        roomId: 'rm' + r.room_id,
        teamId: 'u' + r.team_id,
        title: r.title,
        date: typeof r.book_date === 'string' ? r.book_date.slice(0, 10) : new Date(r.book_date).toISOString().slice(0, 10),
        startTime: r.start_time,
        endTime: r.end_time,
        attendees: J(r.attendees, []).map(i => 'u' + i),
        note: r.note || '',
      })),
      eventCats: EVENT_CATS,
      settings: J(setR[0]?.data, {}) || {},
      trend: {
        months: ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'],
        created: idx(createdM), completed: idx(doneM), revenue: idx(revM), workload,
      },
    });
  } catch (e) {
    console.error('[bootstrap]', e.message);
    res.status(500).json({ error: 'bootstrap_failed', detail: e.message });
  }
});

/* ---------------- TASKS ---------------- */
router.post('/tasks', async (req, res) => {
  const b = req.body || {};
  if (!b.title?.trim()) return res.status(400).json({ error: 'title_required' });
  try {
    const projId = numid(b.project) || 1;
    const desc = b.desc !== undefined ? b.desc : (b.description || '');
    const status = b.status || 'todo';
    const progress = status === 'done' ? 100 : (b.progress || 0);
    const [r] = await workPool.query(
      `INSERT INTO tasks (project_id, title, description, status, priority, due_date, progress,
        erp_start, erp_assignee, erp_est, erp_spent, erp_prio, erp_blocked, erp_block_reason, erp_ai_generated, erp_tags, erp_subtasks, erp_comments)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [projId, b.title.trim(), desc, status, toDbPrio(b.priority), b.due || null,
       progress, b.start || null, b.assignee ? numid(b.assignee) : null, b.est || 0, b.spent || 0,
       b.priority || 'med', b.blocked ? 1 : 0, b.blockReason || null, b.aiGenerated ? 1 : 0,
       JSON.stringify(b.tags || []), JSON.stringify(b.subtasks || []), JSON.stringify(b.comments || [])]);

    // Use project's short code (e.g. ERP-1025, CHEF-1026) when available
    let prefix = 'MNG';
    try {
      const [pr] = await workPool.query('SELECT erp_code FROM projects WHERE id = ? LIMIT 1', [projId]);
      if (pr[0]?.erp_code) prefix = String(pr[0].erp_code).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'MNG';
    } catch {}
    const code = `${prefix}-${1000 + r.insertId}`;
    await workPool.query('UPDATE tasks SET erp_code=? WHERE id=?', [code, r.insertId]);
    await logActivity(`สร้างงาน <b>${escS(code)}</b> — ${escS(b.title.trim())}`, req);
    res.json({ id: 't' + r.insertId, code });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/tasks/:id', async (req, res) => {
  const id = numid(req.params.id);
  const b = req.body || {};
  const sets = [], vals = [];
  const map = {
    status:      v => { sets.push('status=?');          vals.push(v); if (v === 'done' && b.progress === undefined) { sets.push('progress=100'); } },
    priority:    v => { sets.push('erp_prio=?, priority=?'); vals.push(v, toDbPrio(v)); },
    progress:    v => { sets.push('progress=?');        vals.push(v); },
    due:         v => { sets.push('due_date=?');        vals.push(v || null); },
    start:       v => { sets.push('erp_start=?');       vals.push(v || null); },
    assignee:    v => { sets.push('erp_assignee=?');    vals.push(v ? numid(v) : null); },
    title:       v => { sets.push('title=?');           vals.push(v); },
    desc:        v => { sets.push('description=?');     vals.push(v); },
    description: v => { if (b.desc === undefined) { sets.push('description=?'); vals.push(v); } },
    project:     v => { sets.push('project_id=?');      vals.push(numid(v)); },
    est:         v => { sets.push('erp_est=?');         vals.push(v); },
    spent:       v => { sets.push('erp_spent=?');       vals.push(v ?? 0); },
    blocked:     v => { sets.push('erp_blocked=?');     vals.push(v ? 1 : 0); },
    blockReason: v => { sets.push('erp_block_reason=?');vals.push(v || null); },
    aiGenerated: v => { sets.push('erp_ai_generated=?');vals.push(v ? 1 : 0); },
    tags:        v => { sets.push('erp_tags=?');        vals.push(JSON.stringify(v)); },
    subtasks:    v => { sets.push('erp_subtasks=?');    vals.push(JSON.stringify(v)); },
    comments:    v => { sets.push('erp_comments=?');    vals.push(JSON.stringify(v)); },
  };
  for (const k of Object.keys(b)) if (map[k]) map[k](b[k]);
  if (!sets.length) return res.json({ ok: true, noop: true });
  try {
    vals.push(id);
    await workPool.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id=?`, vals);
    if (b.status) await logActivity(`อัปเดตสถานะงาน #${id} → <b>${escS(b.status)}</b>`, req);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    await workPool.query('UPDATE tasks SET archived=1 WHERE id=?', [numid(req.params.id)]);
    await logActivity(`เก็บงาน #${escS(req.params.id)} เข้าแฟ้ม`, req);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- EVENTS ---------------- */
router.post('/events', async (req, res) => {
  const b = req.body || {};
  if (!b.title?.trim() || !b.date) return res.status(400).json({ error: 'title_date_required' });
  try {
    const desc = b.desc !== undefined ? b.desc : (b.description || null);
    const [r] = await workPool.query(
      `INSERT INTO erp_events (title, cat, date, start, end, allday, loc, descp, members, project_id, task_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [b.title.trim(), b.cat || 'meeting', b.date, b.start || '10:00', b.end || '11:00', b.allday ? 1 : 0,
       b.loc || null, desc, JSON.stringify((b.members || []).map(numid).filter(Boolean)),
       b.project ? numid(b.project) : null, b.task ? numid(b.task) : null]);
    await logActivity(`สร้างกิจกรรม <b>${escS(b.title.trim())}</b>`, req);
    res.json({ id: 'e' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/events/:id', async (req, res) => {
  const id = numid(req.params.id);
  const b = req.body || {};
  const sets = [], vals = [];
  const map = {
    title: v => { sets.push('title=?');   vals.push(v); },
    cat:   v => { sets.push('cat=?');     vals.push(v); },
    date:  v => { sets.push('date=?');    vals.push(v); },
    start: v => { sets.push('start=?');   vals.push(v); },
    end:   v => { sets.push('end=?');     vals.push(v); },
    allday:v => { sets.push('allday=?');  vals.push(v ? 1 : 0); },
    loc:   v => { sets.push('loc=?');     vals.push(v); },
    desc:  v => { sets.push('descp=?');   vals.push(v); },
    description: v => { if (b.desc === undefined) { sets.push('descp=?'); vals.push(v); } },
    members:v=> { sets.push('members=?'); vals.push(JSON.stringify((v || []).map(numid).filter(Boolean))); },
    project:v=> { sets.push('project_id=?'); vals.push(v ? numid(v) : null); },
    task:  v => { sets.push('task_id=?'); vals.push(v ? numid(v) : null); },
  };
  for (const k of Object.keys(b)) if (map[k]) map[k](b[k]);
  if (!sets.length) return res.json({ ok: true, noop: true });
  try {
    vals.push(id);
    await workPool.query(`UPDATE erp_events SET ${sets.join(', ')} WHERE id=?`, vals);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/events/:id', async (req, res) => {
  try {
    await workPool.query('DELETE FROM erp_events WHERE id=?', [numid(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- INVOICES ---------------- */
router.post('/invoices/:id/pay', async (req, res) => {
  try {
    const id = numid(req.params.id);
    await workPool.query("UPDATE erp_invoices SET status='paid', paid=CURDATE() WHERE id=?", [id]);
    await logActivity(`บันทึกรับชำระใบแจ้งหนี้ #${id}`, req);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/invoices', async (req, res) => {
  const b = req.body || {};
  try {
    const [[{ mx }]] = await workPool.query("SELECT MAX(CAST(SUBSTRING(no,10) AS UNSIGNED)) mx FROM erp_invoices");
    const no = 'INV-2026-0' + pad((mx || 45) + 1);
    const items = Array.isArray(b.items) && b.items.length
      ? b.items.map(it => ({ d: String(it.d || 'ค่าบริการ'), q: +it.q || 1, p: +it.p || 0 }))
      : [{ d: b.title || 'ค่าบริการ', q: 1, p: +b.amount || 0 }];
    const amt = b.amount !== undefined ? (+b.amount || 0) : items.reduce((s, it) => s + it.q * it.p, 0);
    const vat = b.vat !== undefined ? (+b.vat || 0) : Math.round(amt * 0.07);
    const [r] = await workPool.query(
      `INSERT INTO erp_invoices (no, client_id, title, amount, vat, issue, due, paid, status, items)
       VALUES (?,?,?,?,?, COALESCE(?, CURDATE()), ?, ?, ?, ?)`,
      [no, b.client ? numid(b.client) : null, b.title || 'ค่าบริการ', amt, vat, b.issue || null, b.due || null,
       b.status === 'paid' ? (b.paid || new Date().toISOString().slice(0, 10)) : null,
       b.status || 'draft', JSON.stringify(items)]);
    await logActivity(`สร้างใบแจ้งหนี้ <b>${no}</b>`, req);
    res.json({ ok: true, id: 'i' + r.insertId, no });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/invoices/:id', async (req, res) => {
  const id = numid(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  const b = req.body || {};
  const sets = [], vals = [];
  if (b.client !== undefined) { sets.push('client_id = ?'); vals.push(b.client ? numid(b.client) : null); }
  if (b.title !== undefined) { sets.push('title = ?'); vals.push(String(b.title || 'ค่าบริการ')); }
  if (b.items !== undefined) { sets.push('items = ?'); vals.push(JSON.stringify(b.items || [])); }
  if (b.amount !== undefined) {
    const amt = +b.amount || 0;
    sets.push('amount = ?'); vals.push(amt);
    sets.push('vat = ?'); vals.push(b.vat !== undefined ? (+b.vat || 0) : Math.round(amt * 0.07));
  }
  if (b.issue !== undefined) { sets.push('issue = ?'); vals.push(b.issue || null); }
  if (b.due !== undefined) { sets.push('due = ?'); vals.push(b.due || null); }
  if (b.status !== undefined) {
    sets.push('status = ?'); vals.push(b.status);
    if (b.status === 'paid' && b.paid === undefined) { sets.push('paid = COALESCE(paid, CURDATE())'); }
  }
  if (b.paid !== undefined) { sets.push('paid = ?'); vals.push(b.paid || null); }
  if (!sets.length) return res.json({ ok: true, unchanged: true });
  try {
    vals.push(id);
    await workPool.query(`UPDATE erp_invoices SET ${sets.join(', ')} WHERE id = ?`, vals);
    await logActivity(`แก้ไขใบแจ้งหนี้ #${id}`, req);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/invoices/:id', async (req, res) => {
  if (!guardManage(req, res)) return;
  const id = numid(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const [cur] = await workPool.query('SELECT no FROM erp_invoices WHERE id = ?', [id]);
    if (!cur.length) return res.status(404).json({ error: 'ไม่พบใบแจ้งหนี้' });
    await workPool.query('DELETE FROM erp_invoices WHERE id = ?', [id]);
    await logActivity(`ลบใบแจ้งหนี้ <b>${escS(cur[0].no)}</b>`, req);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- CLIENTS (CRM CRUD) ---------------- */
router.post('/clients', async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อลูกค้า' });
  try {
    const name = b.name.trim();
    const short = (b.short?.trim() || name.slice(0, 14));
    const [r] = await workPool.query(
      'INSERT INTO erp_clients (name, short, color, contact, phone, email, addr, since) VALUES (?,?,?,?,?,?,?,?)',
      [name, short, b.color || '#3BA7FF', b.contact?.trim() || null, b.phone?.trim() || null,
       b.email?.trim() || null, b.addr?.trim() || null, b.since || new Date().toISOString().slice(0, 10)]
    );
    await logActivity(`เพิ่มลูกค้าใหม่ <b>${escS(name)}</b>`, req);
    res.status(201).json({ id: 'c' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/clients/:id', async (req, res) => {
  const id = numid(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  const b = req.body || {};
  const sets = [], vals = [];
  const fields = ['name', 'short', 'color', 'contact', 'phone', 'email', 'addr', 'since'];
  for (const k of fields) {
    if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      vals.push(b[k] ? String(b[k]).trim() : null);
    }
  }
  if (!sets.length) return res.json({ ok: true, unchanged: true });
  try {
    vals.push(id);
    await workPool.query(`UPDATE erp_clients SET ${sets.join(', ')} WHERE id = ?`, vals);
    await logActivity(`แก้ไขข้อมูลลูกค้า #${id}`, req);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/clients/:id', async (req, res) => {
  if (!guardManage(req, res)) return;
  const id = numid(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const [cur] = await workPool.query('SELECT name FROM erp_clients WHERE id = ?', [id]);
    if (!cur.length) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
    await workPool.query('UPDATE projects SET erp_client_id = NULL WHERE erp_client_id = ?', [id]);
    await workPool.query('UPDATE erp_invoices SET client_id = NULL WHERE client_id = ?', [id]);
    await workPool.query('DELETE FROM erp_clients WHERE id = ?', [id]);
    await logActivity(`ลบลูกค้า <b>${escS(cur[0].name)}</b>`, req);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- PROJECTS ---------------- */
router.get('/projects/archived', async (req, res) => {
  if (!guardManage(req, res)) return;
  try {
    const [rows] = await workPool.query(
      'SELECT id, title, erp_client, erp_grad, erp_color FROM projects WHERE COALESCE(erp_archived,0)=1 ORDER BY id');
    const out = [];
    for (const r of rows) {
      const [tc] = await workPool.query('SELECT COUNT(*) c FROM tasks WHERE project_id = ? AND archived = 0', [r.id]);
      out.push({ id: 'p' + r.id, name: r.title, client: r.erp_client || '', grad: r.erp_grad || 'g-slate', color: r.erp_color || '#5A6280', tasks: tc[0].c });
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/projects', async (_req, res) => {
  try {
    const [projR] = await workPool.query('SELECT * FROM projects WHERE COALESCE(erp_archived,0)=0 ORDER BY id');
    const [taskR] = await workPool.query('SELECT * FROM tasks WHERE archived = 0 ORDER BY id');
    const tasks = taskR.map(shapeTask);
    res.json(projR.map(r => shapeProject(r, tasks)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/projects/:id', async (req, res) => {
  const id = numid(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const [projR] = await workPool.query('SELECT * FROM projects WHERE id = ? LIMIT 1', [id]);
    if (!projR.length) return res.status(404).json({ error: 'ไม่พบโปรเจกต์' });
    const [taskR] = await workPool.query('SELECT * FROM tasks WHERE project_id = ? AND archived = 0 ORDER BY id', [id]);
    res.json(shapeProject(projR[0], taskR.map(shapeTask)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/projects', async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'name_required' });
  const hub = (b.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'proj') + '-' + Date.now().toString(36);
  const pal = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  const code = String(b.code || b.name).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'PRJ';
  try {
    const desc = b.desc !== undefined ? b.desc : (b.description ?? null);
    const { clientId, clientName } = await resolveClientRef(b.client, b.clientName);
    const members = Array.isArray(b.members) && b.members.length
      ? b.members.map(numid).filter(Boolean)
      : [1];
    const [r] = await workPool.query(
      `INSERT INTO projects (hub_id, title, description, stat, icon, erp_code, erp_client_id, erp_client, erp_budget, erp_spent, erp_progress, erp_start, erp_end, erp_grad, erp_color, erp_status, erp_members)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [hub, b.name.trim(), desc || null, 'prog', b.icon || '📁', code,
       clientId, clientName, b.budget ?? 0, b.spent ?? 0, b.progress ?? 0,
       b.start || null, b.end || null, b.grad ?? pal[1], b.color ?? pal[0], b.status || 'doing', JSON.stringify(members)]);
    await logActivity(`สร้างโปรเจกต์ <b>[${escS(code)}] ${escS(b.name.trim())}</b>`, req);
    res.json({ id: 'p' + r.insertId, code });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/projects/:id', async (req, res) => {
  if (!guardManage(req, res)) return;
  const id = numid(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const [cur] = await workPool.query('SELECT id, title FROM projects WHERE id = ?', [id]);
    if (!cur.length) return res.status(404).json({ error: 'ไม่พบโปรเจกต์' });
    const b = req.body || {};
    const sets = [], vals = [], changes = [];
    if (b.name != null && String(b.name).trim()) { sets.push('title = ?'); vals.push(String(b.name).trim()); changes.push('ชื่อ'); }
    if (b.code !== undefined) {
      const cleanCode = String(b.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || null;
      sets.push('erp_code = ?'); vals.push(cleanCode); changes.push('รหัสย่อ');
    }
    const desc = b.desc !== undefined ? b.desc : b.description;
    if (desc !== undefined) { sets.push('description = ?'); vals.push(desc || null); changes.push('รายละเอียด'); }
    if (b.clientName !== undefined || b.client !== undefined) {
      const { clientId, clientName } = await resolveClientRef(b.client, b.clientName);
      sets.push('erp_client = ?'); vals.push(clientName);
      sets.push('erp_client_id = ?'); vals.push(clientId);
      changes.push('ลูกค้า');
    }
    if (b.budget !== undefined) { sets.push('erp_budget = ?'); vals.push(b.budget ?? 0); changes.push('งบประมาณ'); }
    if (b.spent  !== undefined) { sets.push('erp_spent = ?');  vals.push(b.spent ?? 0); changes.push('งบใช้จริง'); }
    if (b.progress !== undefined) { sets.push('erp_progress = ?'); vals.push(Math.min(100, Math.max(0, +b.progress || 0))); }
    if (b.start  !== undefined) { sets.push('erp_start = ?'); vals.push(b.start || null); }
    if (b.end    !== undefined) { sets.push('erp_end = ?');   vals.push(b.end || null);   }
    if (b.grad   !== undefined) { sets.push('erp_grad = ?');  vals.push(b.grad || null); changes.push('สี'); }
    if (b.color  !== undefined) { sets.push('erp_color = ?'); vals.push(b.color || null); }
    if (b.status !== undefined) { sets.push('erp_status = ?'); vals.push(b.status || null); changes.push('สถานะ'); }
    if (b.members !== undefined) { sets.push('erp_members = ?'); vals.push(JSON.stringify((b.members || []).map(numid).filter(Boolean))); changes.push('สมาชิก'); }
    if (!sets.length) return res.json({ ok: true, unchanged: true });
    vals.push(id);
    await workPool.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, vals);
    await logActivity(`แก้ไขโปรเจกต์ <b>${escS(b.name || cur[0].title)}</b> (${changes.join(', ') || 'รายละเอียด'})`, req);
    res.json({ ok: true });
  } catch (e) { console.error('[projects/patch]', e.message); res.status(500).json({ error: e.message }); }
});

router.delete('/projects/:id', async (req, res) => {
  if (!guardManage(req, res)) return;
  const id = numid(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const [cur] = await workPool.query('SELECT id, title FROM projects WHERE id = ?', [id]);
    if (!cur.length) return res.status(404).json({ error: 'ไม่พบโปรเจกต์' });
    const [tc] = await workPool.query('SELECT COUNT(*) c FROM tasks WHERE project_id = ?', [id]);
    await workPool.query('UPDATE projects SET erp_archived = 1 WHERE id = ?', [id]);
    await logActivity(`เก็บโปรเจกต์ <b>${escS(cur[0].title)}</b> เข้าคลัง (งาน ${tc[0].c} ชิ้นถูกซ่อนด้วย)`, req);
    res.json({ ok: true, tasksHidden: tc[0].c });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/projects/:id/restore', async (req, res) => {
  if (!guardManage(req, res)) return;
  const id = numid(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const [cur] = await workPool.query('SELECT id, title FROM projects WHERE id = ?', [id]);
    if (!cur.length) return res.status(404).json({ error: 'ไม่พบโปรเจกต์' });
    await workPool.query('UPDATE projects SET erp_archived = 0 WHERE id = ?', [id]);
    await logActivity(`กู้คืนโปรเจกต์ <b>${escS(cur[0].title)}</b> จากคลัง`, req);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- TEAMS (Human & AI members — CRUD + live state + skills) ---------------- */
router.post('/teams', async (req, res) => {
  if (!guardManage(req, res)) return;
  try {
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'name_required' });
    const email = String(b.email || '').trim().toLowerCase() || null;
    const kind = b.kind === 'ai' ? 'ai' : 'human';
    let authId = null;
    if (email && kind === 'human') {
      const [u] = await authPool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
      authId = u[0]?.id ?? null;
    }
    const [r] = await workPool.query(
      `INSERT INTO erp_team (name, nickname, role, kind, state, color, email, phone, skills, model, paused, autonomy, capacity, auth_user_id, is_me)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
      [
        b.name.trim(),
        b.nickname?.trim() || b.name.trim().split(' ')[0],
        b.role?.trim() || (kind === 'ai' ? 'AI Specialist' : 'สมาชิกทีม'),
        kind,
        b.state || 'online',
        b.color || '#6C5CE7',
        email,
        b.phone?.trim() || null,
        JSON.stringify(Array.isArray(b.skills) ? b.skills : []),
        b.model || null,
        b.paused ? 1 : 0,
        b.autonomy ?? 75,
        b.capacity ?? 40,
        authId,
      ]
    );
    await logActivity(`เพิ่ม${kind === 'ai' ? 'เอเจนต์ AI' : 'สมาชิกทีม'} <b>${escS(b.name.trim())}</b>`, req);
    res.status(201).json({ id: 'u' + r.insertId, authUserId: authId });
  } catch (e) { console.error('[teams/post]', e.message); res.status(500).json({ error: e.message }); }
});

router.patch('/teams/:id', async (req, res) => {
  if (!guardManage(req, res)) return;
  const id = numid(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const [cur] = await workPool.query('SELECT id, name FROM erp_team WHERE id = ?', [id]);
    if (!cur.length) return res.status(404).json({ error: 'ไม่พบสมาชิก' });
    const b = req.body || {};
    const sets = [], vals = [], changes = [];
    if (b.name != null && String(b.name).trim()) { sets.push('name = ?'); vals.push(String(b.name).trim()); changes.push('ชื่อ'); }
    if (b.nickname !== undefined) { sets.push('nickname = ?'); vals.push(b.nickname ? String(b.nickname).trim() : null); changes.push('ชื่อเล่น'); }
    if (b.role !== undefined)  { sets.push('role = ?');  vals.push(b.role || null);  changes.push('ตำแหน่ง'); }
    if (b.state !== undefined) { sets.push('state = ?'); vals.push(b.state || 'online'); changes.push('สถานะ'); }
    if (b.skills !== undefined){ sets.push('skills = ?');vals.push(JSON.stringify(Array.isArray(b.skills) ? b.skills : [])); changes.push('ทักษะ'); }
    if (b.model !== undefined) { sets.push('model = ?'); vals.push(b.model || null); }
    if (b.paused !== undefined){ sets.push('paused = ?');vals.push(b.paused ? 1 : 0); }
    if (b.autonomy !== undefined) { sets.push('autonomy = ?'); vals.push(Math.min(100, Math.max(0, +b.autonomy || 0))); }
    if (b.capacity !== undefined) { sets.push('capacity = ?'); vals.push(Math.max(1, +b.capacity || 40)); }
    if (b.color !== undefined) { sets.push('color = ?'); vals.push(b.color || null); changes.push('สี'); }
    if (b.phone !== undefined) { sets.push('phone = ?'); vals.push(b.phone || null); changes.push('เบอร์'); }
    if (b.email !== undefined) {
      const em = String(b.email || '').trim().toLowerCase() || null;
      sets.push('email = ?'); vals.push(em); changes.push('อีเมล');
      let authId = null;
      if (em) { const [u] = await authPool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [em]); authId = u[0]?.id ?? null; }
      sets.push('auth_user_id = ?'); vals.push(authId);
    }
    if (!sets.length) return res.json({ ok: true, unchanged: true });
    vals.push(id);
    await workPool.query(`UPDATE erp_team SET ${sets.join(', ')} WHERE id = ?`, vals);
    await logActivity(`แก้ไขสมาชิก <b>${escS(b.name || cur[0].name)}</b> (${changes.join(', ') || 'ตั้งค่า'})`, req);
    res.json({ ok: true });
  } catch (e) { console.error('[teams/patch]', e.message); res.status(500).json({ error: e.message }); }
});

router.delete('/teams/:id', async (req, res) => {
  if (!guardManage(req, res, ['super_admin', 'admin'])) return;
  const id = numid(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const [cur] = await workPool.query('SELECT id, name FROM erp_team WHERE id = ?', [id]);
    if (!cur.length) return res.status(404).json({ error: 'ไม่พบสมาชิก' });
    const [tc] = await workPool.query('SELECT COUNT(*) c FROM tasks WHERE erp_assignee = ?', [id]);
    if (tc[0].c) await workPool.query('UPDATE tasks SET erp_assignee = NULL WHERE erp_assignee = ?', [id]);
    await workPool.query('DELETE FROM erp_team WHERE id = ?', [id]);
    await logActivity(`ลบสมาชิก <b>${escS(cur[0].name)}</b> ออกจากทีม${tc[0].c ? ` (งาน ${tc[0].c} ชิ้นกลับสู่สถานะว่าง)` : ''}`, req);
    res.json({ ok: true, unassigned: tc[0].c });
  } catch (e) { console.error('[teams/delete]', e.message); res.status(500).json({ error: e.message }); }
});

/* ---------------- SETTINGS ---------------- */
router.put('/settings', async (req, res) => {
  try {
    const cur = await workPool.query('SELECT data FROM erp_settings WHERE id=1');
    const data = { ...J(cur[0][0]?.data, {}), ...(req.body || {}) };
    await workPool.query('INSERT INTO erp_settings (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data=?',
      [JSON.stringify(data), JSON.stringify(data)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.resolveActorTeamId = resolveActorTeamId;
module.exports.logActivity = logActivity;
