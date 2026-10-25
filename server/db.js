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

  `ALTER TABLE erp_team
     ADD COLUMN IF NOT EXISTS nickname VARCHAR(40) NULL,
     ADD COLUMN IF NOT EXISTS presence VARCHAR(20) DEFAULT 'online',
     ADD COLUMN IF NOT EXISTS skills LONGTEXT NULL`,

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

  /* ---------- iPlay Workspace / Agency OS additive tables ---------- */
  `CREATE TABLE IF NOT EXISTS erp_ai_agents (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     code VARCHAR(30) NOT NULL,
     name VARCHAR(100) NOT NULL,
     role VARCHAR(120) NOT NULL DEFAULT '',
     model VARCHAR(80) NOT NULL DEFAULT 'Claude 3.7 Sonnet',
     color VARCHAR(20) NOT NULL DEFAULT '#6C5CE7',
     autonomy TINYINT UNSIGNED DEFAULT 85,
     paused TINYINT(1) DEFAULT 0,
     runs INT UNSIGNED DEFAULT 0,
     success_rate DECIMAL(5,2) DEFAULT 98.5,
     tokens_today INT UNSIGNED DEFAULT 0,
     skills LONGTEXT NULL,
     prompt TEXT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_ai_runs (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     agent_id INT UNSIGNED NOT NULL,
     task_id INT UNSIGNED NULL,
     action VARCHAR(160) NOT NULL,
     detail TEXT NULL,
     duration_sec INT UNSIGNED DEFAULT 4,
     tokens INT UNSIGNED DEFAULT 850,
     status VARCHAR(20) DEFAULT 'ok',
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_agent (agent_id), INDEX idx_created (created_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_channels (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     slug VARCHAR(60) NOT NULL,
     name VARCHAR(120) NOT NULL,
     emoji VARCHAR(16) DEFAULT '💬',
     topic VARCHAR(300) DEFAULT '',
     is_private TINYINT(1) DEFAULT 0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_messages (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     channel_id INT UNSIGNED NOT NULL,
     sender_id VARCHAR(30) NOT NULL DEFAULT 'u1',
     sender_name VARCHAR(100) NOT NULL DEFAULT '',
     kind VARCHAR(20) DEFAULT 'text',
     body TEXT NOT NULL,
     pinned TINYINT(1) DEFAULT 0,
     reactions LONGTEXT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_chan (channel_id), INDEX idx_created (created_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_rooms (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     name VARCHAR(150) NOT NULL,
     kind VARCHAR(30) DEFAULT 'room',
     zone VARCHAR(100) DEFAULT 'ชั้น 3',
     capacity INT UNSIGNED DEFAULT 8,
     color VARCHAR(20) DEFAULT '#6C5CE7',
     equip LONGTEXT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_bookings (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     room_id INT UNSIGNED NOT NULL,
     title VARCHAR(250) NOT NULL,
     date DATE NOT NULL,
     start VARCHAR(5) NOT NULL DEFAULT '10:00',
     end VARCHAR(5) NOT NULL DEFAULT '11:00',
     host_id VARCHAR(30) DEFAULT 'u1',
     members LONGTEXT NULL,
     note VARCHAR(300) NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_room_date (room_id, date)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_checkins (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     member_id VARCHAR(30) NOT NULL,
     date DATE NOT NULL,
     clock_in VARCHAR(5) NOT NULL,
     clock_out VARCHAR(5) NULL,
     mode VARCHAR(20) DEFAULT 'office',
     note VARCHAR(250) NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_date (date), INDEX idx_member_date (member_id, date)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_leaves (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     member_id VARCHAR(30) NOT NULL,
     kind VARCHAR(20) DEFAULT 'annual',
     start_date DATE NOT NULL,
     end_date DATE NOT NULL,
     days DECIMAL(4,1) DEFAULT 1,
     reason VARCHAR(300) DEFAULT '',
     status VARCHAR(20) DEFAULT 'pending',
     approved_by VARCHAR(100) NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_status (status)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // additive ERP columns on the EXISTING tables (nothing removed/renamed)
  `ALTER TABLE projects
     ADD COLUMN IF NOT EXISTS erp_code VARCHAR(16) NULL,
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
     ADD COLUMN IF NOT EXISTS erp_spent DECIMAL(6,2) DEFAULT 0,
     ADD COLUMN IF NOT EXISTS erp_prio VARCHAR(10) NULL,
     ADD COLUMN IF NOT EXISTS erp_blocked TINYINT(1) DEFAULT 0,
     ADD COLUMN IF NOT EXISTS erp_block_reason VARCHAR(300) NULL,
     ADD COLUMN IF NOT EXISTS erp_ai_generated TINYINT(1) DEFAULT 0,
     ADD COLUMN IF NOT EXISTS erp_tags LONGTEXT NULL,
     ADD COLUMN IF NOT EXISTS erp_subtasks LONGTEXT NULL,
     ADD COLUMN IF NOT EXISTS erp_comments LONGTEXT NULL`,
];

async function ensureSchema() {
  const conn = await workPool.getConnection();
  try {
    for (const sql of SCHEMA) await conn.query(sql);
    console.log('[db] schema ready (authPool=users only, workPool=works + agency-os data)');
  } finally { conn.release(); }
}

/* ping both pools, used on boot + /api/health */
async function healthCheck() {
  if (cfg.demoOnly) {
    return { auth: false, work: false, demo: true, latencyMs: 0 };
  }
  const t0 = Date.now();
  const out = { auth: false, work: false, latencyMs: 0 };
  try { await authPool.query('SELECT 1'); out.auth = true; } catch (e) { out.authErr = e.code || e.message; }
  try { await workPool.query('SELECT 1'); out.work = true; } catch (e) { out.workErr = e.code || e.message; }
  out.latencyMs = Math.max(1, Date.now() - t0);
  return out;
}

module.exports = { authPool, workPool, ensureSchema, healthCheck };
