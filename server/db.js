/* MNG ERP — DB pools + schema bootstrap
   Two SEPARATE pools (auth DB / works DB) — never cross-join, merge in code. */
const mysql = require('mysql2/promise');
const cfg = require('./config');

const authPool = mysql.createPool(cfg.authDb);   // pacific_mng        (users, sessions lookup)
const workPool = mysql.createPool(cfg.workDb);   // pacific_mngworks   (projects, tasks, erp_* tables)

/* ---------- schema: additive-only, safe for the existing workspace app ---------- */
const TABLES = [
  `CREATE TABLE IF NOT EXISTS erp_team (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     name VARCHAR(100) NOT NULL, role VARCHAR(80) NOT NULL DEFAULT '',
     color VARCHAR(20) NOT NULL DEFAULT '#8E7CF3',
     email VARCHAR(255), phone VARCHAR(30), is_me TINYINT(1) DEFAULT 0,
     auth_user_id BIGINT UNSIGNED NULL,
     nickname VARCHAR(40) NULL,
     presence VARCHAR(20) DEFAULT 'online',
     skills LONGTEXT NULL,
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

  `CREATE TABLE IF NOT EXISTS erp_api_tokens (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     user_id BIGINT UNSIGNED NOT NULL,
     slot TINYINT UNSIGNED NOT NULL,
     token_hash CHAR(64) NOT NULL,
     token_enc VARCHAR(260) NOT NULL,
     token_preview VARCHAR(40) NOT NULL,
     label VARCHAR(80) DEFAULT 'hermes-pool',
     strict_dual_auth TINYINT(1) DEFAULT 0,
     use_count BIGINT UNSIGNED DEFAULT 0,
     last_used_at TIMESTAMP NULL,
     last_agent VARCHAR(140) NULL,
     revoked TINYINT(1) DEFAULT 0,
     expires_at TIMESTAMP NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uk_token_hash (token_hash),
     UNIQUE KEY uk_user_slot (user_id, slot),
     INDEX idx_user (user_id)
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
     slug VARCHAR(80) NOT NULL,
     name VARCHAR(120) NOT NULL,
     emoji VARCHAR(16) DEFAULT '💬',
     topic VARCHAR(300) DEFAULT '',
     chan_type VARCHAR(20) DEFAULT 'group',
     members LONGTEXT NULL,
     project_id INT UNSIGNED NULL,
     pinned TINYINT(1) DEFAULT 0,
     is_private TINYINT(1) DEFAULT 0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_slug (slug), INDEX idx_type (chan_type)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_messages (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     channel_id INT UNSIGNED NOT NULL,
     sender_id VARCHAR(30) NOT NULL DEFAULT 'u1',
     sender_name VARCHAR(100) NOT NULL DEFAULT '',
     kind VARCHAR(20) DEFAULT 'text',
     body TEXT NOT NULL,
     reply_to BIGINT UNSIGNED NULL,
     attachment_url VARCHAR(600) NULL,
     attachment_name VARCHAR(255) NULL,
     attachment_type VARCHAR(80) NULL,
     attachment_size INT UNSIGNED DEFAULT 0,
     pinned TINYINT(1) DEFAULT 0,
     reactions LONGTEXT NULL,
     edited_at TIMESTAMP NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_chan (channel_id), INDEX idx_created (created_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_files (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     channel_id INT UNSIGNED NULL,
     project_id INT UNSIGNED NULL,
     task_id INT UNSIGNED NULL,
     uploader_id VARCHAR(30) DEFAULT 'u1',
     uploader_name VARCHAR(100) DEFAULT '',
     name VARCHAR(255) NOT NULL,
     mime VARCHAR(120) DEFAULT 'application/octet-stream',
     size INT UNSIGNED DEFAULT 0,
     url VARCHAR(600) NOT NULL,
     source VARCHAR(30) DEFAULT 'upload',
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

  `CREATE TABLE IF NOT EXISTS erp_project_flows (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     project_id INT UNSIGNED NOT NULL,
     template_key VARCHAR(40) DEFAULT 'full_funnel',
     brief LONGTEXT NULL,
     zones LONGTEXT NULL,
     nodes LONGTEXT NULL,
     edges LONGTEXT NULL,
     mindmap LONGTEXT NULL,
     ai_stack LONGTEXT NULL,
     revision INT UNSIGNED NOT NULL DEFAULT 1,
     updated_by VARCHAR(100) NULL,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     UNIQUE KEY uk_proj_flow (project_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  /* งานส่งออกจาก Flow แยกจากงานในบอร์ดและมีประวัติทุกการเปลี่ยนสถานะ */
  `CREATE TABLE IF NOT EXISTS erp_flow_actions (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     event_id CHAR(36) NOT NULL,
     project_id INT UNSIGNED NOT NULL,
     node_id VARCHAR(64) NOT NULL,
     node_title VARCHAR(200) NOT NULL,
     kind VARCHAR(16) NOT NULL,
     title VARCHAR(200) NOT NULL,
     destination VARCHAR(200) NOT NULL DEFAULT '',
     content LONGTEXT NOT NULL,
     delivery_payload LONGTEXT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'draft',
     revision INT UNSIGNED NOT NULL DEFAULT 1,
     attempts INT UNSIGNED NOT NULL DEFAULT 0,
     created_by BIGINT UNSIGNED NOT NULL,
     created_name VARCHAR(100) NOT NULL,
     approved_by BIGINT UNSIGNED NULL,
     approved_name VARCHAR(100) NULL,
     approved_at TIMESTAMP NULL,
     accepted_at TIMESTAMP NULL,
     last_error VARCHAR(120) NOT NULL DEFAULT '',
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     UNIQUE KEY uk_flow_action_event (event_id),
     INDEX idx_flow_action_project (project_id, id),
     INDEX idx_flow_action_status (status)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_flow_action_events (
     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     action_id INT UNSIGNED NOT NULL,
     event_type VARCHAR(32) NOT NULL,
     actor_id BIGINT UNSIGNED NOT NULL,
     actor_name VARCHAR(100) NOT NULL,
     note VARCHAR(500) NOT NULL DEFAULT '',
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_flow_action_events (action_id, id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS erp_docs (
     id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     slug VARCHAR(80) NOT NULL,
     category VARCHAR(50) NOT NULL DEFAULT 'playbook',
     icon VARCHAR(16) DEFAULT '📘',
     title VARCHAR(240) NOT NULL,
     summary VARCHAR(400) DEFAULT '',
     body LONGTEXT NOT NULL,
     project_id INT UNSIGNED NULL,
     author_name VARCHAR(100) DEFAULT '',
     pinned TINYINT(1) DEFAULT 0,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_cat (category)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

/* Additive columns — executed individually ignoring ER_DUP_FIELDNAME (1060)
   so it works identically on both MariaDB and MySQL 8 without syntax errors */
const ADDITIVE_COLS = [
  ['erp_project_flows', 'revision INT UNSIGNED NOT NULL DEFAULT 1'],
  ['erp_flow_actions', 'delivery_payload LONGTEXT NULL'],
  ['erp_team', 'nickname VARCHAR(40) NULL'],
  ['erp_team', "presence VARCHAR(20) DEFAULT 'online'"],
  ['erp_team', 'skills LONGTEXT NULL'],

  ['erp_channels', "chan_type VARCHAR(20) DEFAULT 'group'"],
  ['erp_channels', 'members LONGTEXT NULL'],
  ['erp_channels', 'project_id INT UNSIGNED NULL'],
  ['erp_channels', 'pinned TINYINT(1) DEFAULT 0'],

  ['erp_messages', 'reply_to BIGINT UNSIGNED NULL'],
  ['erp_messages', 'attachment_url VARCHAR(600) NULL'],
  ['erp_messages', 'attachment_name VARCHAR(255) NULL'],
  ['erp_messages', 'attachment_type VARCHAR(80) NULL'],
  ['erp_messages', 'attachment_size INT UNSIGNED DEFAULT 0'],
  ['erp_messages', 'edited_at TIMESTAMP NULL'],

  ['projects', 'erp_code VARCHAR(16) NULL'],
  ['projects', 'erp_client_id INT UNSIGNED NULL'],
  ['projects', 'erp_client VARCHAR(200) NULL'],
  ['projects', 'erp_budget DECIMAL(15,2) NULL'],
  ['projects', 'erp_spent DECIMAL(15,2) NULL'],
  ['projects', 'erp_progress TINYINT UNSIGNED DEFAULT 0'],
  ['projects', 'erp_color VARCHAR(20) NULL'],
  ['projects', 'erp_grad VARCHAR(20) NULL'],
  ['projects', 'erp_start DATE NULL'],
  ['projects', 'erp_end DATE NULL'],
  ['projects', 'erp_members LONGTEXT NULL'],
  ['projects', 'erp_status VARCHAR(12) NULL'],
  ['projects', 'erp_archived TINYINT(1) DEFAULT 0'],

  ['tasks', 'erp_code VARCHAR(20) NULL'],
  ['tasks', 'erp_start DATE NULL'],
  ['tasks', 'erp_assignee INT UNSIGNED NULL'],
  ['tasks', 'erp_ai_agent VARCHAR(20) NULL'],
  ['tasks', 'erp_est DECIMAL(6,2) NULL'],
  ['tasks', 'erp_spent DECIMAL(6,2) DEFAULT 0'],
  ['tasks', 'erp_spent_hrs DECIMAL(6,2) DEFAULT 0'],
  ['tasks', 'erp_prio VARCHAR(10) NULL'],
  ['tasks', 'erp_blocked TINYINT(1) DEFAULT 0'],
  ['tasks', 'erp_block_reason VARCHAR(300) NULL'],
  ['tasks', 'erp_ai_generated TINYINT(1) DEFAULT 0'],
  ['tasks', 'erp_tags LONGTEXT NULL'],
  ['tasks', 'erp_subtasks LONGTEXT NULL'],
  ['tasks', 'erp_comments LONGTEXT NULL'],
];

async function ensureSchema() {
  const conn = await workPool.getConnection();
  try {
    for (const sql of TABLES) {
      await conn.query(sql);
    }
    // Check existing columns first in one fast query so we don't lock tables unnecessarily!
    const [existingCols] = await conn.query(
      `SELECT TABLE_NAME t, COLUMN_NAME c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('erp_team', 'erp_channels', 'erp_messages', 'erp_project_flows', 'erp_flow_actions', 'projects', 'tasks')`
    );
    const colSet = new Set(existingCols.map(r => `${r.t}.${r.c}`.toLowerCase()));
    for (const [tbl, def] of ADDITIVE_COLS) {
      const colName = def.split(/\s+/)[0].toLowerCase();
      if (colSet.has(`${tbl}.${colName}`)) continue;
      try {
        await conn.query(`ALTER TABLE ${tbl} ADD COLUMN ${def}`);
      } catch (e) {
        if (e.errno !== 1060 && e.code !== 'ER_DUP_FIELDNAME') {
          console.warn(`[db] alter ${tbl}.${colName} warn:`, e.message);
        }
      }
    }
    console.log('[db] schema ready (authPool=users only, workPool=works + agency-os + chat/files)');
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

module.exports = { authPool, workPool, ensureSchema, healthCheck, TABLES, ADDITIVE_COLS };
