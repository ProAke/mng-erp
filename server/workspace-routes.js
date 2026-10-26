/* MNG ERP — Agency OS / iPlay Workspace REST endpoints (MariaDB workPool) */
const express = require('express');
const { workPool } = require('./db');

const router = express.Router();
const J = (x, fb) => { if (x == null) return fb; if (typeof x !== 'string') return x; try { return JSON.parse(x); } catch { return fb; } };
const numid = fid => parseInt(String(fid ?? '').replace(/^[a-z]+/i, ''), 10) || 0;
const escS = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LEAD_ROLES = ['super_admin', 'admin', 'manager'];

function bkkNow() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
  return { date, time };
}

async function logActivity(text, teamId = 1) {
  try { await workPool.query('INSERT INTO erp_activity (team_id, text) VALUES (?,?)', [teamId, text]); } catch {}
}

/* ---------- LIVE TEAM PRESENCE ---------- */
router.post('/teams/presence', async (req, res) => {
  const { memberId, presence } = req.body || {};
  const allowed = ['online', 'working', 'focus', 'away'];
  if (!allowed.includes(presence)) return res.status(400).json({ error: 'invalid_presence' });
  try {
    if (memberId) {
      await workPool.query('UPDATE erp_team SET presence = ? WHERE id = ?', [presence, numid(memberId)]);
    } else if (req.user?.email) {
      await workPool.query('UPDATE erp_team SET presence = ? WHERE email = ?', [presence, req.user.email]);
    }
    res.json({ ok: true, presence });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- AI WORKFORCE ---------- */
router.post('/ai/agents', async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'name_required' });
  try {
    const code = (b.code || b.name).trim().toUpperCase().slice(0, 16);
    const [r] = await workPool.query(
      `INSERT INTO erp_ai_agents (code, name, role, model, color, autonomy, paused, skills, prompt)
       VALUES (?,?,?,?,?,?,0,?,?)`,
      [code, b.name.trim(), b.role || 'AI Specialist', b.model || 'Claude 3.7 Sonnet',
       b.color || '#6C5CE7', Number(b.autonomy) || 85, JSON.stringify(b.skills || []), b.prompt || '']
    );
    await logActivity(`เพิ่ม AI Agent <b>${escS(b.name.trim())}</b> เข้าทีม`);
    res.status(201).json({ id: 'ai' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/ai/agents/:id', async (req, res) => {
  const id = numid(req.params.id);
  const b = req.body || {};
  const sets = [], vals = [];
  if (b.name !== undefined)     { sets.push('name=?');     vals.push(String(b.name).trim()); }
  if (b.role !== undefined)     { sets.push('role=?');     vals.push(b.role); }
  if (b.model !== undefined)    { sets.push('model=?');    vals.push(b.model); }
  if (b.color !== undefined)    { sets.push('color=?');    vals.push(b.color); }
  if (b.autonomy !== undefined) { sets.push('autonomy=?'); vals.push(Number(b.autonomy) || 0); }
  if (b.paused !== undefined)   { sets.push('paused=?');   vals.push(b.paused ? 1 : 0); }
  if (b.skills !== undefined)   { sets.push('skills=?');   vals.push(JSON.stringify(b.skills || [])); }
  if (b.prompt !== undefined)   { sets.push('prompt=?');   vals.push(b.prompt || ''); }
  if (!sets.length) return res.json({ ok: true });
  try {
    vals.push(id);
    await workPool.query(`UPDATE erp_ai_agents SET ${sets.join(', ')} WHERE id=?`, vals);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/ai/agents/:id', async (req, res) => {
  try {
    await workPool.query('DELETE FROM erp_ai_agents WHERE id=?', [numid(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/toggle-all', async (req, res) => {
  const paused = req.body?.paused ? 1 : 0;
  try {
    await workPool.query('UPDATE erp_ai_agents SET paused = ?', [paused]);
    await logActivity(paused ? 'หยุดพักการทำงาน AI Workforce ทั้งทีมชั่วคราว' : 'เปิดเดินเครื่อง AI Workforce ทั้งทีม');
    res.json({ ok: true, paused: !!paused });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/dispatch', async (req, res) => {
  const b = req.body || {};
  const aid = numid(b.agentId);
  const tid = b.taskId ? numid(b.taskId) : null;
  try {
    const [agRows] = await workPool.query('SELECT * FROM erp_ai_agents WHERE id=?', [aid]);
    if (!agRows.length) return res.status(404).json({ error: 'agent_not_found' });
    const ag = agRows[0];
    let taskTitle = '';
    let taskCode = '';
    if (tid) {
      const [tRows] = await workPool.query('SELECT title, erp_code FROM tasks WHERE id=?', [tid]);
      if (tRows.length) { taskTitle = tRows[0].title; taskCode = tRows[0].erp_code || ('MNG-' + (1000 + tid)); }
      await workPool.query("UPDATE tasks SET erp_ai_agent = ? WHERE id = ? AND (erp_ai_agent IS NULL OR erp_ai_agent = '')", ['ai' + aid, tid]).catch(() => {});
    }
    const tokens = 620 + Math.floor(Math.random() * 980);
    const dur = 3 + Math.floor(Math.random() * 5);
    const rawCmd = (b.action || b.instruction || '').trim();
    const action = rawCmd || (taskCode ? `วิเคราะห์และดำเนินการ ${taskCode}` : `ประมวลผลคำสั่งโดย ${ag.name}`);
    const detail = (b.detail && String(b.detail).trim())
      ? String(b.detail).trim()
      : taskTitle
        ? `${ag.name} (${ag.model}) ตรวจสอบงาน "${taskTitle}" พร้อมสรุปแผนปฏิบัติการและเช็กลิสต์ย่อยเรียบร้อย`
        : `${ag.name} (${ag.model}) ดำเนินการ "${action}" เสร็จสมบูรณ์`;

    const [ins] = await workPool.query(
      `INSERT INTO erp_ai_runs (agent_id, task_id, action, detail, duration_sec, tokens, status)
       VALUES (?,?,?,?,?,?,'ok')`,
      [aid, tid, action.slice(0, 155), detail, dur, tokens]
    );
    await workPool.query('UPDATE erp_ai_agents SET runs = runs + 1, tokens_today = tokens_today + ? WHERE id = ?', [tokens, aid]);

    const [ch] = await workPool.query("SELECT id FROM erp_channels WHERE slug='ai-feed' LIMIT 1");
    if (ch.length) {
      await workPool.query(
        `INSERT INTO erp_messages (channel_id, sender_id, sender_name, kind, body, reactions)
         VALUES (?,?,?,'ai',?,'{"⚡":["u1"]}')`,
        [ch[0].id, 'ai' + aid, `${ag.name} (AI)`, `✨ <b>${escS(ag.name)}</b>: <b>${escS(action)}</b>${taskCode ? ` (${escS(taskCode)})` : ''} — ${escS(detail)}`]
      );
    }
    await logActivity(`🤖 <b>${escS(ag.name)}</b> รันงาน: ${escS(action)}`);
    res.json({ ok: true, id: 'run' + ins.insertId, tokens, durationSec: dur, detail });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- TEAM CHAT & CHANNELS ---------- */
router.post('/channels', async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'name_required' });
  const slug = (b.slug || b.name).trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, '-').replace(/^-+|-+$/g, '') || ('ch-' + Date.now());
  try {
    const [r] = await workPool.query(
      'INSERT INTO erp_channels (slug, name, emoji, topic, is_private) VALUES (?,?,?,?,?)',
      [slug, b.name.trim(), b.emoji || '💬', b.topic || '', b.isPrivate ? 1 : 0]
    );
    res.status(201).json({ id: 'ch' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/channels/:id/messages', async (req, res) => {
  const cid = numid(req.params.id);
  const b = req.body || {};
  if (!b.body?.trim()) return res.status(400).json({ error: 'body_required' });
  try {
    const senderName = b.senderName || req.user?.name || 'สมาชิกทีม';
    const senderId = b.senderId || ('u' + (req.user?.user_id || 1));
    const [r] = await workPool.query(
      `INSERT INTO erp_messages (channel_id, sender_id, sender_name, kind, body, pinned, reactions)
       VALUES (?,?,?,?,?,0,'{}')`,
      [cid, senderId, senderName, b.kind || 'text', b.body.trim()]
    );
    res.status(201).json({ id: 'm' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/messages/:id/react', async (req, res) => {
  const mid = numid(req.params.id);
  const emoji = String(req.body?.emoji || '👍');
  const uid = String(req.body?.userId || ('u' + (req.user?.user_id || 1)));
  try {
    const [rows] = await workPool.query('SELECT reactions FROM erp_messages WHERE id=?', [mid]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const rx = J(rows[0].reactions, {});
    const arr = Array.isArray(rx[emoji]) ? rx[emoji] : [];
    rx[emoji] = arr.includes(uid) ? arr.filter(x => x !== uid) : [...arr, uid];
    if (!rx[emoji].length) delete rx[emoji];
    await workPool.query('UPDATE erp_messages SET reactions=? WHERE id=?', [JSON.stringify(rx), mid]);
    res.json({ ok: true, reactions: rx });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/messages/:id/pin', async (req, res) => {
  const mid = numid(req.params.id);
  try {
    await workPool.query('UPDATE erp_messages SET pinned = 1 - COALESCE(pinned, 0) WHERE id = ?', [mid]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/messages/:id', async (req, res) => {
  const mid = numid(req.params.id);
  try {
    if (req.body?.pinned !== undefined) {
      await workPool.query('UPDATE erp_messages SET pinned=? WHERE id=?', [req.body.pinned ? 1 : 0, mid]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/messages/:id', async (req, res) => {
  try {
    await workPool.query('DELETE FROM erp_messages WHERE id=?', [numid(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- HR ATTENDANCE & LEAVES ---------- */
router.post(['/checkins/clock', '/checkins/in'], async (req, res) => {
  const b = req.body || {};
  const memberId = b.memberId || 'u1';
  const now = bkkNow();
  const today = b.date || now.date;
  const time = b.time || now.time;
  try {
    const [ex] = await workPool.query('SELECT id FROM erp_checkins WHERE member_id=? AND date=? LIMIT 1', [memberId, today]);
    if (ex.length) {
      await workPool.query('UPDATE erp_checkins SET clock_in=COALESCE(NULLIF(clock_in,""), ?), mode=?, note=? WHERE id=?',
        [time, b.mode || 'office', b.note || null, ex[0].id]);
    } else {
      await workPool.query(
        'INSERT INTO erp_checkins (member_id, date, clock_in, mode, note) VALUES (?,?,?,?,?)',
        [memberId, today, time, b.mode || 'office', b.note || null]
      );
    }
    await workPool.query("UPDATE erp_team SET presence = 'working' WHERE id = ?", [numid(memberId)]).catch(() => {});
    await logActivity(`⏱ ลงเวลาเข้างาน (${b.mode === 'wfh' ? 'WFH' : 'เข้าออฟฟิศ'}) เวลา <b>${time}</b>`);
    res.json({ ok: true, clockIn: time });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post(['/checkins/clock-out', '/checkins/out'], async (req, res) => {
  const b = req.body || {};
  const memberId = b.memberId || 'u1';
  const now = bkkNow();
  const today = b.date || now.date;
  const time = b.time || now.time;
  try {
    await workPool.query('UPDATE erp_checkins SET clock_out=? WHERE member_id=? AND date=?', [time, memberId, today]);
    await workPool.query("UPDATE erp_team SET presence = 'away' WHERE id = ?", [numid(memberId)]).catch(() => {});
    await logActivity(`👋 ลงเวลาออกงาน เวลา <b>${time}</b>`);
    res.json({ ok: true, clockOut: time });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/leaves', async (req, res) => {
  const b = req.body || {};
  if (!b.startDate || !b.endDate) return res.status(400).json({ error: 'dates_required' });
  try {
    const [r] = await workPool.query(
      `INSERT INTO erp_leaves (member_id, kind, start_date, end_date, days, reason, status)
       VALUES (?,?,?,?,?,?,'pending')`,
      [b.memberId || 'u1', b.kind || 'annual', b.startDate, b.endDate, Number(b.days) || 1, b.reason || '']
    );
    await logActivity(`🌿 ยื่นคำขอลา/WFH (${escS(b.kind || 'annual')}) วันที่ ${escS(b.startDate)}`);
    res.status(201).json({ id: 'lv' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/leaves/:id', async (req, res) => {
  if (!LEAD_ROLES.includes(req.user?.role)) return res.status(403).json({ error: 'เฉพาะ Admin/Manager เท่านั้นที่อนุมัติใบลาได้' });
  const id = numid(req.params.id);
  const status = req.body?.status;
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
  try {
    await workPool.query('UPDATE erp_leaves SET status=?, approved_by=? WHERE id=?',
      [status, req.user?.name || 'Admin', id]);
    await logActivity(`${status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'}ใบลา #${id}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/leaves/:id', async (req, res) => {
  try {
    await workPool.query('DELETE FROM erp_leaves WHERE id=?', [numid(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- ROOMS & STUDIO BOOKINGS ---------- */
router.post('/rooms', async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'name_required' });
  try {
    const [r] = await workPool.query(
      'INSERT INTO erp_rooms (name, kind, zone, capacity, color, equip) VALUES (?,?,?,?,?,?)',
      [b.name.trim(), b.kind || 'room', b.zone || 'ชั้น 3', Number(b.capacity) || 8,
       b.color || '#6C5CE7', JSON.stringify(b.equip || [])]
    );
    res.status(201).json({ id: 'rm' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/bookings', async (req, res) => {
  const b = req.body || {};
  const rid = numid(b.roomId);
  if (!rid || !b.title?.trim() || !b.date) return res.status(400).json({ error: 'missing_fields' });
  const start = b.start || '10:00';
  const end = b.end || '11:00';
  try {
    const [clash] = await workPool.query(
      'SELECT id, title, start, end FROM erp_bookings WHERE room_id=? AND date=? AND NOT (end <= ? OR start >= ?)',
      [rid, b.date, start, end]
    );
    if (clash.length) {
      return res.status(409).json({ error: `ช่วงเวลาชนกับ "${clash[0].title}" (${clash[0].start}–${clash[0].end})` });
    }
    const [r] = await workPool.query(
      `INSERT INTO erp_bookings (room_id, title, date, start, end, host_id, members, note)
       VALUES (?,?,?,?,?,?,?,?)`,
      [rid, b.title.trim(), b.date, start, end, b.hostId || 'u1', JSON.stringify(b.members || ['u1']), b.note || null]
    );
    await logActivity(`🚪 จองห้อง/อุปกรณ์ <b>${escS(b.title.trim())}</b> วันที่ ${escS(b.date)} (${start}–${end})`);
    res.status(201).json({ id: 'bk' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/bookings/:id', async (req, res) => {
  try {
    await workPool.query('DELETE FROM erp_bookings WHERE id=?', [numid(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
