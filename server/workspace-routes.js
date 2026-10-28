/* MNG ERP — Agency OS / iPlay Workspace REST endpoints (MariaDB workPool) */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { workPool } = require('./db');

const router = express.Router();
const J = (x, fb) => { if (x == null) return fb; if (typeof x !== 'string') return x; try { return JSON.parse(x); } catch { return fb; } };
const numid = fid => parseInt(String(fid ?? '').replace(/^[a-z]+/i, ''), 10) || 0;
const escS = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LEAD_ROLES = ['super_admin', 'admin', 'manager'];

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const SAFE_EXT_RE = /^\.(png|jpe?g|gif|webp|pdf|txt|csv|json|zip|docx?|xlsx?|pptx?|mp4|mp3)$/i;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

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

async function resolveActorTeamId(req) {
  if (!req?.user) return 1;
  try {
    if (req.user.email) {
      const [rows] = await workPool.query('SELECT id FROM erp_team WHERE LOWER(email)=LOWER(?) LIMIT 1', [req.user.email]);
      if (rows.length) return rows[0].id;
    }
    if (req.user.user_id) {
      const [rows] = await workPool.query('SELECT id FROM erp_team WHERE auth_user_id=? LIMIT 1', [req.user.user_id]);
      if (rows.length) return rows[0].id;
    }
  } catch {}
  return 1;
}

async function logActivity(text, reqOrTeamId = 1) {
  try {
    const tid = (reqOrTeamId && typeof reqOrTeamId === 'object' && 'user' in reqOrTeamId)
      ? await resolveActorTeamId(reqOrTeamId)
      : (reqOrTeamId || 1);
    await workPool.query('INSERT INTO erp_activity (team_id, text) VALUES (?,?)', [tid, text]);
  } catch {}
}

const shapeChannel = r => ({
  id: 'ch' + r.id,
  slug: r.slug,
  name: r.name,
  emoji: r.emoji || '💬',
  topic: r.topic || '',
  type: r.chan_type || 'group',
  members: J(r.members, []),
  projectId: r.project_id ? 'p' + r.project_id : null,
  pinned: !!r.pinned,
  unread: 0,
});

const shapeMessage = r => ({
  id: 'm' + r.id,
  channelId: 'ch' + r.channel_id,
  senderId: r.sender_id || 'u1',
  authorId: r.sender_id || 'u1',
  senderName: r.sender_name || '',
  kind: r.kind || 'text',
  body: r.body,
  text: r.body,
  replyTo: r.reply_to ? 'm' + r.reply_to : null,
  attachmentUrl: r.attachment_url || null,
  attachmentName: r.attachment_name || null,
  attachmentType: r.attachment_type || null,
  attachmentSize: +r.attachment_size || 0,
  pinned: !!r.pinned,
  reactions: J(r.reactions, {}),
  editedAt: r.edited_at ? String(r.edited_at).slice(0, 16) : null,
  at: String(r.created_at || '').slice(0, 16),
});

const shapeFile = r => ({
  id: 'f' + r.id,
  channelId: r.channel_id ? 'ch' + r.channel_id : null,
  projectId: r.project_id ? 'p' + r.project_id : null,
  taskId: r.task_id ? 't' + r.task_id : null,
  uploaderId: r.uploader_id || 'u1',
  uploaderName: r.uploader_name || '',
  name: r.name,
  mime: r.mime || 'application/octet-stream',
  size: +r.size || 0,
  url: r.url,
  source: r.source || 'upload',
  at: String(r.created_at || '').slice(0, 16),
});

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
  if (!LEAD_ROLES.includes(req.user?.role)) return res.status(403).json({ error: 'เฉพาะ Admin/Manager เท่านั้นที่จัดการ AI Agent ได้' });
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
    await logActivity(`เพิ่ม AI Agent <b>${escS(b.name.trim())}</b> เข้าทีม`, req);
    res.status(201).json({ id: 'ai' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/ai/agents/:id', async (req, res) => {
  if (!LEAD_ROLES.includes(req.user?.role)) return res.status(403).json({ error: 'เฉพาะ Admin/Manager เท่านั้นที่จัดการ AI Agent ได้' });
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
  if (!LEAD_ROLES.includes(req.user?.role)) return res.status(403).json({ error: 'เฉพาะ Admin/Manager เท่านั้นที่จัดการ AI Agent ได้' });
  try {
    await workPool.query('DELETE FROM erp_ai_agents WHERE id=?', [numid(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/toggle-all', async (req, res) => {
  if (!LEAD_ROLES.includes(req.user?.role)) return res.status(403).json({ error: 'เฉพาะ Admin/Manager เท่านั้นที่ควบคุม AI ทั้งทีมได้' });
  const paused = req.body?.paused ? 1 : 0;
  try {
    await workPool.query('UPDATE erp_ai_agents SET paused = ?', [paused]);
    await logActivity(paused ? 'หยุดพักการทำงาน AI Workforce ทั้งทีมชั่วคราว' : 'เปิดเดินเครื่อง AI Workforce ทั้งทีม', req);
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
    if (Number(ag.paused)) return res.status(409).json({ error: 'AI Agent ถูกพักไว้' });
    let taskTitle = '';
    let taskCode = '';
    if (tid) {
      const [tRows] = await workPool.query('SELECT title, erp_code FROM tasks WHERE id=?', [tid]);
      if (tRows.length) { taskTitle = tRows[0].title; taskCode = tRows[0].erp_code || ('MNG-' + (1000 + tid)); }
      await workPool.query("UPDATE tasks SET erp_ai_agent = ? WHERE id = ? AND (erp_ai_agent IS NULL OR erp_ai_agent = '')", ['ai' + aid, tid]).catch(() => {});
    }
    // Endpoint เดิมเป็นการจำลอง ไม่ใช่ provider: ห้ามแสดงผลหรือตัวเลขว่า AI รันจริง
    const tokens = 0, dur = 0;
    const rawCmd = String(b.action || b.instruction || b.prompt || '').trim();
    const action = rawCmd || (taskCode ? `ตัวอย่างคำสั่งสำหรับ ${taskCode}` : `ตัวอย่างคำสั่งสำหรับ ${ag.name}`);
    const context = b.detail ? String(b.detail).trim().slice(0, 2000) : (taskTitle ? `งานที่เลือก: ${taskTitle}` : 'ไม่มีบริบทเพิ่มเติม');
    const detail = `จำลองเท่านั้น — ไม่ได้เรียก AI หรือทำงานจริง · ${context}`;

    const [ins] = await workPool.query(
      `INSERT INTO erp_ai_runs (agent_id, task_id, action, detail, duration_sec, tokens, status)
       VALUES (?,?,?,?,?,?,'simulated')`,
      [aid, tid, action.slice(0, 155), detail, dur, tokens]
    );
    await workPool.query('UPDATE erp_ai_agents SET runs = runs + 1, tokens_today = tokens_today + ? WHERE id = ?', [tokens, aid]);

    // ค่า false สำคัญต่อความเป็นส่วนตัว: ห้ามโพสต์คำสั่งไปห้องรวมเมื่อผู้เรียกปิดไว้
    if (b.postToFeed !== false) {
      const [ch] = await workPool.query("SELECT id FROM erp_channels WHERE slug IN ('ai-feed','team-all') ORDER BY slug='ai-feed' DESC LIMIT 1");
      if (ch.length) {
        await workPool.query(
          `INSERT INTO erp_messages (channel_id, sender_id, sender_name, kind, body, reactions)
           VALUES (?,?,?,'ai',?,'{"⚡":["u1"]}')`,
          [ch[0].id, 'ai' + aid, `${ag.name} (AI)`, `✨ <b>${escS(ag.name)}</b>: <b>${escS(action)}</b>${taskCode ? ` (${escS(taskCode)})` : ''} — ${escS(detail)}`]
        );
      }
    }
    await logActivity(`🤖 <b>${escS(ag.name)}</b> บันทึกคำสั่งจำลอง: ${escS(action)}`, req);
    res.json({ ok: true, simulated: true, id: 'run' + ins.insertId, tokens, durationSec: dur, detail });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- TEAM CHAT, DMs & REAL-TIME SYNC (i.playdigital.co.th PARITY) ---------- */
router.get('/chat/sync', async (_req, res) => {
  try {
    const [chanR] = await workPool.query('SELECT * FROM erp_channels ORDER BY COALESCE(pinned,0) DESC, id ASC');
    const [msgR]  = await workPool.query('SELECT * FROM erp_messages ORDER BY id ASC LIMIT 400');
    const [fileR] = await workPool.query('SELECT * FROM erp_files ORDER BY id DESC LIMIT 120');
    const [setR]  = await workPool.query('SELECT data FROM erp_settings WHERE id = 1');
    const st = J(setR[0]?.data, {}) || {};
    res.json({
      channels: chanR.map(shapeChannel),
      messages: msgR.map(shapeMessage),
      files: fileR.map(shapeFile),
      driveFolder: st.driveFolder || 'https://drive.google.com/drive/u/0/my-drive',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/channels', async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'name_required' });
  const name = b.name.trim().replace(/^#+/, '');
  const type = b.type === 'dm' ? 'dm' : 'group';
  const slug = (b.slug || name).trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, '-').replace(/^-+|-+$/g, '') || ('ch-' + Date.now());
  const members = Array.isArray(b.members) ? b.members : ['u1'];
  const projId = b.projectId ? numid(b.projectId) : null;
  try {
    if (type === 'dm') {
      const [ex] = await workPool.query("SELECT id FROM erp_channels WHERE slug=? AND chan_type='dm' LIMIT 1", [slug]);
      if (ex.length) return res.json({ id: 'ch' + ex[0].id, existed: true });
    }
    const [r] = await workPool.query(
      `INSERT INTO erp_channels (slug, name, emoji, topic, chan_type, members, project_id, pinned, is_private)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [slug, name, b.emoji || (type === 'dm' ? '💬' : '💬'), b.topic || '', type,
       JSON.stringify(members), projId, b.pinned ? 1 : 0, b.isPrivate ? 1 : 0]
    );
    const chanId = r.insertId;
    if (type === 'group') {
      const actorTid = await resolveActorTeamId(req);
      const sysBody = `สร้างกลุ่ม #${name} แล้ว — เชิญทุกคนแชร์งานและไฟล์ผ่าน Google Drive ที่นี่`;
      await workPool.query(
        `INSERT INTO erp_messages (channel_id, sender_id, sender_name, kind, body, pinned, reactions)
         VALUES (?, ?, ?, 'system', ?, 0, '{}')`,
        [chanId, 'u' + actorTid, req.user?.name || 'System', sysBody]
      );
      await logActivity(`💬 สร้างกลุ่มแชต <b>#${escS(name)}</b>`, req);
    }
    res.status(201).json({ id: 'ch' + chanId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/channels/dm', async (req, res) => {
  const b = req.body || {};
  const targetId = String(b.targetId || '').trim();
  if (!targetId) return res.status(400).json({ error: 'target_required' });
  try {
    const actorTid = await resolveActorTeamId(req);
    const meId = String(b.meId || ('u' + actorTid));
    const pair = [meId, targetId].sort();
    const slug = `dm-${pair[0]}-${pair[1]}`;
    const [ex] = await workPool.query('SELECT id FROM erp_channels WHERE slug=? LIMIT 1', [slug]);
    if (ex.length) return res.json({ id: 'ch' + ex[0].id, existed: true });

    const targetName = String(b.targetName || targetId).trim();
    const isAi = targetId.startsWith('ai');
    const emoji = isAi ? '🤖' : '💬';
    const topic = isAi
      ? `สนทนาส่วนตัวกับ AI Co-pilot (${targetName})`
      : `ข้อความส่วนตัว (Direct Message)`;
    const [r] = await workPool.query(
      `INSERT INTO erp_channels (slug, name, emoji, topic, chan_type, members, pinned, is_private)
       VALUES (?,?,?,?,'dm',?,0,1)`,
      [slug, targetName, emoji, topic, JSON.stringify(pair)]
    );
    if (isAi) {
      await workPool.query(
        `INSERT INTO erp_messages (channel_id, sender_id, sender_name, kind, body, pinned, reactions)
         VALUES (?, ?, ?, 'ai', ?, 0, '{}')`,
        [r.insertId, targetId, `${targetName} (AI)`,
         `✨ ห้องนี้ใช้คำตอบจากแม่แบบ ไม่ได้เรียกโมเดล AI จริง หากต้องการให้ AI ช่วยร่าง ให้ใช้ Project Flow → AI & ส่งออก`]
      );
    }
    res.status(201).json({ id: 'ch' + r.insertId, created: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/channels/:id', async (req, res) => {
  const cid = numid(req.params.id);
  const b = req.body || {};
  if (!cid) return res.status(400).json({ error: 'bad_id' });
  const sets = [], vals = [];
  if (b.name !== undefined && String(b.name).trim()) { sets.push('name=?'); vals.push(String(b.name).trim().replace(/^#+/, '')); }
  if (b.emoji !== undefined)     { sets.push('emoji=?');      vals.push(b.emoji || '💬'); }
  if (b.topic !== undefined)     { sets.push('topic=?');      vals.push(b.topic || ''); }
  if (b.pinned !== undefined)    { sets.push('pinned=?');     vals.push(b.pinned ? 1 : 0); }
  if (b.members !== undefined)   { sets.push('members=?');    vals.push(JSON.stringify(Array.isArray(b.members) ? b.members : [])); }
  if (b.projectId !== undefined) { sets.push('project_id=?'); vals.push(b.projectId ? numid(b.projectId) : null); }
  if (!sets.length) return res.json({ ok: true });
  try {
    vals.push(cid);
    await workPool.query(`UPDATE erp_channels SET ${sets.join(', ')} WHERE id=?`, vals);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/channels/:id', async (req, res) => {
  const cid = numid(req.params.id);
  if (!cid) return res.status(400).json({ error: 'bad_id' });
  try {
    const [[cnt]] = await workPool.query("SELECT COUNT(*) c FROM erp_channels WHERE COALESCE(chan_type,'group')='group'");
    const [cur] = await workPool.query('SELECT slug, name, chan_type FROM erp_channels WHERE id=?', [cid]);
    if (!cur.length) return res.status(404).json({ error: 'not_found' });
    if (cur[0].chan_type !== 'dm' && cnt.c <= 1) {
      return res.status(400).json({ error: 'ต้องเหลือห้องกลุ่มอย่างน้อย 1 ห้อง' });
    }
    await workPool.query('DELETE FROM erp_messages WHERE channel_id=?', [cid]);
    await workPool.query('DELETE FROM erp_channels WHERE id=?', [cid]);
    await logActivity(`ลบห้องแชต <b>#${escS(cur[0].name)}</b>`, req);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/channels/:id/messages', async (req, res) => {
  const cid = numid(req.params.id);
  const b = req.body || {};
  const rawBody = String(b.body ?? b.text ?? '').trim();
  const hasAttach = !!(b.attachmentUrl || b.attachment_url);
  if (!rawBody && !hasAttach) return res.status(400).json({ error: 'body_required' });
  try {
    const actorTid = await resolveActorTeamId(req);
    const senderName = b.senderName || req.user?.name || 'สมาชิกทีม';
    const senderId = b.senderId || b.authorId || ('u' + actorTid);
    const replyTo = b.replyTo ? numid(b.replyTo) : null;
    const attUrl = b.attachmentUrl || b.attachment_url || null;
    const attName = b.attachmentName || b.attachment_name || null;
    const attType = b.attachmentType || b.attachment_type || null;
    const attSize = Number(b.attachmentSize || b.attachment_size || 0);
    const bodyText = rawBody || (attName ? `แนบไฟล์: ${attName}` : '');

    const [r] = await workPool.query(
      `INSERT INTO erp_messages
         (channel_id, sender_id, sender_name, kind, body, reply_to, attachment_url, attachment_name, attachment_type, attachment_size, pinned, reactions)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,'{}')`,
      [cid, senderId, senderName, b.kind || 'text', bodyText, replyTo, attUrl, attName, attType, attSize]
    );
    res.status(201).json({ id: 'm' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/messages/:id/react', async (req, res) => {
  const mid = numid(req.params.id);
  const emoji = String(req.body?.emoji || '👍');
  const actorTid = await resolveActorTeamId(req);
  const uid = String(req.body?.userId || ('u' + actorTid));
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
  const b = req.body || {};
  const sets = [], vals = [];
  if (b.pinned !== undefined) { sets.push('pinned=?'); vals.push(b.pinned ? 1 : 0); }
  if (b.body !== undefined || b.text !== undefined) {
    const txt = String(b.body ?? b.text ?? '').trim();
    if (!txt) return res.status(400).json({ error: 'body_required' });
    sets.push('body=?', 'edited_at=NOW()');
    vals.push(txt);
  }
  if (!sets.length) return res.json({ ok: true });
  try {
    vals.push(mid);
    await workPool.query(`UPDATE erp_messages SET ${sets.join(', ')} WHERE id=?`, vals);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/messages/:id', async (req, res) => {
  try {
    await workPool.query('DELETE FROM erp_messages WHERE id=?', [numid(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- GOOGLE DRIVE & WORKSPACE FILES (i.playdigital.co.th /api/drive PARITY) ---------- */
router.get('/drive', async (req, res) => {
  try {
    const chanFilter = req.query.channelId ? numid(req.query.channelId) : null;
    const [setR] = await workPool.query('SELECT data FROM erp_settings WHERE id = 1');
    const st = J(setR[0]?.data, {}) || {};
    const folder = st.driveFolder || 'https://drive.google.com/drive/u/0/my-drive';
    const [rows] = chanFilter
      ? await workPool.query('SELECT * FROM erp_files WHERE channel_id=? ORDER BY id DESC LIMIT 120', [chanFilter])
      : await workPool.query('SELECT * FROM erp_files ORDER BY id DESC LIMIT 120');
    res.json({
      source: 'workspace',
      folder,
      files: rows.map(shapeFile),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/drive/folder', async (req, res) => {
  const folder = String(req.body?.folder || '').trim();
  if (!folder) return res.status(400).json({ error: 'folder_required' });
  try {
    const [cur] = await workPool.query('SELECT data FROM erp_settings WHERE id=1');
    const data = { ...J(cur[0]?.data, {}), driveFolder: folder };
    await workPool.query(
      'INSERT INTO erp_settings (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data=?',
      [JSON.stringify(data), JSON.stringify(data)]
    );
    await logActivity(`อัปเดตลิงก์โฟลเดอร์ Google Drive กลางของทีม`, req);
    res.json({ ok: true, folder });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/files/upload', async (req, res) => {
  const b = req.body || {};
  const rawName = String(b.name || 'file.bin').trim();
  const dataStr = String(b.dataBase64 || b.dataUrl || '');
  if (!dataStr) return res.status(400).json({ error: 'file_data_required' });

  const ext = path.extname(rawName).toLowerCase() || '.bin';
  if (!SAFE_EXT_RE.test(ext)) {
    return res.status(400).json({ error: `ไม่รองรับนามสกุลไฟล์ ${ext} (รองรับรูปภาพ, PDF, Office, CSV, TXT, ZIP, MP4, MP3)` });
  }

  try {
    const base64Payload = dataStr.includes(',') ? dataStr.split(',').pop() : dataStr;
    const buf = Buffer.from(base64Payload, 'base64');
    if (!buf.length) return res.status(400).json({ error: 'empty_file' });
    if (buf.length > MAX_UPLOAD_BYTES) return res.status(413).json({ error: 'ไฟล์มีขนาดเกิน 8 MB' });

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const cleanStem = path.basename(rawName, path.extname(rawName))
      .replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_')
      .slice(0, 48) || 'attachment';
    const storedName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${cleanStem}${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, storedName), buf);

    const url = `/uploads/${storedName}`;
    const mime = String(b.mime || (ext.match(/\.(png|jpe?g|gif|webp)$/i) ? `image/${ext.slice(1).replace('jpg','jpeg')}` : 'application/octet-stream'));
    const actorTid = await resolveActorTeamId(req);
    const uploaderId = b.uploaderId || ('u' + actorTid);
    const uploaderName = b.uploaderName || req.user?.name || 'สมาชิกทีม';
    const cid = b.channelId ? numid(b.channelId) : null;
    const pid = b.projectId ? numid(b.projectId) : null;
    const tid = b.taskId ? numid(b.taskId) : null;

    const [ins] = await workPool.query(
      `INSERT INTO erp_files (channel_id, project_id, task_id, uploader_id, uploader_name, name, mime, size, url, source)
       VALUES (?,?,?,?,?,?,?,?,?,'upload')`,
      [cid, pid, tid, uploaderId, uploaderName, rawName.slice(0, 250), mime.slice(0, 115), buf.length, url]
    );
    res.status(201).json({
      id: 'f' + ins.insertId,
      name: rawName,
      mime,
      size: buf.length,
      url,
      source: 'upload',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/files/drive-link', async (req, res) => {
  const b = req.body || {};
  const url = String(b.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'กรุณาระบุ URL ที่ขึ้นต้นด้วย https://' });
  const name = String(b.name || 'ไฟล์ Google Drive').trim().slice(0, 250);
  try {
    const actorTid = await resolveActorTeamId(req);
    const uploaderId = b.uploaderId || ('u' + actorTid);
    const uploaderName = b.uploaderName || req.user?.name || 'สมาชิกทีม';
    const cid = b.channelId ? numid(b.channelId) : null;
    const pid = b.projectId ? numid(b.projectId) : null;
    const [ins] = await workPool.query(
      `INSERT INTO erp_files (channel_id, project_id, uploader_id, uploader_name, name, mime, size, url, source)
       VALUES (?,?,?,?,?,'application/vnd.google-apps.file',0,?,'drive')`,
      [cid, pid, uploaderId, uploaderName, name, url]
    );
    res.status(201).json({
      id: 'f' + ins.insertId,
      name,
      mime: 'application/vnd.google-apps.file',
      size: 0,
      url,
      source: 'drive',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/files/:id', async (req, res) => {
  const fid = numid(req.params.id);
  if (!fid) return res.status(400).json({ error: 'bad_id' });
  try {
    const [rows] = await workPool.query('SELECT url, source FROM erp_files WHERE id=?', [fid]);
    if (rows.length && rows[0].source === 'upload' && String(rows[0].url).startsWith('/uploads/')) {
      const localPath = path.join(UPLOADS_DIR, path.basename(rows[0].url));
      try { if (fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch {}
    }
    await workPool.query('DELETE FROM erp_files WHERE id=?', [fid]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- HR ATTENDANCE & LEAVES ---------- */
router.post(['/checkins/clock', '/checkins/in'], async (req, res) => {
  const b = req.body || {};
  const actorTid = await resolveActorTeamId(req);
  const memberId = b.memberId || ('u' + actorTid);
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
    await logActivity(`⏱ ลงเวลาเข้างาน (${b.mode === 'wfh' ? 'WFH' : 'เข้าออฟฟิศ'}) เวลา <b>${time}</b>`, req);
    res.json({ ok: true, clockIn: time });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post(['/checkins/clock-out', '/checkins/out'], async (req, res) => {
  const b = req.body || {};
  const actorTid = await resolveActorTeamId(req);
  const memberId = b.memberId || ('u' + actorTid);
  const now = bkkNow();
  const today = b.date || now.date;
  const time = b.time || now.time;
  try {
    await workPool.query('UPDATE erp_checkins SET clock_out=? WHERE member_id=? AND date=?', [time, memberId, today]);
    await workPool.query("UPDATE erp_team SET presence = 'away' WHERE id = ?", [numid(memberId)]).catch(() => {});
    await logActivity(`👋 ลงเวลาออกงาน เวลา <b>${time}</b>`, req);
    res.json({ ok: true, clockOut: time });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/leaves', async (req, res) => {
  const b = req.body || {};
  if (!b.startDate || !b.endDate) return res.status(400).json({ error: 'dates_required' });
  try {
    const actorTid = await resolveActorTeamId(req);
    const [r] = await workPool.query(
      `INSERT INTO erp_leaves (member_id, kind, start_date, end_date, days, reason, status)
       VALUES (?,?,?,?,?,?,'pending')`,
      [b.memberId || ('u' + actorTid), b.kind || 'annual', b.startDate, b.endDate, Number(b.days) || 1, b.reason || '']
    );
    await logActivity(`🌿 ยื่นคำขอลา/WFH (${escS(b.kind || 'annual')}) วันที่ ${escS(b.startDate)}`, req);
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
    await logActivity(`${status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'}ใบลา #${id}`, req);
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
    await logActivity(`🚪 เพิ่มห้อง/อุปกรณ์ <b>${escS(b.name.trim())}</b>`, req);
    res.status(201).json({ id: 'rm' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/rooms/:id', async (req, res) => {
  const rid = numid(req.params.id);
  const b = req.body || {};
  if (!rid) return res.status(400).json({ error: 'bad_id' });
  const sets = [], vals = [];
  if (b.name !== undefined && String(b.name).trim()) { sets.push('name=?'); vals.push(String(b.name).trim()); }
  if (b.kind !== undefined)     { sets.push('kind=?');     vals.push(b.kind || 'room'); }
  if (b.zone !== undefined)     { sets.push('zone=?');     vals.push(b.zone || ''); }
  if (b.capacity !== undefined) { sets.push('capacity=?'); vals.push(Number(b.capacity) || 4); }
  if (b.color !== undefined)    { sets.push('color=?');    vals.push(b.color || '#6C5CE7'); }
  if (b.equip !== undefined)    { sets.push('equip=?');    vals.push(JSON.stringify(b.equip || [])); }
  if (!sets.length) return res.json({ ok: true });
  try {
    vals.push(rid);
    await workPool.query(`UPDATE erp_rooms SET ${sets.join(', ')} WHERE id=?`, vals);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/rooms/:id', async (req, res) => {
  if (!LEAD_ROLES.includes(req.user?.role)) return res.status(403).json({ error: 'เฉพาะ Admin/Manager' });
  const rid = numid(req.params.id);
  if (!rid) return res.status(400).json({ error: 'bad_id' });
  try {
    await workPool.query('DELETE FROM erp_bookings WHERE room_id=?', [rid]);
    await workPool.query('DELETE FROM erp_rooms WHERE id=?', [rid]);
    res.json({ ok: true });
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
    const actorTid = await resolveActorTeamId(req);
    const hostId = b.hostId || ('u' + actorTid);
    const [r] = await workPool.query(
      `INSERT INTO erp_bookings (room_id, title, date, start, end, host_id, members, note)
       VALUES (?,?,?,?,?,?,?,?)`,
      [rid, b.title.trim(), b.date, start, end, hostId, JSON.stringify(b.members || [hostId]), b.note || null]
    );
    await logActivity(`🚪 จองห้อง/อุปกรณ์ <b>${escS(b.title.trim())}</b> วันที่ ${escS(b.date)} (${start}–${end})`, req);
    res.status(201).json({ id: 'bk' + r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/bookings/:id', async (req, res) => {
  try {
    await workPool.query('DELETE FROM erp_bookings WHERE id=?', [numid(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* แยก Project Flow, Docs และงานดำเนินการจริงไว้ใน router เฉพาะ */
router.use(require('./project-workspace-routes'));
router.use(require('./flow-action-routes'));

module.exports = router;
