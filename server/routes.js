/* MNG ERP — REST API (all data lives in MariaDB; two pools, merged here) */
const express = require('express');
const { workPool, authPool } = require('./db');

const router = express.Router();

/* ---------------- helpers ---------------- */
const J = (x, fb) => { if (x == null) return fb; if (typeof x !== 'string') return x; try { return JSON.parse(x); } catch { return fb; } };
const numid = fid => parseInt(String(fid).replace(/^[a-z]/i, ''), 10);
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
  holiday:  { label:'วันหยุด',       cls:'ev-holiday',  color:'#22C793' },
  personal: { label:'ส่วนตัว',       cls:'ev-personal', color:'#B39EF0' },
};

function shapeTask(r) {
  const rawSt = STATUS_MAP[r.status] || r.status;
  const status = ['todo', 'doing', 'review', 'done'].includes(rawSt) ? rawSt : 'todo';
  const rawPrio = r.erp_prio || PRIO_BASE[r.priority] || 'med';
  const priority = ['urgent', 'high', 'med', 'low'].includes(rawPrio) ? rawPrio : 'med';
  const fbDate = (r.created_at ? String(r.created_at).slice(0, 10) : '') || '2026-10-31';
  return {
    id: 't' + r.id,
    code: r.erp_code || ('MNG-' + (1000 + r.id)),
    project: 'p' + r.project_id,
    title: r.title || '(ไม่มีชื่องาน)',
    desc: r.description || '',
    status,
    priority,
    assignee: r.erp_assignee ? 'u' + r.erp_assignee : null,
    aiAgentId: r.erp_ai_agent || null,
    start: r.erp_start || fbDate,
    due: r.due_date || fbDate,
    progress: r.progress || 0,
    est: r.erp_est ? +r.erp_est : 0,
    spent: (r.erp_spent_hrs != null ? +r.erp_spent_hrs : (r.erp_spent ? +r.erp_spent : 0)),
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
  const fallbackCode = String(r.hub_id || r.title || 'MNG').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'MNG';
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
  id: 'i' + r.id, no: r.no, client: 'c' + r.client_id, title: r.title,
  amount: +r.amount, vat: +r.vat, issue: r.issue, due: r.due,
  paid: r.paid || undefined, status: r.status, items: J(r.items, []),
});

async function logActivity(text, teamId) {
  try { await workPool.query('INSERT INTO erp_activity (team_id, text) VALUES (?,?)', [teamId || 1, text]); } catch {}
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
    const [actR]    = await workPool.query('SELECT * FROM erp_activity ORDER BY id DESC LIMIT 30');
    const [setR]    = await workPool.query('SELECT data FROM erp_settings WHERE id = 1');

    // Agency OS collections (graceful fallback if any table empty)
    let aiAgentR = [], aiRunR = [], chanR = [], msgR = [], roomR = [], bookR = [], checkinR = [], leaveR = [];
    try {
      [aiAgentR] = await workPool.query('SELECT * FROM erp_ai_agents ORDER BY id');
      [aiRunR]   = await workPool.query('SELECT * FROM erp_ai_runs ORDER BY id DESC LIMIT 40');
      [chanR]    = await workPool.query('SELECT * FROM erp_channels ORDER BY id');
      [msgR]     = await workPool.query('SELECT * FROM erp_messages ORDER BY id ASC LIMIT 200');
      [roomR]    = await workPool.query('SELECT * FROM erp_rooms ORDER BY id');
      [bookR]    = await workPool.query('SELECT * FROM erp_bookings ORDER BY date, start');
      [checkinR] = await workPool.query('SELECT * FROM erp_checkins ORDER BY date DESC, id DESC LIMIT 90');
      [leaveR]   = await workPool.query('SELECT * FROM erp_leaves ORDER BY id DESC LIMIT 60');
    } catch {}

    const archIds = new Set(archP.map(x => 'p' + x.id));
    const tasks = taskR.map(shapeTask).filter(t => !archIds.has(t.project));
    const projects = projR.map(r => shapeProject(r, tasks));

    // enrich team ด้วยข้อมูลบัญชี auth พร้อมกำหนดสิทธิ์จากหน้าทีมได้
    const emails = team.map(t => t.email).filter(Boolean);
    let authByEmail = {};
    if (emails.length) {
      try {
        const [au] = await authPool.query('SELECT id, email, role, status FROM users WHERE email IN (?)', [emails]);
        authByEmail = Object.fromEntries(au.map(a => [a.email, a]));
      } catch {}
    }

    // ---- trend (live computation) ----
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
      team: team.map(r => ({
        id: 'u' + r.id, name: r.name, nickname: r.nickname || '',
        presence: r.presence || 'online', skills: J(r.skills, []),
        role: r.role, color: r.color, email: r.email || '', phone: r.phone || '', me: !!r.is_me,
        authUserId: authByEmail[r.email]?.id || null, authRole: authByEmail[r.email]?.role || null, authStatus: authByEmail[r.email]?.status || null
      })),
      projects, tasks,
      events: eventR.map(shapeEvent),
      clients: clients.map(shapeClient),
      invoices: invR.map(shapeInvoice),
      activity: actR.map(r => ({ at: String(r.created_at).slice(0, 16), u: 'u' + (r.team_id || 1), text: r.text })).reverse(),
      aiAgents: aiAgentR.map(r => ({
        id: 'ai' + r.id, code: r.code, name: r.name, role: r.role, model: r.model,
        color: r.color, autonomy: +r.autonomy || 80, paused: !!r.paused,
        runs: +r.runs || 0, successRate: +r.success_rate || 99, tokensToday: +r.tokens_today || 0,
        skills: J(r.skills, []), prompt: r.prompt || '',
      })),
      aiRuns: aiRunR.map(r => ({
        id: 'run' + r.id, agentId: 'ai' + r.agent_id,
        taskId: r.task_id ? 't' + r.task_id : null,
        action: r.action, detail: r.detail || '',
        durationSec: +r.duration_sec || 3, tokens: +r.tokens || 0,
        status: r.status || 'ok', at: String(r.created_at || '').slice(0, 16),
      })),
      channels: chanR.map(r => ({ id: 'ch' + r.id, slug: r.slug, name: r.name, emoji: r.emoji || '💬', topic: r.topic || '' })),
      messages: msgR.map(r => ({
        id: 'm' + r.id, channelId: 'ch' + r.channel_id, senderId: r.sender_id || 'u1',
        senderName: r.sender_name || '', kind: r.kind || 'text', body: r.body,
        pinned: !!r.pinned, reactions: J(r.reactions, {}), at: String(r.created_at || '').slice(0, 16),
      })),
      rooms: roomR.map(r => ({
        id: 'rm' + r.id, name: r.name, kind: r.kind || 'room', zone: r.zone || '',
        capacity: +r.capacity || 6, color: r.color || '#6C5CE7', equip: J(r.equip, []),
      })),
      bookings: bookR.map(r => ({
        id: 'bk' + r.id, roomId: 'rm' + r.room_id, title: r.title, date: r.date,
        start: r.start, end: r.end, hostId: r.host_id || 'u1',
        members: J(r.members, []), note: r.note || '',
      })),
      checkins: checkinR.map(r => ({
        id: 'ck' + r.id, memberId: r.member_id, date: r.date,
        clockIn: r.clock_in || '', clockOut: r.clock_out || '', mode: r.mode || 'office', note: r.note || '',
      })),
      leaves: leaveR.map(r => ({
        id: 'lv' + r.id, memberId: r.member_id, kind: r.kind || 'annual',
        startDate: r.start_date, endDate: r.end_date, days: +r.days || 1,
        reason: r.reason || '', status: r.status || 'pending', approvedBy: r.approved_by || '',
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
    const pid = numid(b.project);
    let pCode = 'MNG';
    if (pid) {
      const [pr] = await workPool.query('SELECT erp_code, hub_id, title FROM projects WHERE id=? LIMIT 1', [pid]);
      if (pr[0]) pCode = pr[0].erp_code || String(pr[0].hub_id || pr[0].title || 'MNG').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'MNG';
    }
    const [r] = await workPool.query(
      `INSERT INTO tasks (project_id, title, description, status, priority, due_date, progress,
        erp_start, erp_assignee, erp_ai_agent, erp_est, erp_spent_hrs, erp_prio, erp_tags, erp_subtasks, erp_comments)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [pid, b.title.trim(), b.desc || '', b.status || 'todo', toDbPrio(b.priority), b.due || null,
       b.progress || 0, b.start || null, b.assignee ? numid(b.assignee) : null, b.aiAgentId || null,
       b.est || 0, b.spent || 0, b.priority || 'med',
       JSON.stringify(b.tags || []), JSON.stringify(b.subtasks || []), JSON.stringify(b.comments || [])]);
    const code = `${pCode}-${1000 + r.insertId}`;
    await workPool.query('UPDATE tasks SET erp_code=? WHERE id=?', [code, r.insertId]);
    await logActivity(`สร้างงาน <b>${code}</b> — ${b.title.trim()}`, numid(req.user?.user_id) || 1);
    res.json({ id: 't' + r.insertId, code });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/tasks/:id', async (req, res) => {
  const id = numid(req.params.id);
  const b = req.body || {};
  const sets = [], vals = [];
  const map = {
    status:     v => { sets.push('status=?');          vals.push(v); if (v === 'done') { sets.push('progress=100'); } },
    priority:   v => { sets.push('erp_prio=?, priority=?'); vals.push(v, toDbPrio(v)); },
    progress:   v => { sets.push('progress=?');        vals.push(v); },
    due:        v => { sets.push('due_date=?');        vals.push(v); },
    start:      v => { sets.push('erp_start=?');       vals.push(v); },
    assignee:   v => { sets.push('erp_assignee=?');    vals.push(v ? numid(v) : null); },
    aiAgentId:  v => { sets.push('erp_ai_agent=?');    vals.push(v || null); },
    title:      v => { sets.push('title=?');           vals.push(v); },
    desc:       v => { sets.push('description=?');     vals.push(v); },
    project:    v => { sets.push('project_id=?');      vals.push(numid(v)); },
    est:        v => { sets.push('erp_est=?');         vals.push(v); },
    spent:      v => { sets.push('erp_spent_hrs=?');   vals.push(v); },
    tags:       v => { sets.push('erp_tags=?');        vals.push(JSON.stringify(v)); },
    subtasks:   v => { sets.push('erp_subtasks=?');    vals.push(JSON.stringify(v)); },
    comments:   v => { sets.push('erp_comments=?');    vals.push(JSON.stringify(v)); },
  };
  for (const k of Object.keys(b)) if (map[k]) map[k](b[k]);
  if (!sets.length) return res.json({ ok: true, noop: true });
  try {
    vals.push(id);
    await workPool.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id=?`, vals);
    if (b.status) await logActivity(`อัปเดตสถานะงาน #${id} → <b>${b.status}</b>`, 1);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    await workPool.query('UPDATE tasks SET archived=1 WHERE id=?', [numid(req.params.id)]); // soft delete
    await logActivity(`เก็บงาน #${req.params.id} เข้าแฟ้ม`, 1);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- EVENTS ---------------- */
router.post('/events', async (req, res) => {
  const b = req.body || {};
  if (!b.title?.trim() || !b.date) return res.status(400).json({ error: 'title_date_required' });
  try {
    const [r] = await workPool.query(
      `INSERT INTO erp_events (title, cat, date, start, end, allday, loc, descp, members, project_id, task_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [b.title.trim(), b.cat || 'meeting', b.date, b.start || '10:00', b.end || '11:00', b.allday ? 1 : 0,
       b.loc || null, b.desc || null, JSON.stringify((b.members || []).map(numid)),
       b.project ? numid(b.project) : null, b.task ? numid(b.task) : null]);
    await logActivity(`สร้างกิจกรรม <b>${b.title.trim()}</b>`, 1);
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
    members:v=> { sets.push('members=?'); vals.push(JSON.stringify(v.map(numid))); },
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
    await logActivity(`บันทึกรับชำระใบแจ้งหนี้ #${id}`, 1);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/invoices', async (req, res) => {
  const b = req.body || {};
  try {
    const [[{ mx }]] = await workPool.query("SELECT MAX(CAST(SUBSTRING(no,10) AS UNSIGNED)) mx FROM erp_invoices");
    const no = 'INV-2026-0' + pad((mx || 45) + 1);
    const amt = +b.amount || 0;
    await workPool.query(
      `INSERT INTO erp_invoices (no, client_id, title, amount, vat, issue, due, status, items)
       VALUES (?,?,?,?,?,CURDATE(),?,?,?)`,
      [no, numid(b.client), b.title || 'ค่าบริการ', amt, Math.round(amt * .07), b.due || null,
       b.status || 'draft', JSON.stringify(b.items || [{ d: b.title || 'ค่าบริการ', q: 1, p: amt }])]);
    await logActivity(`สร้างใบแจ้งหนี้ <b>${no}</b>`, 1);
    res.json({ ok: true, no });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- PROJECTS ---------------- */
router.post('/projects', async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'name_required' });
  const hub = (b.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'proj') + '-' + Date.now().toString(36);
  const pCode = String(b.code || b.name || 'MNG').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || 'MNG';
  const pal = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  try {
    const [r] = await workPool.query(
      `INSERT INTO projects (hub_id, title, description, stat, icon, erp_code, erp_client, erp_budget, erp_start, erp_end, erp_grad, erp_color, erp_status, erp_members)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [hub, b.name.trim(), b.desc ?? null, 'prog', '📁', pCode,
       b.clientName ?? b.client ?? null, b.budget ?? 0,
       b.start ?? null, b.end ?? null, b.grad ?? pal[1], b.color ?? pal[0], 'todo', JSON.stringify([1])]);
    await logActivity(`สร้างโปรเจกต์ <b>${b.name.trim()}</b>`, 1);
    res.json({ id: 'p' + r.insertId, code: pCode });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- PROJECTS: manage (แก้ไข/เก็บถาวร/กู้คืน) ---------------- */
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
    if (b.code !== undefined) { sets.push('erp_code = ?'); vals.push(String(b.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || null); }
    if (b.desc !== undefined) { sets.push('description = ?'); vals.push(b.desc || null); changes.push('รายละเอียด'); }
    if (b.clientName !== undefined || b.client !== undefined) {
      const cn = b.clientName ?? b.client ?? null;
      sets.push('erp_client = ?'); vals.push(cn);
      if (cn) { const [c] = await workPool.query('SELECT id FROM erp_clients WHERE name = ? LIMIT 1', [cn]); sets.push('erp_client_id = ?'); vals.push(c[0]?.id ?? null); }
      else { sets.push('erp_client_id = ?'); vals.push(null); }
      changes.push('ลูกค้า');
    }
    if (b.budget !== undefined) { sets.push('erp_budget = ?'); vals.push(b.budget ?? 0); changes.push('งบประมาณ'); }
    if (b.start  !== undefined) { sets.push('erp_start = ?'); vals.push(b.start || null); }
    if (b.end    !== undefined) { sets.push('erp_end = ?');   vals.push(b.end || null);   }
    if (b.grad   !== undefined) { sets.push('erp_grad = ?');  vals.push(b.grad || null); changes.push('สี'); }
    if (b.color  !== undefined) { sets.push('erp_color = ?'); vals.push(b.color || null); }
    if (b.status !== undefined) { sets.push('erp_status = ?'); vals.push(b.status || null); changes.push('สถานะ'); }
    if (b.members !== undefined) { sets.push('erp_members = ?'); vals.push(JSON.stringify((b.members || []).map(numid).filter(Boolean))); changes.push('สมาชิก'); }
    if (!sets.length) return res.json({ ok: true, unchanged: true });
    vals.push(id);
    await workPool.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, vals);
    await logActivity(`แก้ไขโปรเจกต์ <b>${escS(b.name || cur[0].title)}</b> (${changes.join(', ') || 'รายละเอียด'})`, 1);
    res.json({ ok: true });
  } catch (e) { console.error('[projects/patch]', e.message); res.status(500).json({ error: e.message }); }
});

router.delete('/projects/:id', async (req, res) => {           // เก็บถาวร (soft-delete — ตารางเดิมของระบบ ไม่ลบจริง)
  if (!guardManage(req, res)) return;
  const id = numid(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const [cur] = await workPool.query('SELECT id, title FROM projects WHERE id = ?', [id]);
    if (!cur.length) return res.status(404).json({ error: 'ไม่พบโปรเจกต์' });
    const [tc] = await workPool.query('SELECT COUNT(*) c FROM tasks WHERE project_id = ?', [id]);
    await workPool.query('UPDATE projects SET erp_archived = 1 WHERE id = ?', [id]);
    await logActivity(`เก็บโปรเจกต์ <b>${escS(cur[0].title)}</b> เข้าคลัง (งาน ${tc[0].c} ชิ้นถูกซ่อนด้วย)`, 1);
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
    await logActivity(`กู้คืนโปรเจกต์ <b>${escS(cur[0].title)}</b> จากคลัง`, 1);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/projects/archived', async (req, res) => {          // รายการในคลัง (สำหรับหน้า settings)
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

/* ---------------- TEAMS (erp_team — CRUD + ผูกสิทธิ์ auth) ---------------- */
router.post('/teams', async (req, res) => {
  if (!guardManage(req, res)) return;
  try {
    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'name_required' });
    const email = String(b.email || '').trim().toLowerCase() || null;
    let authId = null;
    if (email) { const [u] = await authPool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]); authId = u[0]?.id ?? null; }
    const [r] = await workPool.query(
      'INSERT INTO erp_team (name, nickname, presence, skills, role, color, email, phone, auth_user_id, is_me) VALUES (?,?,?,?,?,?,?,?,?,0)',
      [b.name.trim(), b.nickname?.trim() || null, b.presence || 'online', JSON.stringify(b.skills || []),
       b.role?.trim() || 'สมาชิกทีม', b.color || '#6C5CE7', email, b.phone?.trim() || null, authId]);
    await logActivity(`เพิ่มสมาชิกทีม <b>${escS(b.name.trim())}</b>`, 1);
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
    if (b.nickname !== undefined) { sets.push('nickname = ?'); vals.push(b.nickname || null); }
    if (b.presence !== undefined) { sets.push('presence = ?'); vals.push(b.presence || 'online'); }
    if (b.skills   !== undefined) { sets.push('skills = ?');   vals.push(JSON.stringify(b.skills || [])); }
    if (b.role !== undefined)  { sets.push('role = ?');  vals.push(b.role || null);  changes.push('ตำแหน่ง'); }
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
    await logActivity(`แก้ไขสมาชิกทีม <b>${escS(b.name || cur[0].name)}</b> (${changes.join(', ')})`, 1);
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
    await logActivity(`ลบสมาชิก <b>${escS(cur[0].name)}</b> ออกจากทีม${tc[0].c ? ` (งาน ${tc[0].c} ชิ้นกลับสู่สถานะว่าง)` : ''}`, 1);
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

/* ---------------- AGENCY OS WORKSPACE ROUTES ---------------- */
router.use(require('./workspace-routes'));

module.exports = router;
