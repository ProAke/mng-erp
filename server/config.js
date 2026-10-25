/* MNG ERP — server configuration (secrets live in .env only, never in git) */
require('dotenv').config();

function req(name) {
  if (!process.env[name]) {
    console.error(`\n[config] missing env ${name} — copy .env.example to .env and fill it\n`);
    process.exit(1);
  }
  return process.env[name];
}

const base = { waitForConnections: true, connectionLimit: 6, queueLimit: 0, dateStrings: true, ssl: false };

module.exports = {
  port: parseInt(process.env.PORT || '4050', 10),
  sessionDays: parseInt(process.env.SESSION_DAYS || '7', 10),
  authDb: { ...base, host: process.env.DB_AUTH_HOST || '203.146.252.149', port: parseInt(process.env.DB_AUTH_PORT || '3306', 10),
    user: process.env.DB_AUTH_USER || 'pacific_mng',    password: req('DB_AUTH_PASS'), database: process.env.DB_AUTH_NAME || 'pacific_mng' },
  workDb: { ...base, host: process.env.DB_WORK_HOST || '203.146.252.149', port: parseInt(process.env.DB_WORK_PORT || '3306', 10),
    user: process.env.DB_WORK_USER || 'pacific_mngworks', password: req('DB_WORK_PASS'), database: process.env.DB_WORK_NAME || 'pacific_mngworks' },
};
