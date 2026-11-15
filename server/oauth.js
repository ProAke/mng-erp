/* MNG ERP — เชื่อมบัญชี LINE Login / Google OpenID Connect โดยไม่เก็บ access/refresh token */
'use strict';
const express = require('express');
const crypto = require('crypto');
const https = require('https');
const bcrypt = require('bcryptjs');
const db = require('./db');
const auth = require('./auth');

const ENDPOINTS = Object.freeze({
  google: { authorize:'https://accounts.google.com/o/oauth2/v2/auth', token:'https://oauth2.googleapis.com/token', jwks:'https://www.googleapis.com/oauth2/v3/certs', scope:'openid email' },
  line: { authorize:'https://access.line.me/oauth2/v2.1/authorize', token:'https://api.line.me/oauth2/v2.1/token', verify:'https://api.line.me/oauth2/v2.1/verify', scope:'openid' },
});
const random = () => crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const err = (status, message, publicCode = 'failed') => Object.assign(new Error(message), { status, publicCode });

function configFrom(env) {
  let origin = '';
  try {
    const u = new URL(env.OAUTH_PUBLIC_URL || '');
    const localHttp = env.OAUTH_ALLOW_HTTP_LOCAL === '1' && u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname);
    if ((u.protocol === 'https:' || localHttp) && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash) origin = u.origin;
  } catch {}
  const providers = {};
  for (const [name, prefix] of [['google','GOOGLE'],['line','LINE']]) {
    const id = String(env[prefix+'_OAUTH_CLIENT_ID'] || '').trim();
    const secret = String(env[prefix+'_OAUTH_CLIENT_SECRET'] || '').trim();
    providers[name] = { ...ENDPOINTS[name], id, secret, enabled:!!(origin && id && secret) };
  }
  return { origin, secure:origin.startsWith('https:'), providers };
}

// ปลายทาง HTTPS เป็นค่าคงที่ในโค้ดเท่านั้น ไม่ติดตาม redirect หรือรับ URL จากผู้ใช้
function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.form ? new URLSearchParams(options.form).toString() : '';
    const request = https.request(url, {
      method:options.method || 'GET',
      headers:{ Accept:'application/json', ...(body ? {'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)} : {}) },
      timeout:10000,
    }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 256 * 1024) { response.destroy(new Error('provider_response_too_large')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error('provider_request_failed'));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('provider_invalid_json')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('provider_timeout')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

function readCookie(req, name) {
  const vals = String(req.headers.cookie || '').split(';').map(s => s.trim()).filter(s => s.startsWith(name + '='));
  return vals.length === 1 ? vals[0].slice(name.length + 1) : '';
}
function equalSecret(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}
function validClaims(claims, provider, clientId, nonce, now = Date.now()) {
  const iss = provider === 'google' ? ['https://accounts.google.com','accounts.google.com'] : ['https://access.line.me'];
  return claims && iss.includes(claims.iss) && claims.aud === clientId &&
    (!claims.azp || claims.azp === clientId) && typeof claims.sub === 'string' && /^[\x21-\x7e]{1,255}$/.test(claims.sub) &&
    typeof claims.exp === 'number' && Number.isFinite(claims.exp) && claims.exp > now / 1000 &&
    typeof claims.iat === 'number' && Number.isFinite(claims.iat) && claims.iat <= now / 1000 + 60 &&
    equalSecret(claims.nonce, nonce);
}
function decodePart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('invalid_jwt');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function createOAuth({ authPool = db.authPool, workPool = db.workPool, createSession = auth.createSession, env = process.env, transport = requestJson } = {}) {
  const cfg = configFrom(env);
  const publicRouter = express.Router(), connectionRouter = express.Router();
  const stateCookie = cfg.secure ? '__Host-mng_oauth_state' : 'mng_oauth_state_dev';
  const resultCookie = cfg.secure ? '__Host-mng_oauth_result' : 'mng_oauth_result_dev';
  const cookieOpts = (sameSite, maxAge) => ({ httpOnly:true, secure:cfg.secure, sameSite, path:'/', maxAge });
  let googleKeys = null, keysUntil = 0;

  function sameOrigin(req) {
    const origin = req.headers.origin;
    return !!cfg.origin && (!origin || origin === cfg.origin) && req.headers['sec-fetch-site'] !== 'cross-site';
  }
  // การยกเลิกผูกยังต้องทำได้เมื่อถอด OAuth URL/credential ออกแล้ว: ใช้ bearer + รหัสผ่าน
  // และปฏิเสธ cross-site; เบราว์เซอร์เก่าที่ไม่มี Fetch Metadata ต้องมี Origin ตรง Host
  function sameOriginForUnlink(req) {
    if (cfg.origin) return sameOrigin(req);
    const site = req.headers['sec-fetch-site'], origin = req.headers.origin;
    if (site) return site === 'same-origin';
    if (!origin) return true; // non-browser client ต้องมี web session และรหัสผ่านด้วย
    try {
      const url = new URL(origin);
      return ['https:','http:'].includes(url.protocol) && url.host === req.headers.host;
    } catch { return false; }
  }
  function provider(name) {
    const p = cfg.providers[name];
    if (!p || !p.enabled) throw err(503, 'ยังไม่ได้ตั้งค่าการเชื่อมต่อผู้ให้บริการนี้', 'unavailable');
    return p;
  }
  function standardSession(req) {
    if (!req.user || !req.token || String(req.token).startsWith('mng_s')) throw err(403, 'กรุณาเข้าสู่ระบบเว็บด้วยบัญชีของคุณก่อน');
  }
  async function verifyPassword(req, password) {
    standardSession(req);
    if (typeof password !== 'string' || !password || password.length > 1024) throw err(400, 'กรุณากรอกรหัสผ่านบัญชี ERP ปัจจุบัน');
    const [rows] = await authPool.query('SELECT password FROM users WHERE id=? LIMIT 1', [req.user.user_id]);
    if (!rows.length || !await bcrypt.compare(password, rows[0].password)) throw err(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  }
  function fail(res, e) {
    if (!e.status) console.error('[oauth]', e.code || 'operation_failed');
    res.status(e.status || 503).json({ error:e.status ? e.message : 'ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่ภายหลัง' });
  }
  function clear(res, name) { res.clearCookie(name, { httpOnly:true, secure:cfg.secure, sameSite:name === stateCookie ? 'lax' : 'strict', path:'/' }); }

  async function start(req, res, purpose) {
    try {
      if (!sameOrigin(req)) throw err(403, 'ต้นทางคำขอไม่ถูกต้อง');
      const name = req.params.provider, p = provider(name);
      if (purpose === 'link') await verifyPassword(req, req.body?.password);
      const state = random(), verifier = random(), nonce = random();
      await workPool.query('DELETE FROM erp_oauth_states WHERE expires_at<=NOW()');
      await workPool.query(`INSERT INTO erp_oauth_states (state_hash,provider,purpose,user_id,session_hash,verifier,nonce,expires_at)
        VALUES (?,?,?,?,?,?,?,DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [hash(state), name, purpose, purpose === 'link' ? req.user.user_id : null, purpose === 'link' ? hash(req.token) : null, verifier, nonce]);
      const url = new URL(p.authorize);
      url.search = new URLSearchParams({ response_type:'code', client_id:p.id, redirect_uri:cfg.origin + '/api/oauth/' + name + '/callback',
        scope:p.scope, state, nonce, code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method:'S256',
        ...(name === 'google' ? { prompt:'select_account' } : {}) }).toString();
      res.cookie(stateCookie, state, cookieOpts('lax', 10 * 60 * 1000));
      res.json({ url:url.toString() });
    } catch (e) { fail(res, e); }
  }

  async function consume(table, field, value, retainLinkClaim = false) {
    const conn = await workPool.getConnection();
    try {
      await conn.beginTransaction();
      // ใช้ครั้งเดียว: เปลี่ยน key ของ link state ก่อนแลก code เพื่อกัน replay
      // แต่เก็บ claim ชั่วคราวให้การยกเลิกผูกสามารถตัด callback ที่กำลังคุยกับ provider ได้
      const key = hash(value);
      const [rows] = await conn.query(`SELECT * FROM ${table} WHERE ${field}=? AND expires_at>NOW() FOR UPDATE`, [key]);
      if (!rows.length) { await conn.rollback(); return null; }
      if (retainLinkClaim && rows[0].purpose === 'link') {
        const claim = hash(random());
        // คง expiry บน MariaDB รุ่นที่เติม ON UPDATE ให้ TIMESTAMP แรกโดยอัตโนมัติ
        await conn.query('UPDATE erp_oauth_states SET state_hash=?, expires_at=expires_at WHERE state_hash=?', [claim, key]);
        rows[0].claimHash = claim;
      } else {
        await conn.query(`DELETE FROM ${table} WHERE ${field}=?`, [key]);
      }
      await conn.commit();
      return rows[0];
    } catch (e) { await conn.rollback().catch(() => {}); throw e; }
    finally { conn.release(); }
  }

  async function googleClaims(idToken, p, nonce) {
    if (typeof idToken !== 'string' || idToken.length > 16384) throw new Error('invalid_id_token');
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('invalid_id_token');
    const head = decodePart(parts[0]), claims = decodePart(parts[1]);
    if (head.alg !== 'RS256' || typeof head.kid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(head.kid) || !/^[A-Za-z0-9_-]+$/.test(parts[2])) throw new Error('invalid_id_token');
    async function loadKeys() {
      const data = await transport(ENDPOINTS.google.jwks, { method:'GET' });
      if (!Array.isArray(data.keys)) throw new Error('invalid_jwks');
      googleKeys = data.keys; keysUntil = Date.now() + 60 * 60 * 1000;
    }
    if (!googleKeys || Date.now() >= keysUntil) await loadKeys();
    let key = googleKeys.find(k => k.kid === head.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256'));
    if (!key) { await loadKeys(); key = googleKeys.find(k => k.kid === head.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256')); }
    if (!key || !crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey({ key, format:'jwk' }), Buffer.from(parts[2], 'base64url')) ||
        !validClaims(claims, 'google', p.id, nonce)) throw new Error('invalid_id_token');
    return claims;
  }

  async function exchange(name, p, code, row) {
    if (typeof code !== 'string' || !code || code.length > 2048) throw new Error('invalid_code');
    const tokens = await transport(p.token, { method:'POST', form:{ grant_type:'authorization_code', code,
      redirect_uri:cfg.origin + '/api/oauth/' + name + '/callback', client_id:p.id, client_secret:p.secret, code_verifier:row.verifier } });
    if (!tokens || typeof tokens.id_token !== 'string' || tokens.id_token.length > 16384) throw new Error('invalid_id_token');
    if (name === 'google') return googleClaims(tokens.id_token, p, row.nonce);
    const claims = await transport(p.verify, { method:'POST', form:{ id_token:tokens.id_token, client_id:p.id, nonce:row.nonce } });
    if (!validClaims(claims, 'line', p.id, row.nonce)) throw new Error('invalid_id_token');
    return claims;
  }

  function verifiedEmail(name, claims) {
    return name === 'google' && claims.email_verified === true && typeof claims.email === 'string' && claims.email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ? claims.email : null;
  }
  async function linkIdentity(row, name, claims) {
    const [users] = await authPool.query('SELECT id,status FROM users WHERE id=? LIMIT 1', [row.user_id]);
    if (!users.length || users[0].status !== 'active') throw err(403, 'account_inactive', 'account_inactive');
    const email = verifiedEmail(name, claims);
    const conn = await workPool.getConnection();
    try {
      await conn.beginTransaction();
      const [sessions] = await conn.query('SELECT token FROM erp_sessions WHERE user_id=? AND SHA2(token,256)=? AND expires_at>NOW() LIMIT 1 FOR UPDATE', [row.user_id, row.session_hash]);
      if (!sessions.length) throw err(401, 'session_expired', 'session_expired');
      // การยกเลิกผูกลบ claim นี้ภายใต้ transaction เดียวกับ identity
      const [pending] = await conn.query("SELECT state_hash FROM erp_oauth_states WHERE state_hash=? AND user_id=? AND provider=? AND purpose='link' AND expires_at>NOW() FOR UPDATE", [row.claimHash, row.user_id, name]);
      if (!pending.length) throw err(400, 'link_cancelled', 'expired');
      try {
        await conn.query('INSERT INTO erp_oauth_identities (provider,subject,user_id,provider_email) VALUES (?,?,?,?)', [name, claims.sub, row.user_id, email]);
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY') throw e;
        const [existing] = await conn.query('SELECT subject,user_id FROM erp_oauth_identities WHERE provider=? AND (subject=? OR user_id=?)', [name, claims.sub, row.user_id]);
        if (existing.length !== 1 || String(existing[0].user_id) !== String(row.user_id) || String(existing[0].subject) !== claims.sub)
          throw err(409, 'identity_in_use', 'conflict');
        await conn.query('UPDATE erp_oauth_identities SET provider_email=? WHERE provider=? AND subject=? AND user_id=?', [email, name, claims.sub, row.user_id]);
      }
      await conn.query('DELETE FROM erp_oauth_states WHERE state_hash=?', [row.claimHash]);
      await conn.commit();
    } catch (e) { await conn.rollback().catch(() => {}); throw e; }
    finally { conn.release(); }
  }

  async function loginIdentity(name, claims, res) {
    const ticket = random(), conn = await workPool.getConnection();
    try {
      await conn.beginTransaction();
      // ล็อกความสัมพันธ์จนสร้าง session เสร็จ: หากยกเลิกก่อน จะไม่ออก session จากข้อมูลเก่า
      const [ids] = await conn.query('SELECT user_id FROM erp_oauth_identities WHERE provider=? AND subject=? LIMIT 1 FOR UPDATE', [name, claims.sub]);
      if (!ids.length) throw err(403, 'not_linked', 'not_linked');
      const [users] = await authPool.query('SELECT id,email,name,role,status FROM users WHERE id=? LIMIT 1', [ids[0].user_id]);
      if (!users.length || users[0].status !== 'active') throw err(403, 'account_inactive', 'account_inactive');
      if (name === 'google') await conn.query('UPDATE erp_oauth_identities SET provider_email=? WHERE provider=? AND subject=?', [verifiedEmail(name, claims), name, claims.sub]);
      const session = await createSession(users[0], conn);
      await conn.query('DELETE FROM erp_oauth_results WHERE expires_at<=NOW()');
      await conn.query('INSERT INTO erp_oauth_results (result_hash,session_token,expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 1 MINUTE))', [hash(ticket), session.token]);
      await conn.commit();
    } catch (e) { await conn.rollback().catch(() => {}); throw e; }
    finally { conn.release(); }
    res.cookie(resultCookie, ticket, cookieOpts('strict', 60 * 1000));
  }

  publicRouter.get('/providers', (_req, res) => res.json({ google:{enabled:cfg.providers.google.enabled}, line:{enabled:cfg.providers.line.enabled} }));
  publicRouter.post('/:provider/start', (req, res) => start(req, res, 'login'));
  publicRouter.get('/:provider/callback', async (req, res) => {
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Cache-Control', 'no-store');
    res.set('X-Frame-Options', 'DENY');
    let purpose = 'login', result = 'failed', claimHash = null;
    try {
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      const cookie = readCookie(req, stateCookie);
      clear(res, stateCookie);
      if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !equalSecret(state, cookie)) throw err(400, 'invalid_state', 'expired');
      const row = await consume('erp_oauth_states', 'state_hash', state, true);
      claimHash = row?.claimHash || null;
      if (!row || row.provider !== req.params.provider || !['login','link'].includes(row.purpose)) throw err(400, 'invalid_state', 'expired');
      purpose = row.purpose;
      const p = provider(req.params.provider);
      if (req.query.error) throw err(400, 'authorization_cancelled', 'cancelled');
      const claims = await exchange(req.params.provider, p, req.query.code, row);
      if (purpose === 'link') { await linkIdentity(row, req.params.provider, claims); result = 'linked'; }
      else { await loginIdentity(req.params.provider, claims, res); result = 'login'; }
    } catch (e) { result = e.publicCode || 'failed'; }
    finally {
      // เมื่อเกิดข้อผิดพลาดหรือผู้ใช้ยกเลิก ไม่ทิ้ง claim ไว้จนหมดอายุ
      if (claimHash) await workPool.query('DELETE FROM erp_oauth_states WHERE state_hash=?', [claimHash]).catch(() => {});
    }
    // ไม่ส่ง code, state, subject หรือ session ใน URL และไม่ใช้ redirect จากผู้ใช้
    res.redirect(303, '/?oauth=' + result + (purpose === 'link' ? '#/profile' : ''));
  });
  publicRouter.post('/complete', async (req, res) => {
    try {
      if (!sameOrigin(req)) throw err(403, 'ต้นทางคำขอไม่ถูกต้อง');
      const ticket = readCookie(req, resultCookie); clear(res, resultCookie);
      if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw err(400, 'การเข้าสู่ระบบหมดเวลา กรุณาลองใหม่');
      const row = await consume('erp_oauth_results', 'result_hash', ticket);
      if (!row) throw err(400, 'การเข้าสู่ระบบหมดเวลา กรุณาลองใหม่');
      const [sessions] = await workPool.query('SELECT user_id FROM erp_sessions WHERE token=? AND expires_at>NOW() LIMIT 1', [row.session_token]);
      const [users] = sessions.length ? await authPool.query('SELECT status FROM users WHERE id=? LIMIT 1', [sessions[0].user_id]) : [[]];
      if (!users.length || users[0].status !== 'active') {
        await workPool.query('DELETE FROM erp_sessions WHERE token=?', [row.session_token]).catch(() => {});
        throw err(403, 'บัญชีนี้ไม่ได้เปิดใช้งานหรือ session หมดอายุ');
      }
      res.json({ token:row.session_token });
    } catch (e) { fail(res, e); }
  });

  connectionRouter.get('/', async (req, res) => {
    try {
      const [rows] = await workPool.query('SELECT provider,provider_email FROM erp_oauth_identities WHERE user_id=?', [req.user.user_id]);
      const out = {};
      for (const name of ['google','line']) {
        const r = rows.find(x => x.provider === name);
        out[name] = { enabled:cfg.providers[name].enabled, linked:!!r, email:r?.provider_email || null };
      }
      res.json(out);
    } catch (e) { fail(res, e); }
  });
  connectionRouter.post('/:provider/start', (req, res) => start(req, res, 'link'));
  connectionRouter.delete('/:provider', async (req, res) => {
    let conn;
    try {
      if (!sameOriginForUnlink(req)) throw err(403, 'ต้นทางคำขอไม่ถูกต้อง');
      if (!Object.prototype.hasOwnProperty.call(ENDPOINTS, req.params.provider)) throw err(404, 'ไม่พบผู้ให้บริการ');
      await verifyPassword(req, req.body?.password);
      conn = await workPool.getConnection(); await conn.beginTransaction();
      // ลบคำขอที่รอและ claim ที่กำลังแลก code ก่อนลบ identity ใน transaction เดียวกัน
      await conn.query("DELETE FROM erp_oauth_states WHERE user_id=? AND provider=? AND purpose='link'", [req.user.user_id, req.params.provider]);
      await conn.query('DELETE FROM erp_oauth_identities WHERE user_id=? AND provider=?', [req.user.user_id, req.params.provider]);
      await conn.commit();
      res.json({ ok:true });
    } catch (e) { if (conn) await conn.rollback().catch(() => {}); fail(res, e); }
    finally { conn?.release(); }
  });

  return { publicRouter, connectionRouter };
}

module.exports = { createOAuth, configFrom, validClaims, requestJson };
