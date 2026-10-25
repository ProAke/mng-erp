/* MNG ERP — auth: bcrypt login against pacific_mng.users, sessions in works DB */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { authPool, workPool } = require('./db');
const cfg = require('./config');

async function selectUserForLogin(email) {
  try {
    const [rows] = await authPool.query(
      'SELECT id, email, password, name, role, status, avatar FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    return rows[0];
  } catch {
    const [rows] = await authPool.query(
      'SELECT id, email, password, name, role, status FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    return rows[0];
  }
}

async function selectLiveUserById(userId) {
  try {
    const [rows] = await authPool.query(
      'SELECT status, role, name, avatar FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    return rows[0];
  } catch {
    const [rows] = await authPool.query(
      'SELECT status, role, name FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    return rows[0];
  }
}

async function login(email, password) {
  const u = await selectUserForLogin(email);
  if (!u) throw Object.assign(new Error('ไม่พบอีเมลนี้ในระบบ'), { code: 401 });
  if (u.status !== 'active') throw Object.assign(new Error('บัญชีนี้ไม่ได้เปิดใช้งาน'), { code: 403 });
  const ok = await bcrypt.compare(password, u.password);
  if (!ok) throw Object.assign(new Error('รหัสผ่านไม่ถูกต้อง'), { code: 401 });

  const token = crypto.randomBytes(32).toString('hex');
  await workPool.query(
    `INSERT INTO erp_sessions (token, user_id, name, email, role, expires_at)
     VALUES (?,?,?,?,?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [token, u.id, u.name, u.email, u.role, cfg.sessionDays]
  );
  return {
    token,
    user: {
      id: 'u' + u.id,
      authId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      avatar: u.avatar || null,
    },
  };
}

async function logout(token) {
  if (token) await workPool.query('DELETE FROM erp_sessions WHERE token = ?', [token]).catch(() => {});
}

async function verifyToken(token) {
  if (!token) {
    const err = new Error('unauthorized');
    err.status = 401;
    throw err;
  }
  let rows;
  try {
    [rows] = await workPool.query(
      'SELECT user_id, name, email, role FROM erp_sessions WHERE token = ? AND expires_at > NOW() LIMIT 1',
      [token]
    );
  } catch {
    const err = new Error('db_unavailable');
    err.status = 503;
    throw err;
  }
  if (!rows.length) {
    const err = new Error('session_expired');
    err.status = 401;
    throw err;
  }
  const sessionUser = rows[0];
  let live;
  try {
    live = await selectLiveUserById(sessionUser.user_id);
  } catch {
    const err = new Error('db_unavailable');
    err.status = 503;
    throw err;
  }
  if (!live) {
    const err = new Error('account_removed');
    err.status = 403;
    throw err;
  }
  if (live.status !== 'active') {
    const err = new Error('บัญชีนี้ถูกระงับการใช้งาน');
    err.status = 403;
    throw err;
  }
  return {
    user_id: sessionUser.user_id,
    authId: sessionUser.user_id,
    email: sessionUser.email,
    name: live.name,
    role: live.role,
    avatar: live.avatar || null,
  };
}

/* express middleware */
async function middleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = await verifyToken(token);
    req.token = token;
    next();
  } catch (e) {
    res.status(e.status || 503).json({ error: e.message || 'db_unavailable' });
  }
}

module.exports = { login, logout, verifyToken, middleware };
