/* MNG ERP — โปรไฟล์ของบัญชีปัจจุบันเท่านั้น ไม่แก้ schema ฐาน auth ของ MNG Hub */
const express = require('express');
const bcrypt = require('bcryptjs');
const { authPool, workPool } = require('./db');
const { prepareTeamEmail, syncTeamEmail } = require('./team-identity');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AVATAR_BYTES = 256 * 1024;
const error = (status, message) => Object.assign(new Error(message), { status });

function text(value, max, field, multiline = false) {
  if (typeof value !== 'string') throw error(400, `${field} ไม่ถูกต้อง`);
  const out = value.trim();
  if ([...out].length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(out))
    throw error(400, `${field} ยาวเกินไปหรือมีอักขระที่ไม่รองรับ`);
  return out;
}
function bodyKeys(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k)))
    throw error(400, 'ข้อมูลที่ส่งไม่ถูกต้อง');
}
function normalizeSkills(value) {
  if (!Array.isArray(value) || value.length > 20) throw error(400, 'ระบุความสามารถได้สูงสุด 20 รายการ');
  const seen = new Set(), out = [];
  for (const item of value) {
    const skill = text(item, 40, 'ความสามารถ');
    if (!skill) continue;
    const key = skill.toLocaleLowerCase('en');
    if (!seen.has(key)) { seen.add(key); out.push(skill); }
  }
  return out;
}
function parseSkills(raw) {
  try { return normalizeSkills(JSON.parse(raw || '[]')); } catch { return []; }
}

// รับเฉพาะ JPEG ที่มีมิติไม่เกิน 1024px; เบราว์เซอร์แปลง/ย่อก่อนส่ง ไม่รับ SVG หรือไฟล์ตาม MIME อย่างเดียว
function jpegDimensions(buf) {
  if (buf.length < 10 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) return null;
  let p = 2;
  while (p + 4 <= buf.length) {
    if (buf[p++] !== 0xff) return null;
    while (p < buf.length && buf[p] === 0xff) p++;
    const marker = buf[p++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (p + 2 > buf.length) return null;
    const len = buf.readUInt16BE(p);
    if (len < 2 || p + len > buf.length) return null;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (len < 8) return null;
      const height = buf.readUInt16BE(p + 3), width = buf.readUInt16BE(p + 5);
      return width > 0 && height > 0 && width <= 1024 && height <= 1024 ? { width, height } : null;
    }
    p += len;
  }
  return null;
}
function decodeAvatar(image) {
  if (typeof image !== 'string' || image.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 32)
    throw error(400, 'รูปต้องเป็น JPEG ไม่เกิน 256 KB');
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match || match[1].length % 4 !== 0) throw error(400, 'รูปไม่ถูกต้อง กรุณาเลือกรูปอีกครั้ง');
  const buf = Buffer.from(match[1], 'base64');
  if (!buf.length || buf.length > MAX_AVATAR_BYTES || buf.toString('base64') !== match[1] || !jpegDimensions(buf))
    throw error(400, 'รูปไม่ถูกต้อง หรือมีขนาดเกิน 1024 × 1024 พิกเซล / 256 KB');
  return buf;
}

function createProfileRouter({ authPool: authDb, workPool: workDb } = { authPool, workPool }) {
  const router = express.Router();
  const fail = (res, e) => {
    if (e.status) return res.status(e.status).json({ error: e.message });
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'อีเมลนี้มีผู้ใช้อยู่แล้ว' });
    console.error('[profile]', e.code || e.message);
    return res.status(503).json({ error: 'ไม่สามารถบันทึกหรือโหลดโปรไฟล์ได้ กรุณาตรวจสอบฐานข้อมูล' });
  };

  router.get('/profile', async (req, res) => {
    try {
      const [rows] = await workDb.query('SELECT first_name, last_name, biography, skills, avatar_mime, avatar_data FROM erp_user_profiles WHERE user_id=?', [req.user.user_id]);
      const r = rows[0] || {};
      res.json({ firstName:r.first_name || '', lastName:r.last_name || '', biography:r.biography || '', skills:parseSkills(r.skills),
        avatar:r.avatar_mime === 'image/jpeg' && Buffer.isBuffer(r.avatar_data) ? 'data:image/jpeg;base64,' + r.avatar_data.toString('base64') : null });
    } catch (e) { fail(res, e); }
  });

  router.put('/profile', async (req, res) => {
    try {
      const b = req.body;
      bodyKeys(b, ['firstName','lastName','biography','skills']);
      const first = text(b.firstName, 80, 'ชื่อ'), last = text(b.lastName, 80, 'นามสกุล');
      const bio = text(b.biography, 4000, 'ประวัติ', true), skills = normalizeSkills(b.skills);
      await workDb.query(`INSERT INTO erp_user_profiles (user_id,first_name,last_name,biography,skills) VALUES (?,?,?,?,?)
        ON DUPLICATE KEY UPDATE first_name=VALUES(first_name),last_name=VALUES(last_name),biography=VALUES(biography),skills=VALUES(skills)`,
      [req.user.user_id, first, last, bio, JSON.stringify(skills)]);
      res.json({ ok:true, firstName:first, lastName:last, biography:bio, skills });
    } catch (e) { fail(res, e); }
  });

  router.put('/profile/avatar', async (req, res) => {
    try {
      bodyKeys(req.body, ['image']);
      const buf = req.body.image === null ? null : decodeAvatar(req.body.image);
      await workDb.query(`INSERT INTO erp_user_profiles (user_id,avatar_mime,avatar_data) VALUES (?,?,?)
        ON DUPLICATE KEY UPDATE avatar_mime=VALUES(avatar_mime),avatar_data=VALUES(avatar_data)`,
      [req.user.user_id, buf ? 'image/jpeg' : null, buf]);
      res.json({ ok:true, avatar:buf ? 'data:image/jpeg;base64,' + buf.toString('base64') : null });
    } catch (e) { fail(res, e); }
  });

  /* อีเมลและชื่อแสดงผลอยู่ใน users ของ Hub; เปลี่ยนอีเมลต้องยืนยันรหัสผ่านจริง */
  router.patch('/', async (req, res) => {
    try {
      const b = req.body;
      bodyKeys(b, ['name','email','currentPassword']);
      const name = text(b.name, 100, 'ชื่อแสดงผล');
      const email = text(b.email, 255, 'อีเมล').toLowerCase();
      if (!name) throw error(400, 'กรุณากรอกชื่อแสดงผล');
      if (!EMAIL_RE.test(email)) throw error(400, 'รูปแบบอีเมลไม่ถูกต้อง');
      const [rows] = await authDb.query('SELECT id, name, email, password FROM users WHERE id=? LIMIT 1', [req.user.user_id]);
      if (!rows.length) throw error(404, 'ไม่พบบัญชีผู้ใช้');
      const previous = rows[0], changedEmail = email !== String(previous.email).toLowerCase();
      let teamId = null;
      if (changedEmail) {
        if (String(req.token || '').startsWith('mng_s')) throw error(403, 'กรุณาเข้าสู่ระบบเว็บเพื่อเปลี่ยนอีเมล');
        if (typeof b.currentPassword !== 'string' || b.currentPassword.length > 1024 || !await bcrypt.compare(b.currentPassword, previous.password))
          throw error(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
        const [duplicate] = await authDb.query('SELECT id FROM users WHERE LOWER(email)=? AND id<>? LIMIT 1', [email, req.user.user_id]);
        if (duplicate.length) throw error(409, 'อีเมลนี้มีผู้ใช้อยู่แล้ว');
        const [oldDuplicate] = await authDb.query('SELECT id FROM users WHERE LOWER(email)=? AND id<>? LIMIT 1', [String(previous.email).toLowerCase(), req.user.user_id]);
        if (oldDuplicate.length) throw error(409, 'อีเมลเดิมตรงกับหลายบัญชี กรุณาให้ผู้ดูแลตรวจสอบก่อน');
        // ผูกสมาชิกเดิมด้วย auth ID ก่อนเปลี่ยนอีเมล เพื่อรักษาการลงเวลา
        teamId = await prepareTeamEmail(workDb, req.user.user_id, previous.email, email);
      }
      // ป้องกันการเขียนทับอีเมลที่เปลี่ยนพร้อมกัน และไม่อ้างว่าอีเมลใหม่ผ่านการยืนยันแล้ว
      const [updated] = await authDb.query(`UPDATE users SET name=?, email=?${changedEmail ? ', email_verified_at=NULL' : ''} WHERE id=? AND LOWER(email)=LOWER(?)`,
        [name, email, req.user.user_id, previous.email]);
      if (!updated.affectedRows) throw error(409, 'อีเมลบัญชีเปลี่ยนระหว่างทำรายการ กรุณาโหลดใหม่');
      const teamSync = changedEmail ? await syncTeamEmail(workDb, teamId, req.user.user_id, previous.email, email) : true;
      // middleware อ่านชื่อ/อีเมล/สิทธิ์ล่าสุดจาก auth DB ทุกครั้ง แม้ snapshot ของ session จะอัปเดตไม่สำเร็จ
      // MariaDB รุ่นเก่าอาจใส่ ON UPDATE CURRENT_TIMESTAMP ให้ TIMESTAMP แรกโดยอัตโนมัติ
      await workDb.query('UPDATE erp_sessions SET name=?, email=?, expires_at=expires_at WHERE user_id=?', [name, email, req.user.user_id]).catch(() => {});
      res.json({ ok:true, user:{ id:'u'+req.user.user_id, authId:req.user.user_id, name, email, role:req.user.role }, teamSync });
    } catch (e) { fail(res, e); }
  });

  return router;
}

module.exports = { createProfileRouter, router:createProfileRouter(), jpegDimensions, decodeAvatar, normalizeSkills };
