/* MNG ERP — server entry: static SPA + REST API backed by MariaDB
   Compatible with Phusion Passenger (Plesk IN_PASSENGER=1) and standalone Node */
const fs = require('fs');
const path = require('path');
const express = require('express');
const cfg = require('./config');
const { ensureSchema, healthCheck, workPool } = require('./db');
const auth = require('./auth');
const api = require('./routes');

const app = express();
app.use(express.json({ limit: '15mb' }));

const setNoStore = (res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

/* ---------- background DB schema + seed init (never blocks Passenger spawn!) ---------- */
let dbReadyResolved = cfg.demoOnly;
const dbInitPromise = (async () => {
  if (cfg.demoOnly) {
    console.log('[mng-erp] DB_AUTH_PASS / DB_WORK_PASS not set → Demo SPA mode');
    return;
  }
  try {
    const h = await healthCheck();
    console.log('[mng-erp] db auth:', h.auth ? 'OK' : `FAIL (${h.authErr})`, '| work:', h.work ? 'OK' : `FAIL (${h.workErr})`);
    if (h.work) {
      await ensureSchema();
      const { seed } = require('./seed');
      await seed(workPool); // idempotent + fast-path
    }
  } catch (e) {
    console.error('[mng-erp] db init warning (continuing to serve requests):', e.message);
  } finally {
    dbReadyResolved = true;
  }
})();

const waitDbReady = () => dbReadyResolved
  ? Promise.resolve()
  : Promise.race([dbInitPromise, new Promise(resolve => setTimeout(resolve, 15000))]);

/* tiny request log + API no-store */
app.use('/api', (req, res, next) => {
  setNoStore(res);
  console.log(`[api] ${req.method} ${req.path}`);
  next();
});

/* ---------- public endpoints ---------- */
app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, dbReady: dbReadyResolved, ...(await healthCheck()) });
});

app.post('/api/auth/login', async (req, res) => {
  if (cfg.demoOnly) return res.status(503).json({ error: 'โหมดสาธิต (ยังไม่ได้ตั้งค่าฐานข้อมูล MariaDB)' });
  await waitDbReady();
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' });
  try {
    const out = await auth.login(String(email).trim().toLowerCase(), String(password));
    console.log(`[auth] login ok: ${email}`);
    res.json(out);
  } catch (e) {
    console.log(`[auth] login fail: ${email} — ${e.message}`);
    res.status(e.code || 500).json({ error: e.message || 'login_failed' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  if (!cfg.demoOnly) {
    const h = req.headers.authorization || '';
    await auth.logout(h.startsWith('Bearer ') ? h.slice(7) : null);
  }
  res.json({ ok: true, success: true });
});

/* ---------- protected API ---------- */
app.use('/api/users', async (_req, _res, next) => { await waitDbReady(); next(); }, auth.middleware, require('./users'));
app.use('/api', async (_req, _res, next) => { await waitDbReady(); next(); }, auth.middleware, api);

/* ---------- static SPA + safe /uploads ---------- */
const root = path.join(__dirname, '..');
const uploadsDir = path.join(root, 'uploads');
try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch {}

// Prevent serving internal backend/test/source directories over HTTP
app.use(['/server', '/tests', '/web', '/node_modules'], (_req, res) => res.status(404).end());

// Serve uploaded Chat/Drive files safely (nosniff + sandbox CSP so uploads never execute scripts)
app.use('/uploads', express.static(uploadsDir, {
  dotfiles: 'ignore',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  },
}));

// no-cache ทุกไฟล์ — ป้องกัน browser cache ไฟล์เก่า
app.use(express.static(root, { dotfiles: 'ignore', extensions: ['html'], setHeaders: (res) => setNoStore(res) }));

// catch-all → SPA; **ยกเว้น** /hub และ /workspace (ของ MNG Hub เดิม — อย่าแย่งเส้นทาง)
app.get(/^\/(?!api\/|hub(?:\/|$)|workspace(?:\/|$)).*/, (_req, res) => {
  setNoStore(res);
  res.sendFile(path.join(root, 'index.html'));
});

/* ---------- start HTTP listener immediately (critical for Phusion Passenger!) ---------- */
function startServer() {
  const inPassenger = !!(process.env.IN_PASSENGER || typeof global.PhusionPassenger !== 'undefined');
  if (inPassenger) {
    return app.listen(cfg.port, () => console.log(`[mng-erp] listening via Phusion Passenger (port ${cfg.port})`));
  }
  return app.listen(cfg.port, '0.0.0.0', () => console.log(`[mng-erp] listening on http://0.0.0.0:${cfg.port}`));
}

/* IMPORTANT: Phusion Passenger loads server/index.js via require() inside node-loader.js,
   so `require.main === module` is FALSE under Passenger! Always start unless inside Vitest. */
if (!process.env.VITEST) {
  startServer();
}

module.exports = { app, startServer, dbInitPromise };
