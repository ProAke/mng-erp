/* MNG ERP — hermes-mini standalone runner
 *
 * Runs hermes-mini as a standalone Express service for testing.
 * In production, routes are mounted inside the main mng-erp server
 * (server/index.js) and share the same MariaDB connection pools.
 *
 * Usage:
 *   cd server/hermes-mini && node run.js
 *   # or: node run.js --port 8081
 *
 * Requires DB_ env vars (or .env in server/ for full DB access).
 * Falls back to reading seed data if MariaDB is unavailable.
 */
'use strict';

/* ---- set dummy env vars so ../db → ../config doesn't exit during require ---- */
process.env.DB_AUTH_PASS = process.env.DB_AUTH_PASS || 'demo';
process.env.DB_WORK_PASS = process.env.DB_WORK_PASS || 'demo';

const path = require('path');
const express = require('express');
const { HermesMini } = require('./hermes-mini');

const PORT = parseInt(process.env.HM_PORT || '8081', 10);
const app = express();
app.use(express.json({ limit: '1mb' }));

/* ---- attempt MariaDB connection; fall back to demo data ---- */
let pools = { workPool: null, authPool: null, demo: true };

async function connectDB() {
  try {
    const db = require('../db');
    pools.workPool = db.workPool;
    pools.authPool = db.authPool;
    // Actually test the connection with a trivial query
    await pools.workPool.query('SELECT 1 AS test');
    await pools.authPool.query('SELECT 1 AS test');
    pools.demo = false;
    console.log('[hermes-mini] connected to MariaDB (pacific_mng + pacific_mngworks)');
  } catch (e) {
    console.log('[hermes-mini] MariaDB unavailable — running in demo mode (seed data)');
    pools.workPool = { query: async () => [[], []] };
    pools.authPool = { query: async () => [[], []] };
    pools.demo = true;
  }
}

/* ---- demo data fallback (from seed) ---- */
function demoData() {
  // Minimal seed mirroring data.js — used only when MariaDB is unreachable
  return {
    tasks: [
      { id: 't1', code: 'MNG-1031', project: 'p1', title: 'เชื่อม LINE OA webhook + fallback queue', status: 'doing', priority: 'urgent', assignee: 'u3', start: '2026-10-18', due: '2026-10-21', progress: 70, est: 16, tags: ['Backend', 'API'], subtasks: [], comments: [] },
      { id: 't2', code: 'MNG-1042', project: 'p5', title: 'ปฏิทินใหญ่เต็มจอ: month/week/day/agenda', status: 'doing', priority: 'urgent', assignee: 'u3', start: '2026-10-20', due: '2026-10-27', progress: 40, est: 36, tags: ['Frontend', 'Calendar'], subtasks: [], comments: [] },
      { id: 't3', code: 'MNG-1044', project: 'p5', title: 'ระบบสิทธิ์ผู้ใช้ (RBAC)', status: 'todo', priority: 'med', assignee: 'u3', start: '2026-11-02', due: '2026-11-13', progress: 0, est: 20, tags: ['Backend', 'Auth'], subtasks: [], comments: [] },
    ],
    projects: [
      { id: 'p1', name: 'Calmat — Chat', short: 'Calmat', client: 'Calmat Co., Ltd.', grad: 'g-blue', color: '#2F6BF0', status: 'doing', progress: 62, budget: 180000, spent: 111000, start: '2026-10-05', end: '2026-11-06' },
      { id: 'p5', name: 'MNG Smart Dashboard v2', short: 'MNG Dashboard', client: 'Internal — MNG Groups', grad: 'g-orange', color: '#F2762E', status: 'doing', progress: 35, budget: 0, spent: 0, start: '2026-10-15', end: '2026-12-15' },
    ],
    team: [
      { id: 'u1', name: 'Worapot', role: 'Founder / PM', color: '#FF8A5C', email: 'worapot@outlook.com', isMe: true },
      { id: 'u3', name: 'Bank Kritsada', role: 'Full-stack Dev', color: '#3BA7FF', email: 'bank@mnggroups.co', isMe: false },
    ],
    invoices: [
      { id: 'i5', no: 'INV-2026-042', client: 'c1', title: 'SGI Website — งวด 2 (40%)', amount: 84000, vat: 5880, issue: '2026-09-30', due: '2026-10-14', paid: null, status: 'overdue' },
    ],
    activity: [],
  };
};

/* ---- demo HermesMini that reads from in-memory seed ---- */
class DemoHermesMini extends HermesMini {
  constructor() {
    super({ query: async () => [[], []] }, { query: async () => [[], []] });
    this.dbConnected = false;  // demo mode — no real DB
  }
  async fetchData() {
    this._log('Demo mode: using seed data (no MariaDB)');
    const d = demoData();
    this._cache = d;
    return d;
  }
  status() {
    const s = super.status();
    s.demo = true;
    s.dbConnected = false;
    return s;
  }
}

/* ---- mount routes with simple CORS for browser access ---- */
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ---- health endpoint ---- */
app.get('/health', (_req, res) => res.json({ ok: true, service: 'hermes-mini', demo: pools.demo, port: PORT }));

/* ---- API routes (mirrors server/index.js: /api/hermes-mini/*) ---- */
const router = express.Router();
let mini = null;

function getMini() {
  if (!mini) {
    mini = pools.demo ? new DemoHermesMini() : new HermesMini(pools.workPool, pools.authPool);
  }
  return mini;
}

router.get('/status', (_req, res) => res.json(getMini().status()));

router.get('/insights', async (_req, res) => {
  const r = await getMini().insights();
  res.json(r);
});

router.get('/summary', async (_req, res) => {
  const r = await getMini().summary();
  res.json(r);
});

router.get('/prioritize', async (_req, res) => {
  const r = await getMini().prioritize();
  res.json(r);
});

router.get('/risk', async (_req, res) => {
  const r = await getMini().predictRisk();
  res.json(r);
});

router.post('/chat', async (req, res) => {
  const r = await getMini().chat(req.body?.question, req.body?.context);
  res.json(r);
});

router.get('/worklog/:id', async (req, res) => {
  const r = await getMini().generateWorklog(req.params.id);
  if (r.error) return res.status(404).json(r);
  res.json(r);
});

router.get('/member/:id', async (req, res) => {
  const r = await getMini().memberDetail(req.params.id);
  if (r.error) return res.status(404).json(r);
  res.json(r);
});

router.get('/tasks', async (_req, res) => {
  const r = await getMini().prioritize();
  res.json({ tasks: r.recommendations, ...r });
});

app.use('/api/hermes-mini', router);

/* ---- boot ---- */
(async () => {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[hermes-mini] listening on http://0.0.0.0:${PORT} (${pools.demo ? 'demo' : 'production'} mode)`);
    console.log(`[hermes-mini] endpoints: /health, /api/hermes-mini/status, /api/hermes-mini/insights, /api/hermes-mini/summary, /api/hermes-mini/prioritize, /api/hermes-mini/risk, /api/hermes-mini/tasks, POST /api/hermes-mini/chat, /api/hermes-mini/worklog/:id, /api/hermes-mini/member/:id`);
  });
})();
