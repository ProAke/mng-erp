/* MNG ERP — Google Drive & Media Upload REST routes */
const express = require('express');
const auth = require('./auth');
const drive = require('./drive');

let multer = null;
try {
  multer = require('multer');
} catch {
  console.warn('[drive-routes] multer not installed');
}

const router = express.Router();
const upload = multer
  ? multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
  : null;

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

function requestOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:8080';
  return `${proto}://${host}`;
}

// Helper: accept Bearer header OR ?token= query param (needed for browser OAuth popup navigation)
async function authHeaderOrQuery(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : String(req.query.token || '');
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = await auth.verifyToken(token);
    req.token = token;
    next();
  } catch (e) {
    res.status(e.status || 401).json({ error: e.message || 'unauthorized' });
  }
}

// GET /api/drive/status — check if configured & authorized (never throws 500 if unconfigured)
router.get('/status', auth.middleware, (_req, res) => {
  res.json(drive.getStatus());
});

// GET /api/drive/auth — redirect (or return JSON url) to Google OAuth
router.get('/auth', authHeaderOrQuery, (req, res) => {
  try {
    const state = drive.createOAuthState(req.user.user_id);
    const url = drive.getAuthUrl(requestOrigin(req), state);
    if (req.query.json === '1') return res.json({ url });
    res.redirect(url);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/drive/callback — Google OAuth browser redirect callback (validated via state)
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing authorization code');
  const valid = drive.consumeOAuthState(String(state || ''));
  if (!valid) return res.status(400).send('Invalid or expired OAuth state — กรุณากดเชื่อมต่อใหม่อีกครั้ง');
  try {
    await drive.handleCallback(String(code), requestOrigin(req));
    res.send(
      '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>Google Drive Connected</title></head>' +
      '<body style="font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
      '<div style="text-align:center"><h2>✅ เชื่อมต่อ Google Drive สำเร็จ</h2><p>หน้าต่างนี้จะปิดอัตโนมัติ…</p></div>' +
      '<script>if(window.opener){window.opener.postMessage({type:"gdrive-connected"},"*");}setTimeout(()=>window.close(),1500);</script></body></html>'
    );
  } catch (e) {
    res.status(500).send(`Error: ${e.message}`);
  }
});

// POST /api/drive/upload — upload image/file (Google Drive when authorized, local fallback otherwise)
router.post(
  '/upload',
  auth.middleware,
  (req, res, next) => {
    if (!upload) return res.status(503).json({ error: 'upload_unavailable' });
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'upload_error' });
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด' });
      if (!ALLOWED_MIMES.has(req.file.mimetype)) {
        return res.status(400).json({ error: 'รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, GIF, WEBP) และ PDF' });
      }
      const folderId = process.env.GDRIVE_FOLDER_ID || null;
      const status = drive.getStatus();
      if (status.authorized) {
        try {
          const result = await drive.uploadFile(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            folderId
          );
          return res.json(result);
        } catch (driveErr) {
          console.warn('[drive/upload] Drive upload failed, falling back to local storage:', driveErr.message);
        }
      }
      const saved = drive.saveLocalUpload(req.file.buffer, req.file.originalname, req.file.mimetype);
      res.json(saved);
    } catch (e) {
      console.error('[drive/upload]', e.message);
      res.status(500).json({ error: e.message });
    }
  }
);

module.exports = router;
