/* MNG ERP — Project Brief / Flow / Docs (ทุก endpoint อยู่หลัง auth.middleware) */
const express = require('express');
const crypto = require('crypto');
const { workPool } = require('./db');
const ProjectFlow = require('./project-flow');
const router = express.Router();
const LEAD_ROLES = ['super_admin', 'admin', 'manager'];
const err = (status, message) => Object.assign(new Error(message), { status });
const escapeText = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const canManage = req => LEAD_ROLES.includes(req.user?.role);
const fail = (res, e) => res.status(e.status || 500).json({ error: e.status ? e.message : 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง' });

async function logActivity(req, text) {
  try {
    const [team] = req.user?.email
      ? await workPool.query('SELECT id FROM erp_team WHERE LOWER(email)=LOWER(?) LIMIT 1', [req.user.email])
      : [[]];
    await workPool.query('INSERT INTO erp_activity (team_id, text) VALUES (?,?)', [team[0]?.id || 1, text]);
  } catch {}
}

async function lockedProject(conn, id) {
  const [rows] = await conn.query(
    'SELECT id, title, erp_code, hub_id, erp_start, erp_end FROM projects WHERE id=? AND COALESCE(erp_archived,0)=0 FOR UPDATE', [id]
  );
  if (!rows.length) throw err(404, 'ไม่พบโปรเจกต์ หรือโปรเจกต์ถูกเก็บเข้าคลัง');
  return rows[0];
}

router.get('/projects/:id/flow', async (req, res) => {
  const pid = ProjectFlow.validProjectId(req.params.id);
  if (!pid) return res.status(400).json({ error: 'รหัสโปรเจกต์ไม่ถูกต้อง' });
  try {
    const [projects] = await workPool.query('SELECT id FROM projects WHERE id=? AND COALESCE(erp_archived,0)=0 LIMIT 1', [pid]);
    if (!projects.length) return res.status(404).json({ error: 'ไม่พบโปรเจกต์' });
    const [rows] = await workPool.query('SELECT * FROM erp_project_flows WHERE project_id=? LIMIT 1', [pid]);
    res.json({ ok: true, exists: !!rows.length, projectId: 'p' + pid, flow: ProjectFlow.rowToFlow(rows[0]) });
  } catch (e) { fail(res, e); }
});

router.put('/projects/:id/flow', async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'เฉพาะ Admin/Manager เท่านั้นที่แก้ไขผังโปรเจกต์ได้' });
  const pid = ProjectFlow.validProjectId(req.params.id);
  if (!pid) return res.status(400).json({ error: 'รหัสโปรเจกต์ไม่ถูกต้อง' });
  const body = req.body || {};
  let conn;
  try {
    conn = await workPool.getConnection();
    await conn.beginTransaction();
    const project = await lockedProject(conn, pid);
    const [rows] = await conn.query('SELECT * FROM erp_project_flows WHERE project_id=? FOR UPDATE', [pid]);
    const previous = ProjectFlow.rowToFlow(rows[0]);
    const expected = body.revision === undefined ? 0 : Number(body.revision);
    if (!Number.isSafeInteger(expected) || expected < 0) throw err(400, 'รุ่นของผังไม่ถูกต้อง');
    if (expected !== (previous?.revision || 0)) throw err(409, 'ผังถูกแก้ไขโดยผู้อื่น กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก');
    const flow = ProjectFlow.normalizeFlow(body, project.title, previous?.nodes || []);
    await ProjectFlow.validateReferences(conn, flow);
    await conn.query('UPDATE projects SET erp_members=? WHERE id=?', [JSON.stringify(flow.brief.members.map(id => Number(id.slice(1)))), pid]);
    const saved = await ProjectFlow.saveFlow(conn, pid, flow, req.user?.name || 'User', expected + 1);
    await conn.commit();
    conn.release(); conn = null;
    await logActivity(req, `🧭 อัปเดตบรีฟและผัง <b>${escapeText(project.title)}</b>`);
    res.json({ ok: true, flow: saved });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} conn.release(); }
    fail(res, e);
  }
});

router.post('/projects/:id/flow/sync-tasks', async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'เฉพาะ Admin/Manager เท่านั้นที่สร้างงานจากผังได้' });
  const pid = ProjectFlow.validProjectId(req.params.id);
  if (!pid) return res.status(400).json({ error: 'รหัสโปรเจกต์ไม่ถูกต้อง' });
  const nodeId = req.body?.nodeId || null;
  if (nodeId && (typeof nodeId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(nodeId))) return res.status(400).json({ error: 'รหัสขั้นตอนไม่ถูกต้อง' });
  let conn;
  try {
    conn = await workPool.getConnection();
    await conn.beginTransaction();
    const project = await lockedProject(conn, pid);
    const [rows] = await conn.query('SELECT * FROM erp_project_flows WHERE project_id=? FOR UPDATE', [pid]);
    if (!rows.length) throw err(404, 'ยังไม่มีผังที่บันทึกไว้ กรุณาบันทึกบรีฟก่อน');
    const previous = ProjectFlow.rowToFlow(rows[0]);
    if (req.body?.revision !== undefined && Number(req.body.revision) !== previous.revision) {
      throw err(409, 'ผังถูกแก้ไขโดยผู้อื่น กรุณาโหลดข้อมูลล่าสุดก่อนสร้างงาน');
    }
    const flow = ProjectFlow.normalizeFlow(previous, project.title, previous.nodes);
    const created = await ProjectFlow.createNodeTasks(conn, project, flow, nodeId);
    const saved = created.length
      ? await ProjectFlow.saveFlow(conn, pid, flow, req.user?.name || 'User', previous.revision + 1)
      : previous;
    await conn.commit();
    conn.release(); conn = null;
    if (created.length) await logActivity(req, `📋 สร้างงาน ${created.length} รายการจากผัง <b>${escapeText(project.title)}</b>`);
    res.json({ ok: true, createdCount: created.length, created, flow: saved });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} conn.release(); }
    fail(res, e);
  }
});

const shapeDoc = r => ({
  id: 'doc' + r.id, slug: r.slug, category: r.category || 'playbook', icon: r.icon || '📘',
  title: r.title, summary: r.summary || '', body: r.body || '',
  projectId: r.project_id ? 'p' + r.project_id : null,
  authorName: r.author_name || '', pinned: !!r.pinned,
  updatedAt: r.updated_at ? String(r.updated_at).slice(0, 19) : '',
});
const parseDocId = v => {
  const match = String(v || '').match(/^doc([1-9]\d*)$/);
  return match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : 0;
};
const validateDoc = body => {
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 240) throw err(400, 'กรุณาระบุชื่อคู่มือไม่เกิน 240 ตัวอักษร');
  if (typeof body.body !== 'string' || !body.body.trim() || body.body.length > 50000) throw err(400, 'กรุณาระบุเนื้อหาไม่เกิน 50,000 ตัวอักษร');
  if (body.projectId && !ProjectFlow.validProjectId(body.projectId)) throw err(400, 'รหัสโปรเจกต์ไม่ถูกต้อง');
  return {
    title: body.title.trim(), body: body.body,
    summary: typeof body.summary === 'string' ? body.summary.trim().slice(0, 400) : '',
    category: typeof body.category === 'string' ? body.category.trim().slice(0, 50) || 'playbook' : 'playbook',
    icon: Array.from(typeof body.icon === 'string' ? body.icon.trim() : '📘').slice(0, 16).join('') || '📘',
    projectId: body.projectId ? ProjectFlow.validProjectId(body.projectId) : null,
    pinned: !!body.pinned,
  };
};
async function checkDocProject(id) {
  if (!id) return;
  const [rows] = await workPool.query('SELECT id FROM projects WHERE id=? AND COALESCE(erp_archived,0)=0 LIMIT 1', [id]);
  if (!rows.length) throw err(400, 'ไม่พบโปรเจกต์ที่เลือก');
}

router.get('/docs', async (_req, res) => {
  try {
    const [rows] = await workPool.query('SELECT * FROM erp_docs ORDER BY COALESCE(pinned,0) DESC, id DESC');
    res.json({ ok: true, docs: rows.map(shapeDoc) });
  } catch (e) { fail(res, e); }
});

router.post('/docs', async (req, res) => {
  try {
    const d = validateDoc(req.body || {});
    await checkDocProject(d.projectId);
    const slug = 'guide-' + crypto.randomBytes(8).toString('hex');
    const author = String(req.user?.name || 'ผู้ใช้').slice(0, 100);
    const [result] = await workPool.query(
      'INSERT INTO erp_docs (slug, category, icon, title, summary, body, project_id, author_name, pinned) VALUES (?,?,?,?,?,?,?,?,?)',
      [slug, d.category, d.icon, d.title, d.summary, d.body, d.projectId, author, d.pinned ? 1 : 0]
    );
    await logActivity(req, `📖 เพิ่มคู่มือ <b>${escapeText(d.title)}</b>`);
    res.status(201).json({ ok: true, id: 'doc' + result.insertId });
  } catch (e) { fail(res, e); }
});

router.patch('/docs/:id', async (req, res) => {
  const id = parseDocId(req.params.id);
  if (!id) return res.status(400).json({ error: 'รหัสคู่มือไม่ถูกต้อง' });
  try {
    const [rows] = await workPool.query('SELECT * FROM erp_docs WHERE id=? LIMIT 1', [id]);
    if (!rows.length) throw err(404, 'ไม่พบคู่มือ');
    const d = validateDoc({ ...shapeDoc(rows[0]), ...(req.body || {}) });
    await checkDocProject(d.projectId);
    await workPool.query(
      'UPDATE erp_docs SET category=?, icon=?, title=?, summary=?, body=?, project_id=?, pinned=? WHERE id=?',
      [d.category, d.icon, d.title, d.summary, d.body, d.projectId, d.pinned ? 1 : 0, id]
    );
    await logActivity(req, `📖 แก้ไขคู่มือ <b>${escapeText(d.title)}</b>`);
    res.json({ ok: true, id: 'doc' + id });
  } catch (e) { fail(res, e); }
});

router.delete('/docs/:id', async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'เฉพาะ Admin/Manager เท่านั้นที่ลบคู่มือได้' });
  const id = parseDocId(req.params.id);
  if (!id) return res.status(400).json({ error: 'รหัสคู่มือไม่ถูกต้อง' });
  try {
    const [rows] = await workPool.query('SELECT id, title FROM erp_docs WHERE id=? LIMIT 1', [id]);
    if (!rows.length) throw err(404, 'ไม่พบคู่มือ');
    await workPool.query('DELETE FROM erp_docs WHERE id=?', [id]);
    await logActivity(req, `📖 ลบคู่มือ <b>${escapeText(rows[0].title)}</b>`);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

module.exports = router;
