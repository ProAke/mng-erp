/* MNG ERP — Google Drive REST routes */
const express = require('express');
const multer = require('multer');
const drive = require('./drive');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/drive/auth — redirect to Google OAuth
router.get('/auth', (req, res) => {
  try {
    const url = drive.getAuthUrl();
    res.redirect(url);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/drive/callback — OAuth callback
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    await drive.handleCallback(code);
    res.send('<html><body><h2>✅ Google Drive เชื่อมต่อสำเร็จ</h2><p>ปิดหน้านี้ได้เลย</p><script>setTimeout(()=>window.close(),2000)</script></body></html>');
  } catch (e) {
    res.status(500).send(`Error: ${e.message}`);
  }
});

// GET /api/drive/status — check if authorized
router.get('/status', (req, res) => {
  const client = drive.getDriveClient();
  res.json({ authorized: !!client });
});

// POST /api/drive/upload — upload file (multipart/form-data)
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const folderId = process.env.GDRIVE_FOLDER_ID || null;
    const result = await drive.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      folderId
    );
    res.json(result);
  } catch (e) {
    console.error('[drive/upload]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
