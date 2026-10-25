/* MNG ERP — Google Drive integration (OAuth 2.0 flow) */
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, '.gdrive-token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'gdrive-credentials.json');

// Scopes needed for upload + read
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

function getOAuth2Client() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error('gdrive-credentials.json not found — create OAuth 2.0 credentials in Google Cloud Console');
  }
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web || {};
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0] || 'http://localhost:4050/api/drive/callback');
}

// Get authenticated drive client (or null if not yet authorized)
function getDriveClient() {
  const oauth2Client = getOAuth2Client();
  if (!fs.existsSync(TOKEN_PATH)) return null;
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  oauth2Client.setCredentials(token);
  return google.drive({ version: 'v3', auth: oauth2Client });
}

// Generate auth URL for user to visit
function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

// Exchange code for token
async function handleCallback(code) {
  const oauth2Client = getOAuth2Client();
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
    resource: fileMetadata,
    media,
    fields: 'id, name, webViewLink, webContentLink',
  });

  // Make file publicly readable (so CKEditor can display it)
  await drive.permissions.create({
    fileId: res.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    id: res.data.id,
    name: res.data.name,
    url: res.data.webContentLink || `https://drive.google.com/uc?id=${res.data.id}`,
    viewUrl: res.data.webViewLink,
  };
}

module.exports = {
  getAuthUrl,
  handleCallback,
  getDriveClient,
  uploadFile,
  TOKEN_PATH,
  CREDENTIALS_PATH,
};
