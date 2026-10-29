/* ดำเนินงานจาก Flow: ร่าง → อนุมัติ → ส่ง webhook ด้วยมือเท่านั้น */
'use strict';
const express = require('express');
const crypto = require('crypto');
const { workPool } = require('./db');
const ProjectFlow = require('./project-flow');
const Integrations = require('./flow-integrations');
const router = express.Router();
const ROLES = ['super_admin', 'admin', 'manager'];
const KINDS = new Set(['media', 'sales', 'support']);
const problem = (status, message) => Object.assign(new Error(message), { status });
const errorReply = (res, e) => res.status(e.status || 500).json({ error: e.status ? e.message : 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบสถานะก่อนลองใหม่' });
const requireManager = (req, res, next) => ROLES.includes(req.user?.role)
  ? next() : res.status(403).json({ error: 'เฉพาะ Admin/Manager เท่านั้นที่จัดการรายการส่งออกได้' });
const actor = req => ({ id: Number(req.user?.user_id), name: String(req.user?.name || 'ผู้ใช้').slice(0, 100) });
const actionId = value => {
  const match = String(value || '').match(/^fa([1-9]\d*)$/);
  const n = match && Number(match[1]);
  return Number.isSafeInteger(n) && n <= 4294967295 ? n : 0;
};
const validUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const clipped = (value, n) => typeof value === 'string' ? value.slice(0, n) : '';
const staleExpression = "(status IN ('sending','generating') AND updated_at < DATE_SUB(NOW(), INTERVAL 2 MINUTE)) AS is_stale";

function parseIds(req) {
  const pid = ProjectFlow.validProjectId(req.params.id);
  if (!pid) throw problem(400, 'รหัสโปรเจกต์ไม่ถูกต้อง');
  if (req.params.actionId && !actionId(req.params.actionId)) throw problem(400, 'รหัสรายการไม่ถูกต้อง');
  return { pid, aid: req.params.actionId ? actionId(req.params.actionId) : 0 };
}
function checkRevision(body, row) {
  if (!Number.isSafeInteger(body?.revision) || body.revision < 1) throw problem(400, 'กรุณาระบุ revision ล่าสุด');
  if (body.revision !== Number(row.revision)) throw problem(409, 'รายการถูกแก้ไขโดยผู้อื่น กรุณาโหลดข้อมูลล่าสุด');
}
function confirm(body) {
  if (body?.confirm !== true) throw problem(400, 'กรุณายืนยันการดำเนินการ');
}
function validateDraft(b) {
  if (!KINDS.has(b.kind)) throw problem(400, 'ประเภทงานไม่ถูกต้อง');
  if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 200) throw problem(400, 'กรุณาระบุชื่อไม่เกิน 200 ตัวอักษร');
  if (typeof b.destination !== 'string' || b.destination.length > 200) throw problem(400, 'ปลายทางต้องเป็นข้อความไม่เกิน 200 ตัวอักษร');
  if (typeof b.content !== 'string' || b.content.length > 12000) throw problem(400, 'เนื้อหาต้องไม่เกิน 12,000 ตัวอักษร');
  return { kind: b.kind, title: b.title.trim(), destination: b.destination.trim(), content: b.content.trim() };
}
function shape(row) {
  return {
    id: 'fa' + row.id, eventId: row.event_id, projectId: 'p' + row.project_id,
    nodeId: row.node_id, nodeTitle: row.node_title, kind: row.kind, title: row.title,
    destination: row.destination || '', content: row.content || '', status: row.status,
    revision: Number(row.revision), attempts: Number(row.attempts),
    createdBy: row.created_name, approvedBy: row.approved_name || '',
    approvedAt: row.approved_at ? String(row.approved_at).slice(0, 19) : '',
    acceptedAt: row.accepted_at ? String(row.accepted_at).slice(0, 19) : '',
    createdAt: row.created_at ? String(row.created_at).slice(0, 19) : '',
    updatedAt: row.updated_at ? String(row.updated_at).slice(0, 19) : '',
    lastError: row.last_error || '', stale: !!Number(row.is_stale),
  };
}
async function tx(fn) {
  const conn = await workPool.getConnection();
  try {
    await conn.beginTransaction();
    const value = await fn(conn);
    await conn.commit();
    return value;
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally { conn.release(); }
}
async function project(conn, pid, lock = true, includeArchived = false) {
  const [rows] = await conn.query('SELECT id, title FROM projects WHERE id=?' + (includeArchived ? '' : ' AND COALESCE(erp_archived,0)=0') + (lock ? ' FOR UPDATE' : ' LIMIT 1'), [pid]);
  if (!rows.length) throw problem(404, 'ไม่พบโปรเจกต์ หรือโปรเจกต์ถูกเก็บเข้าคลัง');
  return rows[0];
}
async function getAction(conn, pid, aid, lock = true) {
  const [rows] = await conn.query(`SELECT *, ${staleExpression} FROM erp_flow_actions WHERE id=? AND project_id=?` + (lock ? ' FOR UPDATE' : ' LIMIT 1'), [aid, pid]);
  if (!rows.length) throw problem(404, 'ไม่พบรายการ');
  return rows[0];
}
async function flowNode(conn, pid, nodeId) {
  const [rows] = await conn.query('SELECT * FROM erp_project_flows WHERE project_id=? LIMIT 1', [pid]);
  const flow = ProjectFlow.rowToFlow(rows[0]);
  if (!flow) throw problem(409, 'กรุณาบันทึกผังก่อนสร้างรายการ');
  const node = Array.isArray(flow.nodes) && flow.nodes.find(n => n.id === nodeId);
  if (!node) throw problem(409, 'ไม่พบขั้นตอนในผังล่าสุด');
  return { flow, node };
}
async function event(conn, aid, type, req, note = '') {
  const u = actor(req);
  if (!Number.isSafeInteger(u.id) || u.id < 1) throw problem(403, 'ไม่พบตัวตนผู้ดำเนินการ');
  await conn.query('INSERT INTO erp_flow_action_events (action_id,event_type,actor_id,actor_name,note) VALUES (?,?,?,?,?)',
    [aid, type, u.id, u.name, String(note).slice(0, 500)]);
}
function safeCode(value) {
  const code = String(value || 'UNKNOWN').toUpperCase();
  return /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'UNKNOWN';
}

router.get('/flow/integrations', requireManager, (_req, res) => res.json({ ok: true, ...Integrations.status() }));

router.get('/projects/:id/flow/actions', requireManager, async (req, res) => {
  try {
    const { pid } = parseIds(req);
    await project(workPool, pid, false);
    const [rows] = await workPool.query(`SELECT *, ${staleExpression} FROM erp_flow_actions WHERE project_id=? ORDER BY id DESC LIMIT 100`, [pid]);
    res.json({ ok: true, actions: rows.map(shape) });
  } catch (e) { errorReply(res, e); }
});

router.get('/projects/:id/flow/actions/:actionId', requireManager, async (req, res) => {
  try {
    const { pid, aid } = parseIds(req);
    await project(workPool, pid, false);
    const row = await getAction(workPool, pid, aid, false);
    const [events] = await workPool.query('SELECT event_type,actor_name,note,created_at FROM erp_flow_action_events WHERE action_id=? ORDER BY id DESC LIMIT 100', [aid]);
    res.json({ ok: true, action: shape(row), events: events.map(e => ({ type:e.event_type, actor:e.actor_name, note:e.note || '', at:String(e.created_at || '').slice(0, 19) })) });
  } catch (e) { errorReply(res, e); }
});

router.post('/projects/:id/flow/actions', requireManager, async (req, res) => {
  try {
    const { pid } = parseIds(req), b = req.body || {}, data = validateDraft(b);
    if (typeof b.nodeId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(b.nodeId)) throw problem(400, 'รหัสขั้นตอนไม่ถูกต้อง');
    if (b.eventId !== undefined && !validUuid(b.eventId)) throw problem(400, 'eventId ต้องเป็น UUID v4');
    const eventId = b.eventId || crypto.randomUUID();
    const result = await tx(async conn => {
      await project(conn, pid);
      const [old] = await conn.query('SELECT * FROM erp_flow_actions WHERE event_id=? LIMIT 1', [eventId]);
      if (old.length) {
        const r = old[0];
        if (Number(r.project_id) !== pid || Number(r.created_by) !== actor(req).id || r.node_id !== b.nodeId ||
          r.kind !== data.kind || r.title !== data.title || r.destination !== data.destination || r.content !== data.content) {
          throw problem(409, 'eventId นี้ถูกใช้กับข้อมูลอื่นแล้ว');
        }
        return { row: await getAction(conn, pid, r.id), existing: true };
      }
      const { node } = await flowNode(conn, pid, b.nodeId);
      const u = actor(req);
      if (!Number.isSafeInteger(u.id) || u.id < 1) throw problem(403, 'ไม่พบตัวตนผู้ดำเนินการ');
      const [insert] = await conn.query(
        'INSERT INTO erp_flow_actions (event_id,project_id,node_id,node_title,kind,title,destination,content,created_by,created_name) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [eventId, pid, b.nodeId, clipped(node.title, 200), data.kind, data.title, data.destination, data.content, u.id, u.name]);
      await event(conn, insert.insertId, 'created', req);
      return { row: await getAction(conn, pid, insert.insertId), existing: false };
    });
    res.status(result.existing ? 200 : 201).json({ ok:true, action:shape(result.row), existing:result.existing });
  } catch (e) { errorReply(res, e); }
});

router.patch('/projects/:id/flow/actions/:actionId', requireManager, async (req, res) => {
  try {
    const { pid, aid } = parseIds(req), b = req.body || {};
    const row = await tx(async conn => {
      await project(conn, pid);
      const current = await getAction(conn, pid, aid);
      checkRevision(b, current);
      if (current.status !== 'draft') throw problem(409, 'แก้ไขได้เฉพาะร่างที่ยังไม่อนุมัติ');
      if (Number(current.attempts)) throw problem(409, 'รายการที่เคยส่งแล้วแก้เนื้อหาไม่ได้ กรุณาสร้างรายการใหม่');
      const d = validateDraft({ kind:current.kind, title:current.title, destination:current.destination, content:current.content, ...b });
      await conn.query('UPDATE erp_flow_actions SET kind=?,title=?,destination=?,content=?,revision=revision+1,last_error=\'\' WHERE id=?', [d.kind,d.title,d.destination,d.content,aid]);
      await event(conn, aid, 'edited', req);
      return getAction(conn, pid, aid);
    });
    res.json({ ok:true, action:shape(row) });
  } catch (e) { errorReply(res, e); }
});

router.post('/projects/:id/flow/actions/:actionId/approve', requireManager, async (req, res) => {
  try {
    const { pid, aid } = parseIds(req), b = req.body || {};
    confirm(b);
    const row = await tx(async conn => {
      await project(conn, pid);
      const current = await getAction(conn, pid, aid);
      checkRevision(b, current);
      if (current.status !== 'draft') throw problem(409, 'อนุมัติได้เฉพาะร่าง');
      if (!current.content.trim() || !current.destination.trim()) throw problem(400, 'กรุณาระบุปลายทางและเนื้อหาก่อนอนุมัติ');
      const u = actor(req);
      await conn.query("UPDATE erp_flow_actions SET status='approved',approved_by=?,approved_name=?,approved_at=NOW(),revision=revision+1,last_error='' WHERE id=?", [u.id,u.name,aid]);
      await event(conn, aid, 'approved', req);
      return getAction(conn, pid, aid);
    });
    res.json({ ok:true, action:shape(row) });
  } catch (e) { errorReply(res, e); }
});

router.post('/projects/:id/flow/actions/:actionId/return-draft', requireManager, async (req, res) => {
  try {
    const { pid, aid } = parseIds(req), b = req.body || {};
    confirm(b);
    const row = await tx(async conn => {
      await project(conn, pid);
      const current = await getAction(conn, pid, aid);
      checkRevision(b, current);
      if (current.status !== 'approved') throw problem(409, 'คืนเป็นร่างได้เฉพาะรายการที่อนุมัติแล้วแต่ยังไม่ส่ง');
      await conn.query("UPDATE erp_flow_actions SET status='draft',approved_by=NULL,approved_name=NULL,approved_at=NULL,revision=revision+1 WHERE id=?", [aid]);
      await event(conn, aid, 'approval_revoked', req);
      return getAction(conn, pid, aid);
    });
    res.json({ ok:true, action:shape(row) });
  } catch (e) { errorReply(res, e); }
});

router.post('/projects/:id/flow/actions/:actionId/cancel', requireManager, async (req, res) => {
  try {
    const { pid, aid } = parseIds(req), b = req.body || {};
    confirm(b);
    const row = await tx(async conn => {
      await project(conn, pid);
      const current = await getAction(conn, pid, aid);
      checkRevision(b, current);
      if (!['draft','approved'].includes(current.status)) throw problem(409, 'ยกเลิกได้เฉพาะร่างหรือรายการอนุมัติที่ยังไม่ส่ง');
      await conn.query("UPDATE erp_flow_actions SET status='canceled',revision=revision+1 WHERE id=?", [aid]);
      await event(conn, aid, 'canceled', req);
      return getAction(conn, pid, aid);
    });
    res.json({ ok:true, action:shape(row) });
  } catch (e) { errorReply(res, e); }
});

router.post('/projects/:id/flow/actions/:actionId/generate', requireManager, async (req, res) => {
  let started;
  try {
    const { pid, aid } = parseIds(req), b = req.body || {};
    confirm(b);
    if (typeof b.instruction !== 'string' || !b.instruction.trim() || b.instruction.length > 2000) throw problem(400, 'กรุณาระบุคำสั่ง AI ไม่เกิน 2,000 ตัวอักษร');
    if (!Integrations.status().aiReady) throw problem(503, 'ยังไม่ได้ตั้งค่า AI บนเซิร์ฟเวอร์');
    started = await tx(async conn => {
      const p = await project(conn, pid), current = await getAction(conn, pid, aid);
      checkRevision(b, current);
      if (current.status !== 'draft' || Number(current.attempts)) throw problem(409, 'ใช้ AI ได้เฉพาะร่างที่ยังไม่เคยส่ง');
      const { flow, node } = await flowNode(conn, pid, current.node_id);
      const brief = flow.brief || {};
      // ใช้สถานะพักใน AI Hub เป็น kill-switch สำหรับการเริ่มรันใหม่ (ไม่ยกเลิกคำขอที่กำลังรัน)
      const [agents] = await conn.query('SELECT id, paused FROM erp_ai_agents ORDER BY id FOR UPDATE');
      if (!agents.some(a => !Number(a.paused))) throw problem(409, 'AI ทั้งหมดถูกพักหรือยังไม่มี Agent ที่เปิดใช้งาน');
      const chosen = node.aiAgentId || brief.aiAgentId;
      if (chosen) {
        const selected = agents.find(a => 'ai' + a.id === chosen);
        if (!selected || Number(selected.paused)) throw problem(409, 'AI Agent ที่เลือกถูกพักหรือไม่มีอยู่แล้ว');
      }
      await conn.query("UPDATE erp_flow_actions SET status='generating',revision=revision+1,last_error='' WHERE id=?", [aid]);
      await event(conn, aid, 'ai_started', req);
      return {
        pid, aid, revision:Number(current.revision)+1,
        input:{ requestId:crypto.randomUUID(), instruction:b.instruction.trim(), project:clipped(p.title, 200),
          node:{ title:clipped(node.title,200), description:clipped(node.desc,2000) },
          brief:{ objective:clipped(brief.objective,2000), audience:clipped(brief.audience,2000), deliverables:clipped(brief.deliverables,2000), constraints:clipped(brief.constraints,2000) },
          currentDraft:clipped(current.content,4000) },
      };
    });
    let output, failure;
    try { output = await Integrations.generateDraft(started.input); } catch (e) { failure = e; }
    const row = await tx(async conn => {
      // โปรเจกต์อาจถูกเก็บเข้าคลังระหว่างรอ AI; ต้องบันทึกผลที่เกิดขึ้นแล้วให้ครบ
      await project(conn, started.pid, true, true);
      const current = await getAction(conn, started.pid, started.aid);
      if (current.status !== 'generating' || Number(current.revision) !== started.revision) throw problem(409, 'สถานะร่างเปลี่ยนระหว่างเรียก AI กรุณาโหลดข้อมูลล่าสุด');
      if (failure) {
        await conn.query("UPDATE erp_flow_actions SET status='draft',revision=revision+1,last_error=? WHERE id=?", [safeCode(failure.code), started.aid]);
        await event(conn, started.aid, 'ai_failed', req, safeCode(failure.code));
      } else {
        await conn.query("UPDATE erp_flow_actions SET status='draft',content=?,revision=revision+1,last_error='' WHERE id=?", [output.content, started.aid]);
        await event(conn, started.aid, 'ai_completed', req, clipped(output.model,120));
      }
      return getAction(conn, started.pid, started.aid);
    });
    if (failure) return res.status(failure.status || 502).json({ error:failure.message, action:shape(row) });
    res.json({ ok:true, action:shape(row) });
  } catch (e) { errorReply(res, e); }
});

router.post('/projects/:id/flow/actions/:actionId/send', requireManager, async (req, res) => {
  try {
    const { pid, aid } = parseIds(req), b = req.body || {};
    confirm(b);
    if (!Integrations.status().webhookReady) throw problem(503, 'ยังไม่ได้ตั้งค่า webhook บนเซิร์ฟเวอร์');
    const started = await tx(async conn => {
      const p = await project(conn, pid), current = await getAction(conn, pid, aid);
      checkRevision(b, current);
      if (current.status !== 'approved') throw problem(409, 'ต้องอนุมัติรายการก่อนส่ง และรายการที่กำลังส่งจะส่งซ้ำไม่ได้');
      // แช่แข็ง payload ตั้งแต่ครั้งแรก เพื่อให้ eventId เดิมมี bytes เดิมเสมอแม้มีการอนุมัติซ้ำ
      let payload;
      if (current.delivery_payload) {
        try { payload = JSON.parse(current.delivery_payload); } catch {}
        if (!payload || payload.eventId !== current.event_id) throw problem(409, 'ข้อมูลส่งเดิมไม่สมบูรณ์ กรุณาติดต่อผู้ดูแล');
      } else {
        if (Number(current.attempts)) throw problem(409, 'ไม่พบข้อมูลส่งเดิม กรุณาติดต่อผู้ดูแล');
        payload = { eventId:current.event_id, eventType:'mng.flow.action.approved', kind:current.kind,
          project:{ id:'p'+pid, name:p.title }, node:{ id:current.node_id, title:current.node_title },
          action:{ id:'fa'+aid, title:current.title, destination:current.destination, content:current.content },
          approval:{ userId:Number(current.approved_by), name:current.approved_name, at:String(current.approved_at || '').slice(0,19) } };
      }
      await conn.query("UPDATE erp_flow_actions SET status='sending',attempts=attempts+1,revision=revision+1,last_error='',delivery_payload=? WHERE id=?", [JSON.stringify(payload),aid]);
      await event(conn, aid, 'send_started', req);
      return { revision:Number(current.revision)+1, payload };
    });
    let outcome;
    try { outcome = await Integrations.dispatch(started.payload); }
    catch (e) { outcome = { accepted:false, diagnostic:safeCode(e.code) }; }
    const row = await tx(async conn => {
      // บันทึกผลแม้โปรเจกต์ถูกเก็บเข้าคลังขณะรอ webhook
      await project(conn, pid, true, true);
      const current = await getAction(conn, pid, aid);
      if (current.status !== 'sending' || Number(current.revision) !== started.revision) throw problem(409, 'สถานะเปลี่ยนระหว่างส่ง กรุณาตรวจสอบประวัติ');
      const code = safeCode(outcome.diagnostic);
      if (outcome.accepted) {
        await conn.query("UPDATE erp_flow_actions SET status='accepted',accepted_at=NOW(),revision=revision+1,last_error='' WHERE id=?", [aid]);
        await event(conn, aid, 'webhook_accepted', req);
      } else {
        await conn.query("UPDATE erp_flow_actions SET status='unknown',revision=revision+1,last_error=? WHERE id=?", [code,aid]);
        await event(conn, aid, 'delivery_unknown', req, code);
      }
      return getAction(conn, pid, aid);
    });
    res.json({ ok:true, action:shape(row), accepted:!!outcome.accepted });
  } catch (e) { errorReply(res, e); }
});

router.post('/projects/:id/flow/actions/:actionId/reconcile', requireManager, async (req, res) => {
  try {
    const { pid, aid } = parseIds(req), b = req.body || {};
    confirm(b);
    if (typeof b.note !== 'string' || b.note.trim().length < 10 || b.note.length > 500) throw problem(400, 'กรุณาบันทึกผลตรวจสอบ 10–500 ตัวอักษร');
    const row = await tx(async conn => {
      await project(conn, pid);
      const current = await getAction(conn, pid, aid);
      checkRevision(b, current);
      if (current.status === 'generating' && Number(current.is_stale) && b.resolution === 'reset_generation') {
        await conn.query("UPDATE erp_flow_actions SET status='draft',revision=revision+1,last_error='AI_INTERRUPTED' WHERE id=?", [aid]);
        await event(conn, aid, 'ai_reset', req, b.note.trim());
      } else {
        if (!(current.status === 'unknown' || (current.status === 'sending' && Number(current.is_stale)))) throw problem(409, 'รายการยังไม่ถึงเวลาตรวจสอบผล หรือไม่อยู่ในสถานะที่ต้องตรวจสอบ');
        if (!['accepted','not_accepted'].includes(b.resolution)) throw problem(400, 'ผลตรวจสอบไม่ถูกต้อง');
        if (b.resolution === 'accepted') {
          await conn.query("UPDATE erp_flow_actions SET status='accepted',accepted_at=NOW(),revision=revision+1,last_error='' WHERE id=?", [aid]);
          await event(conn, aid, 'manually_accepted', req, b.note.trim());
        } else {
          await conn.query("UPDATE erp_flow_actions SET status='draft',approved_by=NULL,approved_name=NULL,approved_at=NULL,revision=revision+1,last_error='' WHERE id=?", [aid]);
          await event(conn, aid, 'confirmed_not_accepted', req, b.note.trim());
        }
      }
      return getAction(conn, pid, aid);
    });
    res.json({ ok:true, action:shape(row) });
  } catch (e) { errorReply(res, e); }
});

module.exports = router;
