const pool = require("../../../db/db");

async function ensureTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS gates (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      campus VARCHAR(40) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_gates_campus_name (campus, name),
      INDEX idx_gates_active_campus_name (is_active, campus, name)
    )`,
  );
}

exports.getAll = async ({ activeOnly = false } = {}) => {
  await ensureTable();
  const [rows] = await pool.query(
    `SELECT id,name,campus,is_active isActive
     FROM gates
     ${activeOnly ? "WHERE is_active=TRUE" : ""}
     ORDER BY campus,name`,
  );
  return rows;
};

exports.getById = async (id) => {
  await ensureTable();
  const [rows] = await pool.query(
    "SELECT id,name,campus,is_active isActive FROM gates WHERE id=? LIMIT 1",
    [id],
  );
  return rows[0];
};

exports.create = async ({ name, campus, isActive }) => {
  await ensureTable();
  const [result] = await pool.query(
    "INSERT INTO gates (name,campus,is_active) VALUES (?,?,?)",
    [name, campus, isActive],
  );
  return result;
};

exports.update = async (id, { name, campus, isActive }) => {
  await ensureTable();
  const [result] = await pool.query(
    "UPDATE gates SET name=?,campus=?,is_active=? WHERE id=?",
    [name, campus, isActive, id],
  );
  return result;
};

exports.remove = async (id) => {
  await ensureTable();
  const [result] = await pool.query("DELETE FROM gates WHERE id=?", [id]);
  return result;
};

exports.ensureTable = ensureTable;
