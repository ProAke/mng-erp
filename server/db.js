/* MNG ERP — DB pools + schema bootstrap
   Two SEPARATE pools (auth DB / works DB) — never cross-join, merge in code. */
const mysql = require('mysql2/promise');
const cfg = require('./config');

const authPool = mysql.createPool(cfg.authDb);   // pacific_mng        (users, sessions lookup)
const workPool = mysql.createPool(cfg.workDb);   // pacific_mngworks   (projects, tasks, erp_* tables)

/* ---------- schema: additive-only, safe for the existing workspace app ---------- */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS erp_team (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     name VARCHAR(100) NOT NULL, role VARCHAR(80) NOT NULL DEFAULT '',
     color VARCHAR(20) NOT NULL DEFAULT '#8E7CF3',
     email VARCHAR(255), phone VARCHAR(30), is_me TINYINT(1) DEFAULT 0,
     auth_user_id BIGINT UNSIGNED NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_clients (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     name VARCHAR(200) NOT NULL, short VARCHAR(60) NOT NULL DEFAULT '',
     color VARCHAR(20) NOT NULL DEFAULT '#3BA7FF',
     contact VARCHAR(200), phone VARCHAR(40), email VARCHAR(255),
     addr VARCHAR(400), since DATE NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_events (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     title VARCHAR(300) NOT NULL,
     cat VARCHAR(20) NOT NULL DEFAULT 'meeting',
     date DATE NOT NULL, start VARCHAR(5) DEFAULT '10:00', end VARCHAR(5) DEFAULT '11:00',
     allday TINYINT(1) DEFAULT 0, loc VARCHAR(200), descp TEXT,
     members LONGTEXT, project_id INT UNSIGNED NULL, task_id INT UNSIGNED NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_date (date), INDEX idx_cat (cat)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_invoices (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     no VARCHAR(30) NOT NULL UNIQUE,
     client_id INT UNSIGNED NULL, title VARCHAR(300) NOT NULL DEFAULT '',
     amount DECIMAL(15,2) NOT NULL DEFAULT 0, vat DECIMAL(15,2) NOT NULL DEFAULT 0,
     issue DATE NULL, due DATE NULL, paid DATE NULL,
     status VARCHAR(10) NOT NULL DEFAULT 'draft',
     items LONGTEXT,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_status (status), INDEX idx_due (due)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_activity (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     team_id INT UNSIGNED NULL, text TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_created (created_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_settings (
     id TINYINT UNSIGNED PRIMARY KEY, data LONGTEXT
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_sessions (
     token VARCHAR(64) PRIMARY KEY,
     user_id BIGINT UNSIGNED NOT NULL, name VARCHAR(100) NOT NULL,
     email VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'user',
     expires_at TIMESTAMP NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // additive ERP columns on the EXISTING tables (nothing removed/renamed)
  `ALTER TABLE projects
     ADD COLUMN IF NOT EXISTS erp_client_id INT UNSIGNED NULL,
     ADD COLUMN IF NOT EXISTS erp_client VARCHAR(200) NULL,
     ADD COLUMN IF NOT EXISTS erp_budget DECIMAL(15,2) NULL,
     ADD COLUMN IF NOT EXISTS erp_spent DECIMAL(15,2) NULL,
     ADD COLUMN IF NOT EXISTS erp_progress TINYINT UNSIGNED DEFAULT 0,
     ADD COLUMN IF NOT EXISTS erp_color VARCHAR(20) NULL,
     ADD COLUMN IF NOT EXISTS erp_grad VARCHAR(20) NULL,
     ADD COLUMN IF NOT EXISTS erp_start DATE NULL,
     ADD COLUMN IF NOT EXISTS erp_end DATE NULL,
     ADD COLUMN IF NOT EXISTS erp_members LONGTEXT NULL,
     ADD COLUMN IF NOT EXISTS erp_status VARCHAR(12) NULL,
     ADD COLUMN IF NOT EXISTS erp_archived TINYINT(1) DEFAULT 0`,
  `ALTER TABLE tasks
     ADD COLUMN IF NOT EXISTS erp_code VARCHAR(20) NULL,
     ADD COLUMN IF NOT EXISTS erp_start DATE NULL,
     ADD COLUMN IF NOT EXISTS erp_assignee INT UNSIGNED NULL,
     ADD COLUMN IF NOT EXISTS erp_est DECIMAL(6,2) NULL,
     ADD COLUMN IF NOT EXISTS erp_prio VARCHAR(10) NULL,
     ADD COLUMN IF NOT EXISTS erp_tags LONGTEXT NULL,
     ADD COLUMN IF NOT EXISTS erp_subtasks LONGTEXT NULL,
     ADD COLUMN IF NOT EXISTS erp_comments LONGTEXT NULL`,
];

async function ensureSchema() {
  const conn = await workPool.getConnection();
  try {
    for (const sql of SCHEMA) await conn.query(sql);
    console.log('[db] schema ready (authPool=users only, workPool=works data)');
  } finally { conn.release(); }
}

/* ping both pools, used on boot + /api/health */
async function healthCheck() {
  const out = { auth: false, work: false };
  try { await authPool.query('SELECT 1'); out.auth = true; } catch (e) { out.authErr = e.code || e.message; }
  try { await workPool.query('SELECT 1'); out.work = true; } catch (e) { out.workErr = e.code || e.message; }
  return out;
}

module.exports = { authPool, workPool, ensureSchema, healthCheck };
