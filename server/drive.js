/* MNG ERP — Google Drive integration (OAuth 2.0 flow with safe status & CSRF state) */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let google = null;
try {
  ({ google } = require('googleapis'));
} catch {
  console.warn('[drive] googleapis package not available — local upload fallback active');
}

const TOKEN_PATH = path.join(__dirname, '.gdrive-token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'gdrive-credentials.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Scopes needed for upload + read
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Short-lived OAuth CSRF state store (10 minutes)
const pendingStates = new Map();

function createOAuthState(userId) {
  const now = Date.now();
  for (const [k, exp] of pendingStates.entries()) {
    if (exp.expiresAt < now) pendingStates.delete(k);
  }
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, { userId, expiresAt: now + 10 * 60 * 1000 });
  return state;
}

function consumeOAuthState(state) {
  if (!state || !pendingStates.has(state)) return null;
  const entry = pendingStates.get(state);
  pendingStates.delete(state);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

function hasCredentials() {
  return !!google && fs.existsSync(CREDENTIALS_PATH);
}

function resolveRedirectUri(creds, origin) {
  if (process.env.GDRIVE_REDIRECT_URI) return process.env.GDRIVE_REDIRECT_URI;
  const list = (creds.web?.redirect_uris || creds.installed?.redirect_uris || []);
  if (origin) {
    const matching = list.find((u) => u.startsWith(origin));
    if (matching) return matching;
  }
  if (list[0] && (!origin || !list[0].includes('localhost'))) return list[0];
  return `${origin || 'http://localhost:8080'}/api/drive/callback`;
}

function getOAuth2Client(origin) {
  if (!google) {
    throw new Error('googleapis package is not installed');
  }
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error('gdrive-credentials.json not found — create OAuth 2.0 credentials in Google Cloud Console');
  }
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret } = creds.installed || creds.web || {};
  const redirectUri = resolveRedirectUri(creds, origin);
  return new google.auth.OAuth2(client_id, client_secret, redirectUri);
}

// Get authenticated drive client (or null if not yet configured/authorized)
function getDriveClient(origin) {
  if (!hasCredentials()) return null;
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    const oauth2Client = getOAuth2Client(origin);
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(token);
    return google.drive({ version: 'v3', auth: oauth2Client });
  } catch {
    return null;
  }
}

function getStatus() {
  const configured = hasCredentials();
  const client = configured ? getDriveClient() : null;
  return {
    configured,
    authorized: !!client,
    fallback: 'local',
  };
}

// Generate auth URL for user to visit
function getAuthUrl(origin, state) {
  const oauth2Client = getOAuth2Client(origin);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state,
  });
}

// Exchange code for token
async function handleCallback(code, origin) {
  const oauth2Client = getOAuth2Client(origin);
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  return tokens;
}

// Upload file to Google Drive
async function uploadFile(fileBuffer, fileName, mimeType, folderId) {
  const drive = getDriveClient();
  if (!drive) throw new Error('Google Drive not authorized — visit /api/drive/auth first');

  const { Readable } = require('stream');
  const stream = new Readable();
  stream.push(fileBuffer);
  stream.push(null);

  const fileMetadata = { name: fileName };
  if (folderId) fileMetadata.parents = [folderId];

  const media = { mimeType, body: stream };

  const res = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, name, webViewLink, webContentLink',
  });

  // Make file publicly readable (so CKEditor can display it inline)
  await drive.permissions.create({
    fileId: res.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  const fileId = res.data.id;
  return {
    id: fileId,
    name: res.data.name,
    url: `https://lh3.googleusercontent.com/d/${fileId}`,
    downloadUrl: res.data.webContentLink || `https://drive.google.com/uc?id=${fileId}`,
    viewUrl: res.data.webViewLink,
    storage: 'gdrive',
  };
}

// Local disk fallback when Google Drive credentials/token are not configured yet
function saveLocalUpload(fileBuffer, originalName, mimeType) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const extMap = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };
  const origExt = path.extname(originalName || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const ext = extMap[mimeType] || origExt || '.bin';
  const id = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const safeFile = `${id}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, safeFile), fileBuffer);
  return {
    id,
    name: originalName || safeFile,
    url: `/uploads/${safeFile}`,
    viewUrl: `/uploads/${safeFile}`,
    storage: 'local',
  };
}

module.exports = {
  getAuthUrl,
  handleCallback,
  getDriveClient,
  getStatus,
  hasCredentials,
  createOAuthState,
  consumeOAuthState,
  uploadFile,
  saveLocalUpload,
  TOKEN_PATH,
  CREDENTIALS_PATH,
  UPLOADS_DIR,
};
