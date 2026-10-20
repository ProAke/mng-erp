/* MNG ERP — server entry: static SPA + REST API backed by MariaDB */
const path = require('path');
const express = require('express');
const cfg = require('./config');
const { ensureSchema, healthCheck, workPool } = require('./db');
const auth = require('./auth');
const api = require('./routes');

const app = express();
app.use(express.json({ limit: '2mb' }));

/* tiny request log */
app.use('/api', (req, _res, next) => { console.log(`[api] ${req.method} ${req.path}`); next(); });

/* ---------- public endpoints ---------- */
app.get('/api/health', async (_req, res) => { res.json({ ok: true, ...(await healthCheck()) }); });

app.post('/api/auth/login', async (req, res) => {
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
  const h = req.headers.authorization || '';
  await auth.logout(h.startsWith('Bearer ') ? h.slice(7) : null);
  res.json({ ok: true });
});

/* ---------- protected API ---------- */
app.use('/api/users', auth.middleware, require('./users'));
app.use('/api', auth.middleware, api);

/* ---------- static SPA ---------- */
const root = path.join(__dirname, '..');
app.use(express.static(root, { extensions: ['html'] }));
app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(root, 'index.html')));

/* ---------- boot ---------- */
(async () => {
  console.log('[mng-erp] starting…');
  const h = await healthCheck();
  console.log('[mng-erp] db auth:', h.auth ? 'OK' : `FAIL (${h.authErr})`, '| work:', h.work ? 'OK' : `FAIL (${h.workErr})`);
  await ensureSchema();
  const { seed } = require('./seed');
  await seed(workPool);   // idempotent
  app.listen(cfg.port, '0.0.0.0', () => console.log(`[mng-erp] listening on http://0.0.0.0:${cfg.port}`));
})().catch(e => { console.error('[mng-erp] boot failed:', e); process.exit(1); });
