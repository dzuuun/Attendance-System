const pool = require("../../db/db");
const { addColumns } = require("../../db/schema");

async function ensureTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS kiosks (
    id VARCHAR(80) PRIMARY KEY,
    kiosk_type VARCHAR(32) NOT NULL,
    location VARCHAR(120) NOT NULL,
    display_name VARCHAR(120) NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at DATETIME NOT NULL,
    user_agent VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_kiosks_seen (last_seen_at),
    INDEX idx_kiosks_type_location (kiosk_type, location)
  )`);
  await addColumns("kiosks", [
    ["ip_address", "VARCHAR(64) NULL"],
    ["hostname", "VARCHAR(255) NULL"],
    ["uptime_seconds", "BIGINT UNSIGNED NULL"],
    ["browser_status", "VARCHAR(40) NULL"],
    ["current_page", "VARCHAR(500) NULL"],
    ["mac_address", "VARCHAR(32) NULL"],
    ["agent_last_seen_at", "DATETIME NULL"],
    ["operating_system", "VARCHAR(160) NULL"],
  ]);
  await pool.query(`CREATE TABLE IF NOT EXISTS kiosk_commands (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kiosk_id VARCHAR(80) NOT NULL,
    command VARCHAR(40) NOT NULL,
    channel ENUM('browser','agent') NOT NULL,
    payload JSON NULL,
    status ENUM('Queued','Dispatched','Completed','Failed','Unsupported') NOT NULL DEFAULT 'Queued',
    result_text VARCHAR(1000) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dispatched_at DATETIME NULL,
    completed_at DATETIME NULL,
    INDEX idx_kiosk_commands_poll (kiosk_id,channel,status,id),
    CONSTRAINT fk_kiosk_commands_kiosk FOREIGN KEY (kiosk_id) REFERENCES kiosks(id) ON DELETE CASCADE
  )`);
}

exports.heartbeat = async ({
  id,
  type,
  location,
  name,
  userAgent,
  ipAddress,
  hostname,
  uptimeSeconds,
  browserStatus,
  currentPage,
  macAddress,
  operatingSystem,
  agent,
}) => {
  await ensureTable();
  await pool.query(
    `INSERT INTO kiosks (id,kiosk_type,location,display_name,last_seen_at,user_agent,ip_address,hostname,uptime_seconds,browser_status,current_page,mac_address,operating_system,agent_last_seen_at)
     VALUES (?,?,?,?,NOW(),?,?,?,?,?,?,?,?,IF(?,NOW(),NULL))
     ON DUPLICATE KEY UPDATE kiosk_type=VALUES(kiosk_type),location=VALUES(location),
       display_name=COALESCE(VALUES(display_name),display_name),last_seen_at=NOW(),user_agent=VALUES(user_agent),
       ip_address=COALESCE(VALUES(ip_address),ip_address),hostname=COALESCE(VALUES(hostname),hostname),
       uptime_seconds=COALESCE(VALUES(uptime_seconds),uptime_seconds),browser_status=COALESCE(VALUES(browser_status),browser_status),
       current_page=COALESCE(VALUES(current_page),current_page),mac_address=COALESCE(VALUES(mac_address),mac_address),operating_system=COALESCE(VALUES(operating_system),operating_system),
       agent_last_seen_at=${agent ? "NOW()" : "agent_last_seen_at"}`,
    [
      id,
      type,
      location,
      name || null,
      userAgent || null,
      ipAddress || null,
      hostname || null,
      uptimeSeconds || null,
      browserStatus || null,
      currentPage || null,
      macAddress || null,
      operatingSystem || null,
      Boolean(agent),
    ],
  );
  return exports.getById(id);
};

exports.getById = async (id) => {
  await ensureTable();
  const [rows] = await pool.query(
    `SELECT id,kiosk_type kioskType,location,display_name displayName,is_enabled isEnabled,
      user_agent userAgent,ip_address ipAddress,hostname,uptime_seconds uptimeSeconds,browser_status browserStatus,current_page currentPage,mac_address macAddress,operating_system operatingSystem,agent_last_seen_at agentLastSeenAt,
      last_seen_at lastSeenAt,created_at createdAt,updated_at updatedAt
     FROM kiosks WHERE id=? LIMIT 1`,
    [id],
  );
  return rows[0];
};

exports.getAll = async () => {
  await ensureTable();
  const [rows] = await pool.query(
    `SELECT id,kiosk_type kioskType,location,display_name displayName,is_enabled isEnabled,
      user_agent userAgent,ip_address ipAddress,hostname,uptime_seconds uptimeSeconds,browser_status browserStatus,current_page currentPage,mac_address macAddress,operating_system operatingSystem,agent_last_seen_at agentLastSeenAt,
      last_seen_at lastSeenAt,created_at createdAt,
      last_seen_at >= DATE_SUB(NOW(), INTERVAL 3 MINUTE) isOnline,
      agent_last_seen_at >= DATE_SUB(NOW(), INTERVAL 3 MINUTE) agentOnline
     FROM kiosks ORDER BY isOnline DESC,last_seen_at DESC,location`,
  );
  return rows;
};

exports.queueCommands = async (ids, command, channel, payload = null) => {
  await ensureTable();
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return [];
  const [result] = await pool.query(
    `INSERT INTO kiosk_commands (kiosk_id,command,channel,payload) SELECT id,?,?,? FROM kiosks WHERE id IN (${uniqueIds.map(() => "?").join(",")})`,
    [command, channel, payload ? JSON.stringify(payload) : null, ...uniqueIds],
  );
  return result.affectedRows;
};

exports.takeCommands = async (kioskId, channel) => {
  await ensureTable();
  const [rows] = await pool.query(
    "SELECT id,command,payload FROM kiosk_commands WHERE kiosk_id=? AND channel=? AND status='Queued' ORDER BY id LIMIT 20",
    [kioskId, channel],
  );
  if (rows.length)
    await pool.query(
      `UPDATE kiosk_commands SET status='Dispatched',dispatched_at=NOW() WHERE id IN (${rows.map(() => "?").join(",")})`,
      rows.map((row) => row.id),
    );
  return rows.map((row) => ({
    ...row,
    payload:
      typeof row.payload === "string"
        ? JSON.parse(row.payload || "null")
        : row.payload,
  }));
};

exports.completeCommand = async (kioskId, commandId, status, resultText) => {
  await ensureTable();
  const [result] = await pool.query(
    "UPDATE kiosk_commands SET status=?,result_text=?,completed_at=NOW() WHERE id=? AND kiosk_id=? AND status='Dispatched'",
    [
      status,
      String(resultText || "").slice(0, 1000) || null,
      commandId,
      kioskId,
    ],
  );
  return Boolean(result.affectedRows);
};

exports.getRecentCommands = async (kioskId) => {
  await ensureTable();
  const [rows] = await pool.query(
    "SELECT id,command,channel,status,result_text resultText,created_at createdAt,completed_at completedAt FROM kiosk_commands WHERE kiosk_id=? ORDER BY id DESC LIMIT 15",
    [kioskId],
  );
  return rows;
};

exports.setEnabled = async (id, isEnabled) => {
  await ensureTable();
  const [result] = await pool.query(
    "UPDATE kiosks SET is_enabled=? WHERE id=?",
    [isEnabled, id],
  );
  if (result.affectedRows && !isEnabled) {
    await require("../middleware/kiosk_auth").ensureSessionSchema();
    await pool.query(
      "UPDATE kiosk_sessions SET revoked_at=NOW() WHERE kiosk_id=? AND revoked_at IS NULL",
      [id],
    );
  }
  return result.affectedRows ? exports.getById(id) : null;
};

exports.assertEnabled = async (id) => {
  if (!id) return true; // Permits legacy terminals until they receive this update.
  const kiosk = await exports.getById(id);
  return kiosk?.isEnabled !== false;
};

exports.ensureTable = ensureTable;
