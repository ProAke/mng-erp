/* MNG ERP — auth: bcrypt login against pacific_mng.users, sessions & 20-slot Hermes tokens in works DB */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { authPool, workPool } = require('./db');
const cfg = require('./config');
const hermes = require('./hermes');

async function login(email, password) {
  const [rows] = await authPool.query(
    'SELECT id, email, password, name, role, status FROM users WHERE email = ? LIMIT 1', [email]);
  const u = rows[0];
  if (!u) throw Object.assign(new Error('ไม่พบอีเมลนี้ในระบบ'), { code: 401 });
  if (u.status !== 'active') throw Object.assign(new Error('บัญชีนี้ไม่ได้เปิดใช้งาน'), { code: 403 });
  const ok = await bcrypt.compare(password, u.password);
  if (!ok) throw Object.assign(new Error('รหัสผ่านไม่ถูกต้อง'), { code: 401 });

  const token = crypto.randomBytes(32).toString('hex');
  await workPool.query(
    `INSERT INTO erp_sessions (token, user_id, name, email, role, expires_at)
     VALUES (?,?,?,?,?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [token, u.id, u.name, u.email, u.role, cfg.sessionDays]);
  return { token, user: { id: 'u' + u.id, authId: u.id, name: u.name, email: u.email, role: u.role } };
}

async function logout(token) {
  if (token) await workPool.query('DELETE FROM erp_sessions WHERE token = ?', [token]).catch(() => {});
}

/* express middleware — supports both Web SPA sessions AND 20-slot rotating Hermes API tokens */
async function middleware(req, res, next) {
  const apiHdr = String(req.headers['x-api-token'] || '').trim();
  const authHdr = String(req.headers.authorization || '').trim();
  const bearerTok = authHdr.startsWith('Bearer ') ? authHdr.slice(7).trim() : '';
  const token = apiHdr || bearerTok || null;

  if (!token) {
    return res.status(401).json({
      error: 'unauthorized',
      detail: 'ต้องเข้าสู่ระบบด้วย User/Password (POST /api/hermes/login หรือ POST /api/auth/login) เพื่อรับ Token ก่อนเรียกใช้งาน API',
    });
  }

  try {
    // 1) Rotating Hermes / AI API Token Pool (mng_s01_... .. mng_s20_...)
    if (token.startsWith('mng_s')) {
      const v = await hermes.verifyApiToken(token, req, res);
      if (!v.ok) {
        return res.status(v.status || 401).json({ error: v.error, ...(v.detail ? { detail: v.detail } : {}) });
      }
      req.user = v.user;
      req.token = token;
      req.tokenSlot = v.tokenSlot;
      req.nextRecommendedSlot = v.nextRecommendedSlot;
      req.slotUseCount = v.slotUseCount;
      return next();
    }

    // 2) Standard Web Session Token (erp_sessions + live pacific_mng.users check)
    const [rows] = await workPool.query(
      'SELECT user_id, name, email, role FROM erp_sessions WHERE token = ? AND expires_at > NOW() LIMIT 1', [token]);
    if (!rows.length) return res.status(401).json({ error: 'session_expired' });
    req.user = rows[0];
    // เช็คสดจาก auth DB ทุก request — ระงับ/ลดสิทธิ์แล้วมีผลทันที
    const [u] = await authPool.query('SELECT status, role, name FROM users WHERE id = ? LIMIT 1', [rows[0].user_id]);
    if (!u.length) return res.status(403).json({ error: 'account_removed' });
    if (u[0].status !== 'active') return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });
    req.user.role = u[0].role;
    req.user.name = u[0].name;
    req.token = token;
    next();
  } catch (e) {
    res.status(503).json({ error: 'db_unavailable' });
  }
}

module.exports = { login, logout, middleware };
