const pool = require("../../../db/db");
const schema = require("../../../db/schema");
let ready;
async function ensureSchema() {
  if (!ready)
    ready = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS academic_periods (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,school_year VARCHAR(20) NOT NULL,term ENUM('First Semester','Second Semester','Summer','First Term','Second Term','Third Term') NOT NULL,is_current BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uq_academic_period (school_year,term),INDEX idx_academic_current (is_current))`,
      );
      await pool.query(
        "ALTER TABLE academic_periods MODIFY COLUMN term ENUM('First Semester','Second Semester','Summer','First Term','Second Term','Third Term') NOT NULL",
      );
      const [count] = await pool.query(
        "SELECT COUNT(*) count FROM academic_periods",
      );
      if (!count[0].count) {
        const now = new Date(),
          start =
            now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
        await pool.query(
          "INSERT INTO academic_periods (school_year,term,is_current) VALUES (?, 'First Semester', TRUE)",
          [`${start}-${start + 1}`],
        );
      }
      const [currentRows] = await pool.query(
        "SELECT id FROM academic_periods WHERE is_current=TRUE ORDER BY id DESC",
      );
      if (!currentRows.length)
        await pool.query(
          "UPDATE academic_periods SET is_current=TRUE ORDER BY id DESC LIMIT 1",
        );
      else if (currentRows.length > 1)
        await pool.query(
          "UPDATE academic_periods SET is_current=FALSE WHERE is_current=TRUE AND id<>?",
          [currentRows[0].id],
        );
      for (const table of ["events"])
        await schema.addColumn(
          table,
          "academic_period_id",
          "INT UNSIGNED NULL",
        );
      const [[current]] = await pool.query(
        "SELECT id FROM academic_periods WHERE is_current=TRUE ORDER BY id DESC LIMIT 1",
      );
      if (current)
        for (const table of ["events"])
          await pool.query(
            `UPDATE ${table} SET academic_period_id=? WHERE academic_period_id IS NULL`,
            [current.id],
          );
    })();
  return ready;
}
exports.ensureSchema = ensureSchema;
exports.getAll = async () => {
  await ensureSchema();
  return (
    await pool.query(
      "SELECT id,school_year schoolYear,term,is_current isCurrent,created_at createdAt FROM academic_periods ORDER BY school_year DESC,FIELD(term,'First Semester','Second Semester','Summer','First Term','Second Term','Third Term')",
    )
  )[0];
};
exports.getCurrent = async () => {
  await ensureSchema();
  return (
    await pool.query(
      "SELECT id,school_year schoolYear,term,is_current isCurrent FROM academic_periods WHERE is_current=TRUE ORDER BY id DESC LIMIT 1",
    )
  )[0][0];
};
exports.save = async (id, data) => {
  await ensureSchema();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (id && !data.isCurrent) {
      const [rows] = await connection.query(
        "SELECT id FROM academic_periods WHERE is_current=TRUE LIMIT 1 FOR UPDATE",
      );
      if (Number(rows[0]?.id) === Number(id)) {
        const error = new Error("A current academic period is required.");
        error.code = "CURRENT_REQUIRED";
        throw error;
      }
    }
    if (data.isCurrent)
      await connection.query("UPDATE academic_periods SET is_current=FALSE");
    let result;
    if (id)
      result = (
        await connection.query(
          "UPDATE academic_periods SET school_year=?,term=?,is_current=? WHERE id=?",
          [data.schoolYear, data.term, data.isCurrent, id],
        )
      )[0];
    else
      result = (
        await connection.query(
          "INSERT INTO academic_periods (school_year,term,is_current) VALUES (?,?,?)",
          [data.schoolYear, data.term, data.isCurrent],
        )
      )[0];
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
