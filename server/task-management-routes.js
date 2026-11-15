/* MNG ERP — ไทม์ไลน์โปรเจกต์และประวัติปัญหา อยู่หลัง auth.middleware เสมอ */
const express = require('express');
const { workPool } = require('./db');
const BangkokTime = require('../assets/js/bangkok-time');
const router = express.Router();

const LEADS = new Set(['super_admin', 'admin', 'manager']);
const WRITERS = new Set(['super_admin', 'admin', 'manager', 'user']);
const problem = (status, message) => Object.assign(new Error(message), { status });
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const idNumber = (value, prefix) => {
  const match = new RegExp('^' + prefix + '([1-9]\\d*)$').exec(String(value ?? ''));
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isSafeInteger(n) && n <= 4294967295 ? n : 0;
};
const parseArray = value => {
  try { const a = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(a) ? a : []; }
  catch { return []; }
};
const dateOnly = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
};
const statusOf = value => ({ delivery:'done', hold:'hold', cancel:'cancelled', cancelled:'cancelled',
  todo:'todo', doing:'doing', review:'review', done:'done' }[value] || 'unknown');
const teamId = value => {
  const match = /^u?([1-9]\d*)$/.exec(String(value ?? ''));
  const n = match && Number(match[1]);
  return n && Number.isSafeInteger(n) && n <= 4294967295 ? 'u' + n : null;
};
const progressOf = r => {
  if (statusOf(r.status) === 'done') return 100;
  if (r.progress == null || r.progress === '') return null;
  const n = Number(r.progress);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};
const stamp = value => value ? String(value).slice(0, 19) : '';
const shapeEvent = r => ({ id:'tie' + r.id, type:r.event_type, note:r.note,
  actor:r.actor_name, at:stamp(r.created_at) });
const shapeIssue = (r, events = []) => ({ id:'ti' + r.id, taskId:'t' + r.task_id,
  description:r.description, status:r.status, revision:Number(r.revision),
  createdBy:r.created_name, createdAt:stamp(r.created_at), updatedAt:stamp(r.updated_at), events });
const actor = req => {
  const id = Number(req.user?.user_id);
  if (!Number.isSafeInteger(id) || id < 1) throw problem(403, 'ไม่พบผู้ใช้สำหรับบันทึกข้อมูล');
  return { id, name:String(req.user.name || 'ผู้ใช้').slice(0, 100) };
};
const fail = (res, e) => {
  if (!e.status) console.warn('[task-management]', e.message);
  res.status(e.status || 503).json({ error:e.status ? e.message : 'ไม่สามารถโหลดหรือบันทึก Task Management ได้ กรุณาลองใหม่หรือติดต่อผู้ดูแล' });
};
const requireRole = roles => (req, res, next) => {
  if (!roles.has(req.user?.role)) return res.status(403).json({ error:'สิทธิ์ไม่เพียงพอสำหรับรายการนี้' });
  next();
};
async function transaction(fn) {
  const conn = await workPool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally { conn.release(); }
}
async function activity(req, message) {
  try {
    let team = [];
    if (req.user?.user_id) [team] = await workPool.query('SELECT id FROM erp_team WHERE auth_user_id=? LIMIT 1', [req.user.user_id]);
    if (!team.length && req.user?.email) [team] = await workPool.query('SELECT id FROM erp_team WHERE LOWER(email)=LOWER(?) LIMIT 1', [req.user.email]);
    await workPool.query('INSERT INTO erp_activity (team_id,text) VALUES (?,?)', [team[0]?.id || null, message]);
  } catch {} // ประวัติปัญหาเป็นหลักฐานหลัก แม้ activity ไม่พร้อม
}

/* อ่านวันที่จริง ไม่ใช้วันที่ fallback ของ bootstrap; ไม่ใช้ demo แทนเมื่อ DB ผิดพลาด */
router.get('/snapshot', async (_req, res) => {
  let conn;
  try {
    conn = await workPool.getConnection();
    await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.beginTransaction();
    const [projects] = await conn.query(`SELECT id,hub_id,title,erp_code,erp_start,erp_end,erp_status,stat,erp_color,erp_members
      FROM projects WHERE COALESCE(erp_archived,0)=0 ORDER BY id`);
    const [tasks] = await conn.query(`SELECT t.id,t.project_id,t.erp_code,t.title,t.status,t.progress,t.erp_start,t.due_date,
      t.erp_assignee,t.erp_ai_agent,t.erp_subtasks,t.erp_blocked,t.erp_block_reason
      FROM tasks t INNER JOIN projects p ON p.id=t.project_id
      WHERE COALESCE(t.archived,0)=0 AND COALESCE(p.erp_archived,0)=0 ORDER BY t.id`);
    const [team] = await conn.query('SELECT id,name,role,color FROM erp_team ORDER BY id');
    const [agents] = await conn.query('SELECT id,code,name FROM erp_ai_agents ORDER BY id');
    const [links] = await conn.query('SELECT child_project_id,parent_project_id FROM erp_task_project_links ORDER BY child_project_id');
    const [issues] = await conn.query(`SELECT i.* FROM erp_task_issues i INNER JOIN tasks t ON t.id=i.task_id
      INNER JOIN projects p ON p.id=t.project_id WHERE COALESCE(t.archived,0)=0 AND COALESCE(p.erp_archived,0)=0 ORDER BY i.id`);
    const [events] = await conn.query(`SELECT e.* FROM erp_task_issue_events e INNER JOIN erp_task_issues i ON i.id=e.issue_id
      INNER JOIN tasks t ON t.id=i.task_id INNER JOIN projects p ON p.id=t.project_id
      WHERE COALESCE(t.archived,0)=0 AND COALESCE(p.erp_archived,0)=0 ORDER BY e.id`);
    await conn.commit(); conn.release(); conn = null;
    const eventMap = new Map();
    for (const e of events) {
      const key = String(e.issue_id);
      if (!eventMap.has(key)) eventMap.set(key, []);
      eventMap.get(key).push(shapeEvent(e));
    }
    const now = new Date();
    res.json({ ok:true, generatedAt:now.toISOString(), date:BangkokTime.fromInstant(now).date, timezone:BangkokTime.timezone,
      projects:projects.map(p => ({
        id:'p' + p.id, code:p.erp_code || String(p.hub_id || p.title || 'MNG').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,3) || 'MNG',
        name:p.title || '(ไม่มีชื่อโปรเจกต์)', start:dateOnly(p.erp_start), end:dateOnly(p.erp_end),
        status:statusOf(p.erp_status || (p.stat === 'live' ? 'done' : 'doing')),
        color:/^#[0-9a-f]{6}$/i.test(p.erp_color || '') ? p.erp_color : '#6C5CE7',
        members:parseArray(p.erp_members).map(teamId).filter(Boolean),
      })),
      tasks:tasks.map(t => ({
        id:'t' + t.id, project:'p' + t.project_id, code:t.erp_code || ('MNG-' + (1000 + Number(t.id))),
        title:t.title || '(ไม่มีชื่องาน)', status:statusOf(t.status), progress:progressOf(t),
        start:dateOnly(t.erp_start), due:dateOnly(t.due_date), assignee:teamId(t.erp_assignee),
        aiAgentId:/^ai[1-9]\d*$/.test(t.erp_ai_agent || '') ? t.erp_ai_agent : null,
        subtasks:parseArray(t.erp_subtasks).filter(s => s && typeof s.t === 'string').map(s => ({ t:s.t, d:!!s.d })),
        legacyBlocked:!!Number(t.erp_blocked), legacyBlockReason:t.erp_block_reason || '',
      })),
      team:team.map(u => ({ id:'u' + u.id, name:u.name || 'ไม่ระบุชื่อ', role:u.role || '',
        color:/^#[0-9a-f]{6}$/i.test(u.color || '') ? u.color : '#8E7CF3' })),
      aiAgents:agents.map(a => ({ id:'ai' + a.id, code:a.code || '', name:a.name || '' })),
      links:links.map(l => ({ childId:'p' + l.child_project_id, parentId:'p' + l.parent_project_id })),
      issues:issues.map(i => shapeIssue(i, eventMap.get(String(i.id)) || [])),
    });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} conn.release(); }
    fail(res, e);
  }
});

/* เปลี่ยน parent ได้เฉพาะผู้จัดการ; ล็อกกลางก่อนอ่านทุกลิงก์ ป้องกัน concurrent cycle */
router.put('/projects/:id/parent', requireRole(LEADS), async (req, res) => {
  const child = idNumber(req.params.id, 'p');
  const hasParent = Object.prototype.hasOwnProperty.call(req.body || {}, 'parentId');
  const raw = req.body?.parentId;
  const parent = raw === null ? null : idNumber(raw, 'p');
  if (!child || !hasParent || (raw !== null && !parent)) return res.status(400).json({ error:'รหัสโปรเจกต์ไม่ถูกต้อง' });
  if (child === parent) return res.status(400).json({ error:'โปรเจกต์เป็นโปรเจกต์หลักของตัวเองไม่ได้' });
  try {
    const user = actor(req);
    await transaction(async conn => {
      await conn.query('INSERT IGNORE INTO erp_task_project_lock (id) VALUES (1)');
      await conn.query('SELECT id FROM erp_task_project_lock WHERE id=1 FOR UPDATE');
      const ids = [...new Set([child, parent].filter(Boolean))];
      const [projects] = await conn.query('SELECT id,title FROM projects WHERE id IN (?) AND COALESCE(erp_archived,0)=0 ORDER BY id FOR UPDATE', [ids]);
      if (projects.length !== ids.length) throw problem(404, 'ไม่พบโปรเจกต์ หรือโปรเจกต์ถูกเก็บเข้าคลัง');
      if (parent) {
        const [links] = await conn.query('SELECT child_project_id,parent_project_id FROM erp_task_project_links');
        const parents = new Map(links.map(l => [Number(l.child_project_id), Number(l.parent_project_id)]));
        const seen = new Set();
        for (let cursor = parent; cursor; cursor = parents.get(cursor)) {
          if (cursor === child) throw problem(409, 'เลือกไม่ได้ เพราะจะทำให้โครงสร้างโปรเจกต์วนเป็นวงจร');
          if (seen.has(cursor)) throw problem(409, 'โครงสร้างโปรเจกต์เดิมมีวงจร กรุณาติดต่อผู้ดูแล');
          seen.add(cursor);
        }
        await conn.query(`INSERT INTO erp_task_project_links (child_project_id,parent_project_id,updated_by,updated_name)
          VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE parent_project_id=VALUES(parent_project_id),updated_by=VALUES(updated_by),updated_name=VALUES(updated_name)`,
        [child, parent, user.id, user.name]);
      } else await conn.query('DELETE FROM erp_task_project_links WHERE child_project_id=?', [child]);
    });
    await activity(req, `🗂 จัดโครงสร้างโปรเจกต์ <b>${html(req.params.id)}</b>${parent ? ' ภายใต้ <b>p' + parent + '</b>' : ' เป็นโปรเจกต์หลัก'}`);
    res.json({ ok:true, childId:'p' + child, parentId:parent ? 'p' + parent : null });
  } catch (e) { fail(res, e); }
});

/* สมาชิกทีมบันทึกปัญหาได้หลายรายการต่อหนึ่งงาน; Viewer อ่านได้อย่างเดียว */
router.post('/issues', requireRole(WRITERS), async (req, res) => {
  const task = idNumber(req.body?.taskId, 't');
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (!task || !description || description.length > 1000) return res.status(400).json({ error:'กรุณาระบุงานและปัญหาไม่เกิน 1,000 ตัวอักษร' });
  try {
    const user = actor(req);
    const id = await transaction(async conn => {
      const [rows] = await conn.query(`SELECT t.id FROM tasks t INNER JOIN projects p ON p.id=t.project_id
        WHERE t.id=? AND COALESCE(t.archived,0)=0 AND COALESCE(p.erp_archived,0)=0 FOR UPDATE`, [task]);
      if (!rows.length) throw problem(404, 'ไม่พบงาน หรือโปรเจกต์ถูกเก็บเข้าคลัง');
      const [r] = await conn.query(`INSERT INTO erp_task_issues (task_id,description,status,revision,created_by,created_name)
        VALUES (?,?,'open',1,?,?)`, [task, description, user.id, user.name]);
      return r.insertId;
    });
    await activity(req, `🚩 แจ้งปัญหาในงาน <b>t${task}</b>`);
    res.status(201).json({ ok:true, id:'ti' + id });
  } catch (e) { fail(res, e); }
});

/* ปลดสถานะติดขัดที่มาจากตารางเดิมอย่างชัดเจน พร้อมเก็บเหตุผลและวิธีแก้ในประวัติ */
router.post('/tasks/:id/legacy-blocker/resolve', requireRole(WRITERS), async (req, res) => {
  const task = idNumber(req.params.id, 't');
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (!task || !note || note.length > 2000) return res.status(400).json({ error:'กรุณาระบุวิธีแก้ไม่เกิน 2,000 ตัวอักษร' });
  try {
    const user = actor(req);
    const id = await transaction(async conn => {
      const [rows] = await conn.query(`SELECT t.id,t.erp_blocked,t.erp_block_reason FROM tasks t
        INNER JOIN projects p ON p.id=t.project_id WHERE t.id=? AND COALESCE(t.archived,0)=0
        AND COALESCE(p.erp_archived,0)=0 FOR UPDATE`, [task]);
      const row = rows[0];
      if (!row) throw problem(404, 'ไม่พบงาน หรือโปรเจกต์ถูกเก็บเข้าคลัง');
      if (!Number(row.erp_blocked)) throw problem(409, 'สถานะติดขัดเดิมถูกปลดแล้ว กรุณาโหลดข้อมูลล่าสุด');
      const description = 'อุปสรรคจากระบบเดิม: ' + String(row.erp_block_reason || 'ไม่มีรายละเอียด');
      const [r] = await conn.query(`INSERT INTO erp_task_issues (task_id,description,status,revision,created_by,created_name)
        VALUES (?,?,'resolved',2,?,?)`, [task, description, user.id, user.name]);
      await conn.query(`INSERT INTO erp_task_issue_events (issue_id,event_type,note,actor_id,actor_name)
        VALUES (?,'resolve',?,?,?)`, [r.insertId, note, user.id, user.name]);
      // ไม่ลบเหตุผลเดิมในตาราง Hub และไม่แตะปัญหารายการอื่น
      await conn.query('UPDATE tasks SET erp_blocked=0 WHERE id=?', [task]);
      return r.insertId;
    });
    await activity(req, `🛠 ปลดสถานะติดขัดเดิมของงาน <b>t${task}</b>`);
    res.json({ ok:true, id:'ti' + id });
  } catch (e) { fail(res, e); }
});

/* เพิ่มความคืบหน้า/ปิดปัญหา/เปิดซ้ำ พร้อม revision กันเขียนทับกัน */
router.post('/issues/:id/updates', requireRole(WRITERS), async (req, res) => {
  const id = idNumber(req.params.id, 'ti');
  const { revision, action } = req.body || {};
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (!id || !Number.isSafeInteger(revision) || revision < 1 ||
      !['progress','resolve','reopen'].includes(action) || !note || note.length > 2000) {
    return res.status(400).json({ error:'กรุณาระบุรุ่น สถานะ และผลการติดตามไม่เกิน 2,000 ตัวอักษร' });
  }
  try {
    const user = actor(req);
    await transaction(async conn => {
      const [rows] = await conn.query(`SELECT i.id,i.task_id,i.status,i.revision FROM erp_task_issues i
        INNER JOIN tasks t ON t.id=i.task_id INNER JOIN projects p ON p.id=t.project_id
        WHERE i.id=? AND COALESCE(t.archived,0)=0 AND COALESCE(p.erp_archived,0)=0 FOR UPDATE`, [id]);
      const issue = rows[0];
      if (!issue) throw problem(404, 'ไม่พบปัญหา หรือโปรเจกต์ถูกเก็บเข้าคลัง');
      if (Number(issue.revision) !== revision) throw problem(409, 'ปัญหานี้ถูกอัปเดตโดยผู้อื่น กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก');
      if ((action === 'reopen' && issue.status !== 'resolved') || (action !== 'reopen' && issue.status !== 'open')) {
        throw problem(409, 'สถานะปัญหาเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด');
      }
      const next = action === 'resolve' ? 'resolved' : 'open';
      await conn.query('INSERT INTO erp_task_issue_events (issue_id,event_type,note,actor_id,actor_name) VALUES (?,?,?,?,?)',
        [id, action, note, user.id, user.name]);
      await conn.query('UPDATE erp_task_issues SET status=?,revision=revision+1 WHERE id=?', [next, id]);
    });
    await activity(req, `🛠 ติดตามปัญหา <b>ti${id}</b> (${html(action)})`);
    res.json({ ok:true, id:'ti' + id, revision:revision + 1, status:action === 'resolve' ? 'resolved' : 'open' });
  } catch (e) { fail(res, e); }
});

module.exports = router;
