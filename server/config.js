/* MNG ERP — server configuration (secrets live in .env only, never in git) */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const demoOnly = !process.env.DB_AUTH_PASS || !process.env.DB_WORK_PASS;
if (demoOnly) {
  console.warn('[config] DB_AUTH_PASS / DB_WORK_PASS not set — running static SPA in demo-fallback mode');
}

const base = {
  waitForConnections: true,
  connectionLimit: 6,
  queueLimit: 0,
  dateStrings: true,
  connectTimeout: 5000,
  ssl: false,
};

module.exports = {
  port: parseInt(process.env.PORT || '8080', 10),
  sessionDays: parseInt(process.env.SESSION_DAYS || '7', 10),
  demoOnly,
  authDb: {
    ...base,
    host: process.env.DB_AUTH_HOST || '203.146.252.149',
    port: parseInt(process.env.DB_AUTH_PORT || '3306', 10),
    user: process.env.DB_AUTH_USER || 'pacific_mng',
    password: process.env.DB_AUTH_PASS || '',
    database: process.env.DB_AUTH_NAME || 'pacific_mng',
  },
  workDb: {
    ...base,
    host: process.env.DB_WORK_HOST || '203.146.252.149',
    port: parseInt(process.env.DB_WORK_PORT || '3306', 10),
    user: process.env.DB_WORK_USER || 'pacific_mngworks',
    password: process.env.DB_WORK_PASS || '',
    database: process.env.DB_WORK_NAME || 'pacific_mngworks',
  },
};
