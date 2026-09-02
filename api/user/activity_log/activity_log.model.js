const pool = require("../../../db/db");
const schema = require("../../../db/schema");

let schemaReady;
async function ensureSchema() {
  if (!schemaReady)
    schemaReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NULL,
      actor_name VARCHAR(255) NOT NULL,
      actor_username VARCHAR(80) NOT NULL,
      action VARCHAR(40) NOT NULL,
      module VARCHAR(80) NOT NULL,
      description VARCHAR(500) NOT NULL,
      method VARCHAR(10),
      path VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_activity_created (created_at),
      INDEX idx_activity_user (user_id),
      CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
    )`,
      )
      .then(() => schema.dropColumn("activity_logs", "ip_address"));
  return schemaReady;
}

exports.getPage = async ({ start = 0, length = 25, search = "" }) => {
  await ensureSchema();
  const term = String(search || "").trim();
  const where = term
    ? "WHERE actor_name LIKE ? OR actor_username LIKE ? OR action LIKE ? OR module LIKE ? OR description LIKE ? OR CAST(created_at AS CHAR) LIKE ? OR DATE_FORMAT(created_at,'%M %e, %Y %h:%i %p') LIKE ?"
    : "";
  const searchParams = term ? Array(7).fill(`%${term}%`) : [];
  const safeStart = Math.max(0, Number(start) || 0);
  const safeLength = Math.min(100, Math.max(10, Number(length) || 25));
  const [totalRows] = await pool.query(
    "SELECT COUNT(*) total FROM activity_logs",
  );
  const [filteredRows] = term
    ? await pool.query(
        `SELECT COUNT(*) total FROM activity_logs ${where}`,
        searchParams,
      )
    : [totalRows];
  const [rows] = await pool.query(
    `SELECT id,user_id userId,actor_name actorName,actor_username actorUsername,action,module,description,method,path,created_at createdAt
     FROM activity_logs ${where}
     ORDER BY created_at DESC,id DESC
     LIMIT ? OFFSET ?`,
    [...searchParams, safeLength, safeStart],
  );
  return {
    rows,
    total: Number(totalRows[0].total),
    filtered: Number(filteredRows[0].total),
  };
};

exports.record = async (entry) => {
  await ensureSchema();
  return pool.query(
    `INSERT INTO activity_logs (user_id,actor_name,actor_username,action,module,description,method,path) VALUES (?,?,?,?,?,?,?,?)`,
    [
      entry.userId || null,
      entry.actorName || "Unknown user",
      entry.actorUsername || "unknown",
      entry.action,
      entry.module,
      entry.description,
      entry.method || null,
      entry.path || null,
    ],
  );
};

exports.ensureSchema = ensureSchema;
