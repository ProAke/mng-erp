/* MNG ERP — server entry: Next.js static export + REST API backed by MariaDB */
const fs = require('fs');
const path = require('path');
const express = require('express');
const cfg = require('./config');
const { ensureSchema, healthCheck, workPool } = require('./db');
const auth = require('./auth');
const api = require('./routes');
const workspaceApi = require('./workspace-routes');

const app = express();
app.use(express.json({ limit: '4mb' }));

/* tiny request log */
app.use('/api', (req, _res, next) => { console.log(`[api] ${req.method} ${req.path}`); next(); });

/* API ต้องไม่ถูก cache เด็ดขาด — มิฉะนั้น token ที่ logout แล้วอาจยังดึงข้อมูลจริงได้
   จาก cache ของ browser โดยไม่มีการถาม server */
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

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

/* ---------- Google Drive & media upload routes (handles per-route auth for OAuth callback) ---------- */
app.use('/api/drive', require('./drive-routes'));

/* ---------- protected API ---------- */
app.use('/api/users', auth.middleware, require('./users'));
if (fs.existsSync(path.join(__dirname, 'hermes-mini', 'routes.js'))) {
  app.use('/api/hermes-mini', auth.middleware, require('./hermes-mini/routes'));
}
app.use('/api', auth.middleware, workspaceApi);
app.use('/api', auth.middleware, api);

/* ---------- uploaded media files ---------- */
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

/* ---------- Next.js static export (server/public) ---------- */
const root = path.join(__dirname, 'public');
// setHeaders signature = (res, path, stat) — res คืออาร์กูเมนต์แรกเท่านั้น
const noCache = (res, _path, _stat) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

// Serve _next/static hashed assets with cache, HTML with no-cache
app.use(
  '/_next/static',
  express.static(path.join(root, '_next', 'static'), { maxAge: '365d', immutable: true })
);
app.use(express.static(root, { extensions: ['html'], redirect: false, setHeaders: noCache }));

// Resolve directory index.html directly for both /route and /route/ (avoids 301 proxy issues)
// Excludes /api/*, /uploads/*, /hub, and /workspace (MNG Hub legacy paths)
app.get(/^\/(?!api\/|uploads\/|hub(?:\/|$)|workspace(?:\/|$)).*/, (req, res) => {
  noCache(res);
  const clean = decodeURIComponent(req.path || '/').replace(/^\/+|\/+$/g, '');
  if (clean && !clean.includes('..')) {
    const dirIndex = path.join(root, clean, 'index.html');
    if (fs.existsSync(dirIndex)) return res.sendFile(dirIndex);
    const htmlFile = path.join(root, `${clean}.html`);
    if (fs.existsSync(htmlFile)) return res.sendFile(htmlFile);
    // Do not return HTML for missing static assets (.js/.css/.ico/.png/etc.)
    if (/\.[a-z0-9]{2,6}$/i.test(clean)) {
      return res.status(404).end();
    }
  }
  const rootIndex = path.join(root, 'index.html');
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
  res.status(404).send('Not found');
});

/* ---------- boot ---------- */
async function boot() {
  console.log('[mng-erp] starting…');
  const h = await healthCheck();
  console.log('[mng-erp] db auth:', h.auth ? 'OK' : `FAIL (${h.authErr})`, '| work:', h.work ? 'OK' : `FAIL (${h.workErr})`);
  await ensureSchema();
  const { seed } = require('./seed');
  await seed(workPool); // idempotent
  app.listen(cfg.port, '0.0.0.0', () => console.log(`[mng-erp] listening on http://0.0.0.0:${cfg.port}`));
}

if (require.main === module) {
  boot().catch(e => { console.error('[mng-erp] boot failed:', e); process.exit(1); });
}

module.exports = { app, boot };
