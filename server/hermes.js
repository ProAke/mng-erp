/* MNG ERP — Hermes & External AI Integration Hub
   - Self-login with real user/password against pacific_mng.users
   - 20-slot rotating Bearer/API Token pool in pacific_mngworks.erp_api_tokens
   - AES-256-GCM encrypted at rest + SHA-256 indexed lookup
   - Optional Strict Dual-Auth (requires user/password headers + rotating token)
   - AI-optimized workspace overview & endpoint catalog */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const { authPool, workPool } = require('./db');

const DEFAULT_POOL_SIZE = 20;
const DEFAULT_TOKEN_DAYS = parseInt(process.env.API_TOKEN_DAYS || '30', 10);

function deriveKey() {
  const secret = process.env.API_TOKEN_SECRET
    || process.env.DB_WORK_PASS
    || process.env.DB_AUTH_PASS
    || 'mng-erp-hermes-token-pool-key';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function encryptToken(raw) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(String(raw), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptToken(payload) {
  try {
    const [ivHex, tagHex, dataHex] = String(payload || '').split(':');
    if (!ivHex || !tagHex || !dataHex) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

function generateSlotToken(slot) {
  const s = String(slot).padStart(2, '0');
  const rnd = crypto.randomBytes(24).toString('hex');
  const raw = `mng_s${s}_${rnd}`;
  const preview = `mng_s${s}_${rnd.slice(0, 4)}...${rnd.slice(-4)}`;
  return { raw, hash: hashToken(raw), enc: encryptToken(raw), preview };
}

function extractCredentialsFromHeaders(req) {
  const hdrEmail = req.headers['x-auth-email'] || req.headers['x-mng-email'];
  const hdrPass = req.headers['x-auth-password'] || req.headers['x-mng-password'];
  if (hdrEmail && hdrPass) {
    return { email: String(hdrEmail).trim().toLowerCase(), password: String(hdrPass) };
  }
  const authHdr = String(req.headers.authorization || '');
  if (authHdr.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHdr.slice(6).trim(), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      if (idx > 0) {
        return {
          email: decoded.slice(0, idx).trim().toLowerCase(),
          password: decoded.slice(idx + 1),
        };
      }
    } catch {}
  }
  return null;
}

async function verifyUserCredentials(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPass = String(password || '');
  if (!cleanEmail || !cleanPass) {
    throw Object.assign(new Error('กรุณาระบุอีเมล (user) และรหัสผ่าน (password)'), { code: 400 });
  }
  const [rows] = await authPool.query(
    'SELECT id, email, password, name, role, status FROM users WHERE LOWER(email) = ? LIMIT 1',
    [cleanEmail]
  );
  const u = rows[0];
  if (!u) throw Object.assign(new Error('ไม่พบบัญชีผู้ใช้นี้ในระบบ'), { code: 401 });
  if (u.status !== 'active') throw Object.assign(new Error('บัญชีนี้ไม่ได้เปิดใช้งานหรือถูกระงับ'), { code: 403 });
  const ok = await bcrypt.compare(cleanPass, u.password);
  if (!ok) throw Object.assign(new Error('รหัสผ่านไม่ถูกต้อง'), { code: 401 });
  return u;
}

async function ensureTokenPool(userId, opts = {}) {
  const poolSize = Math.min(50, Math.max(1, parseInt(opts.poolSize || DEFAULT_POOL_SIZE, 10) || DEFAULT_POOL_SIZE));
  const rotate = !!opts.rotate;
  const targetSlot = opts.slot ? parseInt(opts.slot, 10) : null;
  const label = String(opts.label || 'hermes-pool').slice(0, 75);
  const days = Math.min(365, Math.max(1, parseInt(opts.days || DEFAULT_TOKEN_DAYS, 10) || DEFAULT_TOKEN_DAYS));

  const [existingRows] = await workPool.query(
    'SELECT * FROM erp_api_tokens WHERE user_id = ? ORDER BY slot ASC',
    [userId]
  );
  const bySlot = new Map(existingRows.map(r => [Number(r.slot), r]));
  const strictDual = existingRows.length ? (existingRows[0].strict_dual_auth ? 1 : 0) : 0;

  if (rotate && !targetSlot) {
    await workPool.query('DELETE FROM erp_api_tokens WHERE user_id = ?', [userId]);
    bySlot.clear();
  }

  const outTokens = [];
  const nowMs = Date.now();

  for (let slot = 1; slot <= poolSize; slot++) {
    const cur = bySlot.get(slot);
    const expired = cur ? (new Date(cur.expires_at).getTime() <= nowMs) : true;
    const rawExisting = cur && !cur.revoked && !expired ? decryptToken(cur.token_enc) : null;
    const mustRegen = !cur || cur.revoked || expired || !rawExisting || (rotate && (!targetSlot || targetSlot === slot));

    if (!mustRegen) {
      outTokens.push({
        slot,
        token: rawExisting,
        preview: cur.token_preview,
        useCount: Number(cur.use_count) || 0,
        lastUsedAt: cur.last_used_at || null,
        expiresAt: cur.expires_at,
      });
      continue;
    }

    const gen = generateSlotToken(slot);
    await workPool.query(
      `INSERT INTO erp_api_tokens
         (user_id, slot, token_hash, token_enc, token_preview, label, strict_dual_auth, use_count, last_used_at, revoked, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, DATE_ADD(NOW(), INTERVAL ? DAY))
       ON DUPLICATE KEY UPDATE
         token_hash = VALUES(token_hash),
         token_enc = VALUES(token_enc),
         token_preview = VALUES(token_preview),
         label = VALUES(label),
         use_count = 0,
         last_used_at = NULL,
         revoked = 0,
         expires_at = VALUES(expires_at)`,
      [userId, slot, gen.hash, gen.enc, gen.preview, label, strictDual, days]
    );
    outTokens.push({
      slot,
      token: gen.raw,
      preview: gen.preview,
      useCount: 0,
      lastUsedAt: null,
      expiresAt: new Date(nowMs + days * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' '),
    });
  }

  return { poolSize, strictDualAuth: !!strictDual, tokens: outTokens };
}

/* Verify incoming mng_sXX_... API token in auth.middleware */
async function verifyApiToken(rawToken, req, res) {
  const th = hashToken(rawToken);
  const [rows] = await workPool.query(
    'SELECT * FROM erp_api_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > NOW() LIMIT 1',
    [th]
  );
  if (!rows.length) {
    return { ok: false, status: 401, error: 'invalid_or_expired_api_token' };
  }
  const tokRow = rows[0];

  // Live check against pacific_mng.users on every single API call
  const [uRows] = await authPool.query(
    'SELECT id, email, password, name, role, status FROM users WHERE id = ? LIMIT 1',
    [tokRow.user_id]
  );
  if (!uRows.length) return { ok: false, status: 403, error: 'account_removed' };
  const u = uRows[0];
  if (u.status !== 'active') return { ok: false, status: 403, error: 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน' };

  // Check credentials if strict_dual_auth is enabled OR if caller explicitly attached user/password headers
  const hdrCreds = extractCredentialsFromHeaders(req);
  if (tokRow.strict_dual_auth && !hdrCreds) {
    return {
      ok: false,
      status: 401,
      error: 'strict_dual_auth_required',
      detail: 'บัญชีนี้เปิดโหมดบังคับแนบ X-Auth-Email และ X-Auth-Password คู่กับ API Token ทุกคำขอ',
    };
  }
  if (hdrCreds) {
    if (hdrCreds.email !== String(u.email).toLowerCase()) {
      return { ok: false, status: 401, error: 'credential_user_mismatch' };
    }
    const passOk = await bcrypt.compare(hdrCreds.password, u.password);
    if (!passOk) return { ok: false, status: 401, error: 'invalid_password' };
  }

  const agent = String(req.headers['x-hermes-agent'] || req.headers['user-agent'] || 'hermes-api').slice(0, 135);
  await workPool.query(
    'UPDATE erp_api_tokens SET use_count = use_count + 1, last_used_at = NOW(), last_agent = ? WHERE id = ?',
    [agent, tokRow.id]
  ).catch(() => {});

  const slot = Number(tokRow.slot) || 1;
  const nextSlot = (slot % DEFAULT_POOL_SIZE) + 1;
  if (res && typeof res.setHeader === 'function') {
    res.setHeader('X-Token-Slot', String(slot));
    res.setHeader('X-Next-Recommended-Slot', String(nextSlot));
  }

  return {
    ok: true,
    user: { user_id: u.id, name: u.name, email: u.email, role: u.role },
    tokenSlot: slot,
    nextRecommendedSlot: nextSlot,
    slotUseCount: (Number(tokRow.use_count) || 0) + 1,
  };
}

/* ---------- PUBLIC HANDLERS (Mounted before auth.middleware) ---------- */

/* POST /api/hermes/login — Self-login with email/username + password -> returns 20 rotating tokens */
async function loginHermesHandler(req, res) {
  const b = req.body || {};
  const email = b.email || b.username || b.user;
  const password = b.password || b.pass;
  try {
    const u = await verifyUserCredentials(email, password);
    const pool = await ensureTokenPool(u.id, {
      poolSize: b.poolSize || DEFAULT_POOL_SIZE,
      rotate: !!b.rotate,
      days: b.days || DEFAULT_TOKEN_DAYS,
      label: b.label || 'hermes-agent',
    });

    await workPool.query(
      'INSERT INTO erp_activity (team_id, text) VALUES (1, ?)',
      [`🤖 <b>${u.name}</b> เข้าสู่ระบบผ่าน Hermes API (เตรียม Token หมุนเวียน ${pool.tokens.length} ชุด)`]
    ).catch(() => {});

    res.json({
      ok: true,
      user: { id: 'u' + u.id, authId: u.id, name: u.name, email: u.email, role: u.role },
      poolSize: pool.tokens.length,
      rotation: 'round-robin',
      strictDualAuth: pool.strictDualAuth,
      usageHint: 'ส่ง Authorization: Bearer <token> (หรือ X-API-Token: <token>) โดยวนสลับ slot 1 -> 20 ตามลำดับทุกคำขอ',
      tokens: pool.tokens,
    });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.message || 'hermes_login_failed' });
  }
}

function serveMarkdownDoc(relPath, contentType = 'text/markdown; charset=utf-8') {
  return (_req, res) => {
    const full = path.join(__dirname, '..', relPath);
    if (!fs.existsSync(full)) return res.status(404).type('text/plain').send('Document not found');
    res.setHeader('Content-Type', contentType);
    res.send(fs.readFileSync(full, 'utf8'));
  };
}

/* ---------- PROTECTED ROUTER (Mounted under /api/hermes after auth.middleware) ---------- */
const router = express.Router();

router.get('/me', (req, res) => {
  res.json({
    ok: true,
    user: {
      id: 'u' + req.user.user_id,
      authId: req.user.user_id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
    authType: req.tokenSlot ? 'api_token' : 'session',
    tokenSlot: req.tokenSlot || null,
    nextRecommendedSlot: req.nextRecommendedSlot || null,
    slotUseCount: req.slotUseCount || null,
  });
});

/* GET /api/hermes/tokens — Safe metadata of all 20 token slots (never exposes raw token without password) */
router.get('/tokens', async (req, res) => {
  try {
    const [rows] = await workPool.query(
      `SELECT slot, token_preview, label, strict_dual_auth, use_count, last_used_at, last_agent, revoked, expires_at, created_at
       FROM erp_api_tokens WHERE user_id = ? ORDER BY slot ASC`,
      [req.user.user_id]
    );
    const totalUses = rows.reduce((s, r) => s + (Number(r.use_count) || 0), 0);
    res.json({
      ok: true,
      poolTarget: DEFAULT_POOL_SIZE,
      activeCount: rows.filter(r => !r.revoked && new Date(r.expires_at).getTime() > Date.now()).length,
      strictDualAuth: rows.length ? !!rows[0].strict_dual_auth : false,
      totalUses,
      slots: rows.map(r => ({
        slot: Number(r.slot),
        preview: r.token_preview,
        label: r.label || 'hermes-pool',
        useCount: Number(r.use_count) || 0,
        lastUsedAt: r.last_used_at || null,
        lastAgent: r.last_agent || null,
        revoked: !!r.revoked,
        expiresAt: r.expires_at,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/hermes/tokens/reveal — Requires user's current password to issue/reveal all 20 raw tokens */
router.post('/tokens/reveal', async (req, res) => {
  try {
    const pw = String(req.body?.password || '');
    if (!pw) return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตนก่อนดูหรือสร้าง API Token' });
    await verifyUserCredentials(req.user.email, pw);
    const pool = await ensureTokenPool(req.user.user_id, {
      poolSize: req.body?.poolSize || DEFAULT_POOL_SIZE,
      rotate: false,
      label: req.body?.label || 'hermes-pool',
    });
    res.json({ ok: true, ...pool });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.message });
  }
});

/* POST /api/hermes/tokens/rotate — Requires user's current password to rotate all 20 tokens (or 1 slot) */
router.post('/tokens/rotate', async (req, res) => {
  try {
    const pw = String(req.body?.password || '');
    if (!pw) return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านเพื่อยืนยันการหมุนเปลี่ยน (Rotate) Token' });
    await verifyUserCredentials(req.user.email, pw);
    const pool = await ensureTokenPool(req.user.user_id, {
      poolSize: req.body?.poolSize || DEFAULT_POOL_SIZE,
      rotate: true,
      slot: req.body?.slot || null,
      label: req.body?.label || 'hermes-pool',
    });
    res.json({ ok: true, rotated: true, ...pool });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.message });
  }
});

/* POST or PATCH /api/hermes/tokens/policy — Toggle strict_dual_auth (verifies password if provided) */
const handlePolicyUpdate = async (req, res) => {
  const strict = req.body?.strictDualAuth ? 1 : 0;
  try {
    if (req.body?.password !== undefined) {
      const pw = String(req.body.password || '');
      if (!pw) return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านเพื่อเปลี่ยนนโยบายความปลอดภัย' });
      await verifyUserCredentials(req.user.email, pw);
    }
    await workPool.query('UPDATE erp_api_tokens SET strict_dual_auth = ? WHERE user_id = ?', [strict, req.user.user_id]);
    res.json({ ok: true, strictDualAuth: !!strict });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.message });
  }
};
router.post('/tokens/policy', handlePolicyUpdate);
router.patch('/tokens/policy', handlePolicyUpdate);

/* DELETE /api/hermes/tokens — Revoke all 20 API tokens immediately */
router.delete('/tokens', async (req, res) => {
  try {
    await workPool.query('UPDATE erp_api_tokens SET revoked = 1 WHERE user_id = ?', [req.user.user_id]);
    res.json({ ok: true, revoked: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* GET /api/hermes/overview — Compact AI-friendly live workspace snapshot from MariaDB */
router.get('/overview', async (req, res) => {
  try {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());

    const [projs] = await workPool.query(
      'SELECT id, title, erp_code, erp_status, erp_progress, erp_end FROM projects WHERE COALESCE(erp_archived,0)=0 ORDER BY id'
    );
    const [tasks] = await workPool.query(
      "SELECT id, project_id, title, status, priority, due_date, progress, erp_code, erp_prio, erp_assignee, erp_ai_agent FROM tasks WHERE archived=0 AND status NOT IN ('done','delivery') ORDER BY due_date ASC LIMIT 60"
    );
    const [chans] = await workPool.query('SELECT id, slug, name, chan_type FROM erp_channels ORDER BY id');
    const [msgs]  = await workPool.query('SELECT id, channel_id, sender_name, kind, body, created_at FROM erp_messages ORDER BY id DESC LIMIT 15');
    const [evts]  = await workPool.query('SELECT id, title, cat, date, start, end, loc FROM erp_events WHERE date >= ? ORDER BY date, start LIMIT 15', [today]);
    const [invs]  = await workPool.query("SELECT id, no, title, amount, vat, due, status FROM erp_invoices WHERE status IN ('pending','overdue') ORDER BY due ASC");
    const [agents] = await workPool.query('SELECT id, code, name, role, model, paused, runs FROM erp_ai_agents ORDER BY id');

    res.json({
      ok: true,
      today,
      actor: { id: 'u' + req.user.user_id, name: req.user.name, email: req.user.email, role: req.user.role, tokenSlot: req.tokenSlot || null },
      counts: {
        activeProjects: projs.length,
        openTasks: tasks.length,
        overdueTasks: tasks.filter(t => t.due_date && String(t.due_date).slice(0, 10) < today).length,
        pendingInvoices: invs.length,
      },
      projects: projs.map(p => ({ id: 'p' + p.id, code: p.erp_code || 'MNG', name: p.title, status: p.erp_status || 'doing', progress: p.erp_progress || 0, due: p.erp_end })),
      openTasks: tasks.map(t => ({
        id: 't' + t.id,
        code: t.erp_code || ('MNG-' + (1000 + t.id)),
        projectId: 'p' + t.project_id,
        title: t.title,
        status: t.status,
        priority: t.erp_prio || t.priority,
        due: t.due_date,
        progress: t.progress || 0,
        assignee: t.erp_assignee ? 'u' + t.erp_assignee : null,
        aiAgentId: t.erp_ai_agent || null,
      })),
      channels: chans.map(c => ({ id: 'ch' + c.id, slug: c.slug, name: c.name, type: c.chan_type || 'group' })),
      recentMessages: msgs.reverse().map(m => ({ id: 'm' + m.id, channelId: 'ch' + m.channel_id, sender: m.sender_name, kind: m.kind, body: m.body, at: m.created_at })),
      upcomingEvents: evts.map(e => ({ id: 'e' + e.id, title: e.title, cat: e.cat, date: e.date, start: e.start, end: e.end, loc: e.loc })),
      unpaidInvoices: invs.map(i => ({ id: 'i' + i.id, no: i.no, title: i.title, total: (+i.amount || 0) + (+i.vat || 0), due: i.due, status: i.status })),
      aiAgents: agents.map(a => ({ id: 'ai' + a.id, code: a.code, name: a.name, role: a.role, model: a.model, paused: !!a.paused, runs: a.runs })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* GET /api/hermes/endpoints — Machine-readable API catalog for Hermes & AI Agents */
router.get('/endpoints', (_req, res) => {
  res.json({
    ok: true,
    service: 'MNG ERP API',
    auth: {
      loginEndpoint: 'POST /api/hermes/login',
      loginBody: { email: 'agent@domain.com', password: '<password>', poolSize: 20 },
      requestHeader: 'Authorization: Bearer <token_slot_1_to_20>',
      alternateHeader: 'X-API-Token: <token_slot_1_to_20>',
      optionalStrictHeaders: ['X-Auth-Email', 'X-Auth-Password'],
      rotationPolicy: 'Round-robin across 20 tokens (slot 1 -> 2 -> ... -> 20 -> 1)',
    },
    endpoints: [
      { method: 'POST',   path: '/api/hermes/login',             desc: 'Login ด้วย email/password เพื่อรับ Token หมุนเวียน 20 ตัว' },
      { method: 'GET',    path: '/api/hermes/manual.md',         desc: 'อ่านคู่มือการใช้งาน MNG ERP API ฉบับเต็ม (.md)' },
      { method: 'GET',    path: '/api/hermes/skill.md',          desc: 'อ่านไฟล์ SKILL.md มาตรฐาน Hermes Agent' },
      { method: 'GET',    path: '/api/hermes/client.py',         desc: 'ดาวน์โหลด Python Client หมุนเวียน 20 Tokens อัตโนมัติ' },
      { method: 'GET',    path: '/api/hermes/me',                desc: 'ตรวจสอบตัวตนผู้เรียกและหมายเลข Token Slot ที่ใช้งาน' },
      { method: 'GET',    path: '/api/hermes/overview',          desc: 'ดึงภาพรวมงานด่วน โปรเจกต์ แชต ปฏิทิน และบิลค้างในครั้งเดียว' },
      { method: 'GET',    path: '/api/hermes/tokens',            desc: 'ดูสถิติการใช้งานของ Token ทั้ง 20 Slots' },
      { method: 'POST',   path: '/api/hermes/tokens/rotate',     desc: 'หมุนเปลี่ยน (Rotate) Token ทั้ง 20 ตัวใหม่ (ต้องระบุ password)' },
      { method: 'GET',    path: '/api/bootstrap',                desc: 'ดึงข้อมูลทั้งระบบครบทุกโมดูล' },
      { method: 'GET',    path: '/api/tasks',                    desc: 'ดึงรายการงาน (รองรับ ?status=&priority=&project=&q=)' },
      { method: 'POST',   path: '/api/tasks',                    desc: 'สร้างการ์ดงานใหม่ในบอร์ด Kanban' },
      { method: 'PATCH',  path: '/api/tasks/:id',                desc: 'อัปเดตสถานะงาน ความคืบหน้า คอมเมนต์ หรือเช็กลิสต์' },
      { method: 'DELETE', path: '/api/tasks/:id',                desc: 'เก็บงานเข้าคลัง (Archive)' },
      { method: 'GET',    path: '/api/projects',                 desc: 'ดึงรายการโปรเจกต์ทั้งหมด (รองรับ ?status=&q=)' },
      { method: 'POST',   path: '/api/projects',                 desc: 'สร้างโปรเจกต์ใหม่' },
      { method: 'PATCH',  path: '/api/projects/:id',             desc: 'แก้ไขโปรเจกต์' },
      { method: 'GET',    path: '/api/teams',                    desc: 'ดึงรายชื่อสมาชิกทีมและสถานะออนไลน์' },
      { method: 'GET',    path: '/api/chat/sync',                desc: 'ดึงห้องแชต ข้อความล่าสุด และไฟล์ที่แชร์' },
      { method: 'POST',   path: '/api/channels',                 desc: 'สร้างห้องแชตกลุ่มใหม่' },
      { method: 'POST',   path: '/api/channels/dm',              desc: 'เปิดหรือสร้างห้องแชตส่วนตัว 1-ต่อ-1' },
      { method: 'POST',   path: '/api/channels/:id/messages',    desc: 'ส่งข้อความเข้าห้องแชตหรือ DM (รองรับ replyTo และไฟล์แนบ)' },
      { method: 'GET',    path: '/api/drive',                    desc: 'ดูรายการไฟล์และโฟลเดอร์ Google Drive ของทีม' },
      { method: 'POST',   path: '/api/files/drive-link',         desc: 'แนบลิงก์ Google Drive เข้าห้องแชต/คลังไฟล์' },
      { method: 'POST',   path: '/api/files/upload',             desc: 'อัปโหลดไฟล์/รูปภาพ (Base64) เข้าห้องแชต' },
      { method: 'GET',    path: '/api/events',                   desc: 'ดึงนัดหมายปฏิทิน (รองรับ ?date=&from=&to=&cat=)' },
      { method: 'POST',   path: '/api/events',                   desc: 'เพิ่มนัดหมายในปฏิทินกลาง' },
      { method: 'PATCH',  path: '/api/events/:id',               desc: 'แก้ไขนัดหมายปฏิทิน' },
      { method: 'POST',   path: '/api/ai/dispatch',              desc: 'สั่งรันงาน AI Agent และโพสต์ผลเข้า #ai-feed' },
      { method: 'GET',    path: '/api/clients',                  desc: 'ดึงรายชื่อลูกค้า CRM (รองรับ ?q=)' },
      { method: 'POST',   path: '/api/clients',                  desc: 'เพิ่มลูกค้าใหม่ใน CRM' },
      { method: 'GET',    path: '/api/invoices',                 desc: 'ดึงรายการใบแจ้งหนี้ (รองรับ ?status=&client=)' },
      { method: 'POST',   path: '/api/invoices',                 desc: 'สร้างใบแจ้งหนี้ (คำนวณ VAT 7% อัตโนมัติ)' },
      { method: 'POST',   path: '/api/checkins/clock',           desc: 'ลงเวลาเข้างานรายวัน' },
      { method: 'POST',   path: '/api/bookings',                 desc: 'จองห้องประชุม สตูดิโอ หรืออุปกรณ์ (กันคิวชน)' },
      { method: 'GET',    path: '/api/db/audit',                 desc: 'ตรวจสอบสถานะและจำนวนแถวของตาราง MariaDB ทั้งหมด' },
    ],
  });
});

module.exports = {
  DEFAULT_POOL_SIZE,
  ensureTokenPool,
  verifyApiToken,
  loginHermesHandler,
  serveMarkdownDoc,
  router,
};
