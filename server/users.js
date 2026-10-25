/* MNG ERP — จัดการผู้ใช้ (Admin) + เปลี่ยนรหัสผ่านตัวเอง
   อ่าน/เขียนตาราง pacific_mng.users โดยตรง — ไม่แก้ schema (ไม่ต้อง grant เพิ่ม) */
const express = require('express');
const bcrypt  = require('bcryptjs');
const { authPool, workPool } = require('./db');

const router = express.Router();
const ADMIN_ROLES  = ['super_admin', 'admin'];
const VALID_ROLES  = ['super_admin', 'admin', 'manager', 'user', 'viewer'];
const VALID_STATUS = ['active', 'inactive', 'suspended', 'pending'];
const EMAIL_RE     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isAdmin = req => ADMIN_ROLES.includes(req.user?.role);
const isSuper = req => req.user?.role === 'super_admin';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function guardAdmin(req, res) {
  if (!isAdmin(req)) { res.status(403).json({ error: 'สิทธิ์ไม่พอ — เฉพาะ Admin ขึ้นไป' }); return false; }
  return true;
}
async function userLog(req, text) {
  try { await workPool.query('INSERT INTO erp_activity (team_id, text) VALUES (1, ?)', [`<b>${esc(req.user.name)}</b> · ${text}`]); } catch {}
}
const shape = r => ({
  id: 'u' + r.id, authId: r.id, email: r.email, name: r.name, phone: r.phone,
  role: r.role, status: r.status, avatar: r.avatar, lastLogin: r.last_login_at, created: r.created_at,
});

/* ---- self: เปลี่ยนรหัสผ่านของฉัน (ทุกคน / ต้องก่อน /:id) ---- */
router.post('/me/password', async (req, res) => {
  try {
    const b = req.body || {};
    const cur = String(b.current ?? b.oldPassword ?? '');
    const nw  = String(b.password ?? b.newPassword ?? '');
    if (!cur) return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านปัจจุบัน' });
    if (nw.length < 6) return res.status(400).json({ error: 'รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร' });
    const [rows] = await authPool.query('SELECT id, password, email FROM users WHERE id = ?', [req.user.user_id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const ok = await bcrypt.compare(cur, rows[0].password);
    if (!ok) return res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    const hash = await bcrypt.hash(nw, 12);
    await authPool.query('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.user_id]);
    // เคลียร์ session อื่นของตัวเอง เก็บไว้แค่อันที่ใชู่
    await workPool.query('DELETE FROM erp_sessions WHERE user_id = ? AND token <> ?', [req.user.user_id, req.token]).catch(() => {});
    await userLog(req, 'เปลี่ยนรหัสผ่านของตัวเอง');
    res.json({ ok: true });
  } catch (e) { console.error('[users/me/password]', e.message); res.status(500).json({ error: 'server_error' }); }
});

/* ---- self: อัพเดตรูปโปรไฟล์ (URL หรือ base64 data URL หรือค่าว่างเพื่อลบรูป) ---- */
router.patch('/me/avatar', async (req, res) => {
  try {
    const raw = (req.body || {}).avatar;
    const url = raw == null ? '' : String(raw).trim();
    if (!url) {
      await authPool.query('UPDATE users SET avatar = NULL WHERE id = ?', [req.user.user_id]);
      await userLog(req, 'ลบรูปโปรไฟล์');
      return res.json({ ok: true, avatar: null });
    }
    // ตรวจสอบว่าเป็น URL หรือ data URL ที่ถูกต้อง
    const isDataUrl = /^data:image\/(png|jpe?g|gif|webp);base64,/.test(url);
    const isHttpUrl = /^https?:\/\/.+/.test(url) || /^\/uploads\/.+/.test(url);
    if (!isDataUrl && !isHttpUrl)
      return res.status(400).json({ error: 'ต้องเป็น URL (https://...) หรือ base64 data URL (data:image/...;base64,...)' });
    // จำกัดขนาด base64 (~2MB)
    if (isDataUrl && url.length > 2_800_000)
      return res.status(413).json({ error: 'รูปใหญ่เกินไป (สูงสุด ~2MB)' });
    await authPool.query('UPDATE users SET avatar = ? WHERE id = ?', [url, req.user.user_id]);
    await userLog(req, 'เปลี่ยนรูปโปรไฟล์');
    res.json({ ok: true, avatar: url });
  } catch (e) { console.error('[users/me/avatar]', e.message); res.status(500).json({ error: 'server_error' }); }
});

/* ---- admin: เปลี่ยนรูปโปรไฟล์ให้ user อื่น ---- */
router.patch('/:id/avatar', async (req, res) => {
  if (!guardAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    const raw = (req.body || {}).avatar;
    const url = raw == null ? '' : String(raw).trim();
    const [t] = await authPool.query('SELECT id, name FROM users WHERE id = ?', [id]);
    if (!t.length) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    if (!url) {
      await authPool.query('UPDATE users SET avatar = NULL WHERE id = ?', [id]);
      await userLog(req, `ลบรูปโปรไฟล์ของ <b>${esc(t[0].name)}</b>`);
      return res.json({ ok: true, avatar: null });
    }
    const isDataUrl = /^data:image\/(png|jpe?g|gif|webp);base64,/.test(url);
    const isHttpUrl = /^https?:\/\/.+/.test(url) || /^\/uploads\/.+/.test(url);
    if (!isDataUrl && !isHttpUrl)
      return res.status(400).json({ error: 'ต้องเป็น URL (https://...) หรือ base64 data URL (data:image/...;base64,...)' });
    if (isDataUrl && url.length > 2_800_000)
      return res.status(413).json({ error: 'รูปใหญ่เกินไป (สูงสุด ~2MB)' });
    await authPool.query('UPDATE users SET avatar = ? WHERE id = ?', [url, id]);
    await userLog(req, `เปลี่ยนรูปโปรไฟล์ให้ <b>${esc(t[0].name)}</b>`);
    res.json({ ok: true, avatar: url });
  } catch (e) { console.error('[users/avatar]', e.message); res.status(500).json({ error: 'server_error' }); }
});

/* ---- self: ตัวตนปัจจุบัน (สดจาก auth DB ผ่าน middleware) ---- */
router.get('/me', (req, res) => {
  const u = req.user;
  res.json({ id: 'u' + u.user_id, authId: u.user_id, name: u.name, email: u.email, role: u.role, avatar: u.avatar });
});

/* ---- admin: รายชื่อผู้ใช้ ---- */
router.get('/', async (req, res) => {
  if (!guardAdmin(req, res)) return;
  try {
    const [rows] = await authPool.query(
      'SELECT id, email, name, phone, role, status, avatar, last_login_at, created_at FROM users ORDER BY id');
    res.json(rows.map(shape));
  } catch (e) { console.error('[users/list]', e.message); res.status(500).json({ error: 'server_error' }); }
});

/* ---- admin: สร้างผู้ใช้ ---- */
router.post('/', async (req, res) => {
  if (!guardAdmin(req, res)) return;
  try {
    const b = req.body || {};
    if (!b.email || typeof b.email !== 'string') return res.status(400).json({ error: 'ต้องระบุอีเมล' });
    if (!b.role || !VALID_ROLES.includes(b.role)) return res.status(400).json({ error: `ต้องเลือกสิทธิ์: ${VALID_ROLES.join(', ')}` });
    const email = String(b.email || '').trim().toLowerCase();
    const name  = String(b.name || '').trim();
    const pw    = String(b.password || '');
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    if (!name)                return res.status(400).json({ error: 'กรุณากรอกชื่อ' });
    if (!pw || pw === 'null' || pw === 'undefined' || pw.length < 6)
      return res.status(400).json({ error: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร (ต้องตั้งให้ใช้งาน)' });
    const role = b.role;
    if (role === 'super_admin' && !isSuper(req))
      return res.status(403).json({ error: 'เฉพาะ Super Admin เท่านั้นที่สร้าง Super Admin ได้' });
    const hash = await bcrypt.hash(pw, 12);
    const [r] = await authPool.query(
      "INSERT INTO users (email, password, name, phone, role, status, email_verified_at) VALUES (?,?,?,?,?, 'active', NOW())",
      [email, hash, name, b.phone ? String(b.phone).trim() : null, role]);
    await userLog(req, `สร้างผู้ใช้ใหม่ <b>${esc(name)}</b> (${esc(email)}) สิทธิ์ <b>${role}</b>`);
    res.status(201).json({ id: 'u' + r.insertId, authId: r.insertId, email, name, phone: b.phone || null, role, status: 'active', lastLogin: null, created: null });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'อีเมลนี้มีผู้ใช้อยู่แล้ว' });
    console.error('[users/create]', e.message); res.status(500).json({ error: 'server_error' });
  }
});

/* ---- admin: แก้ไขผู้ใช้ (ชื่อ/อีเมล/เบอร์/สิทธิ์/สถานะ) ---- */
router.patch('/:id', async (req, res) => {
  if (!guardAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    const [t] = await authPool.query('SELECT id, email, name, role, status, avatar FROM users WHERE id = ?', [id]);
    if (!t.length) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    const target = t[0];
    const self = target.id === req.user.user_id;
    const b = req.body || {};

    // เฉพาะ super_admin เท่านั้นที่แตะบัญชี super_admin อื่นได้
    if (target.role === 'super_admin' && !self && !isSuper(req))
      return res.status(403).json({ error: 'แก้ไขบัญชี Super Admin อื่นต้องเป็น Super Admin เท่านั้น' });

    const sets = [], vals = [];
    const changes = [];
    if (b.name != null && String(b.name).trim() && String(b.name).trim() !== target.name) {
      sets.push('name = ?'); vals.push(String(b.name).trim()); changes.push('ชื่อ');
    }
    if (b.email != null) {
      const em = String(b.email).trim().toLowerCase();
      if (!EMAIL_RE.test(em)) return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
      if (em !== target.email) { sets.push('email = ?'); vals.push(em); changes.push('อีเมล'); }
    }
    if (b.phone !== undefined) { sets.push('phone = ?'); vals.push(b.phone ? String(b.phone).trim() : null); changes.push('เบอร์'); }
    if (b.avatar !== undefined) { sets.push('avatar = ?'); vals.push(b.avatar ? String(b.avatar).trim() : null); changes.push('รูปโปรไฟล์'); }
    if (b.role != null && b.role !== target.role) {
      if (!VALID_ROLES.includes(b.role)) return res.status(400).json({ error: 'สิทธิ์ไม่ถูกต้อง' });
      if (self) return res.status(400).json({ error: 'เปลี่ยนสิทธิ์ของตัวเองไม่ได้ — ให้ Super Admin คนอื่นช่วย' });
      if ((b.role === 'super_admin' || target.role === 'super_admin') && !isSuper(req))
        return res.status(403).json({ error: 'จัดการสิทธิ์ Super Admin ต้องเป็น Super Admin' });
      sets.push('role = ?'); vals.push(b.role); changes.push(`สิทธิ์→${b.role}`);
    }
    if (b.status != null && b.status !== target.status) {
      if (!VALID_STATUS.includes(b.status)) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
      if (self) return res.status(400).json({ error: 'เปลี่ยนสถานะของตัวเองไม่ได้' });
      sets.push('status = ?'); vals.push(b.status); changes.push(`สถานะ→${b.status}`);
      if (b.status !== 'active') await workPool.query('DELETE FROM erp_sessions WHERE user_id = ?', [id]).catch(() => {});
    }
    if (!sets.length) return res.json({ ok: true, unchanged: true });
    vals.push(id);
    try { await authPool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals); }
    catch (e) { if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'อีเมลนี้มีผู้ใช้อยู่แล้ว' }); throw e; }
    // ทำให้ session เก่าเห็นข้อมูล/สิทธิ์ใหม่ (role ตรวจสดทุก request อยู่แล้ว แต่ว่า name ด้วย)
    await workPool.query('UPDATE erp_sessions SET name = COALESCE(?, name), email = COALESCE(?, email), role = COALESCE(?, role) WHERE user_id = ?',
      [sets.includes('name = ?')  ? String(b.name).trim() : null,
       sets.includes('email = ?') ? String(b.email).trim().toLowerCase() : null,
       sets.includes('role = ?')  ? b.role : null, id]).catch(() => {});
    await userLog(req, `แก้ไขผู้ใช้ <b>${esc(target.name)}</b> (${changes.join(', ')})`);
    res.json({ ok: true });
  } catch (e) { console.error('[users/patch]', e.message); res.status(500).json({ error: 'server_error' }); }
});

/* ---- admin: รีเซ็ตรหัสผ่านให้ผู้ใช้ ---- */
router.post('/:id/password', async (req, res) => {
  if (!guardAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    const [t] = await authPool.query('SELECT id, name, role FROM users WHERE id = ?', [id]);
    if (!t.length) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    if (t[0].role === 'super_admin' && t[0].id !== req.user.user_id && !isSuper(req))
      return res.status(403).json({ error: 'รีเซ็ตรหัสของ Super Admin ต้องเป็น Super Admin เท่านั้น' });
    const pw = String((req.body || {}).password || '');
    if (pw.length < 6) return res.status(400).json({ error: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร' });
    const hash = await bcrypt.hash(pw, 12);
    await authPool.query('UPDATE users SET password = ? WHERE id = ?', [hash, id]);
    await workPool.query('DELETE FROM erp_sessions WHERE user_id = ?', [id]).catch(() => {});
    await userLog(req, `รีเซ็ตรหัสผ่านให้ <b>${esc(t[0].name)}</b>`);
    res.json({ ok: true });
  } catch (e) { console.error('[users/resetpw]', e.message); res.status(500).json({ error: 'server_error' }); }
});

module.exports = router;
