const pool = require("../../db/db");
const attendance = require("../attendance/attendance.model");
const periods = require("../maintenance/academic_period/academic_period.model");

const locations = {
  library: { table: "library_entrance_logs", label: "Library" },
  internet: {
    table: "internet_section_entrance_logs",
    label: "Internet Section",
  },
};

let ready;
async function ensureSchema() {
  if (!ready)
    ready = (async () => {
      const definition = `(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,student_id INT UNSIGNED NULL,employee_id INT UNSIGNED NULL,checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,academic_period_id INT UNSIGNED NULL,INDEX idx_period_time (academic_period_id,checked_in_at,id),INDEX idx_student_time (student_id,checked_in_at,id),INDEX idx_employee_time (employee_id,checked_in_at,id))`;
      await pool.query(
        `CREATE TABLE IF NOT EXISTS library_entrance_logs ${definition}`,
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS internet_section_entrance_logs ${definition}`,
      );
      for (const table of [
        "library_entrance_logs",
        "internet_section_entrance_logs",
      ]) {
        await pool.query(
          `ALTER TABLE ${table} DROP COLUMN IF EXISTS id_number,DROP COLUMN IF EXISTS person_type`,
        );
        const [indexRows] = await pool.query(
          "SELECT DISTINCT INDEX_NAME indexName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
          [table],
        );
        const existing = new Set(indexRows.map((row) => row.indexName));
        if (!existing.has("idx_student_time"))
          await pool.query(
            `ALTER TABLE ${table} ADD INDEX idx_student_time (student_id,checked_in_at,id)`,
          );
        if (!existing.has("idx_employee_time"))
          await pool.query(
            `ALTER TABLE ${table} ADD INDEX idx_employee_time (employee_id,checked_in_at,id)`,
          );
      }
    })();
  return ready;
}

function locationFor(key) {
  const location = locations[String(key || "").toLowerCase()];
  if (!location) {
    const error = new Error("Choose Library or Internet Section.");
    error.code = "INVALID_LOCATION";
    throw error;
  }
  return location;
}

exports.scan = async (locationKey, idNumber) => {
  await ensureSchema();
  const location = locationFor(locationKey);
  const person = await attendance.findPerson(idNumber, "Both");
  if (!person) return null;
  const current = await periods.getCurrent();
  if (!current) {
    const error = new Error("No current academic period is configured.");
    error.code = "NO_PERIOD";
    throw error;
  }
  const studentId = person.type === "Student" ? person.id : null;
  const employeeId = person.type === "Employee" ? person.id : null;
  const [result] = await pool.query(
    `INSERT INTO ${location.table} (student_id,employee_id,academic_period_id) VALUES (?,?,?)`,
    [studentId, employeeId, current.id],
  );
  return {
    id: result.insertId,
    ...person,
    location: location.label,
    action: "Time In",
    timestamp: new Date().toISOString(),
  };
};

exports.getAll = async (locationKey, peopleAccess = "Both") => {
  await ensureSchema();
  const location = locationFor(locationKey);
  const scopeWhere =
    peopleAccess === "Students"
      ? "AND l.student_id IS NOT NULL"
      : peopleAccess === "Employees"
        ? "AND l.employee_id IS NOT NULL"
        : "";
  const [rows] = await pool.query(
    `SELECT l.id,COALESCE(s.id_number,e.id_number) idNumber,CASE WHEN l.student_id IS NOT NULL THEN 'Student' ELSE 'Employee' END type,TRIM(CONCAT_WS(' ',COALESCE(s.first_name,e.first_name),NULLIF(COALESCE(s.middle_name,e.middle_name),''),COALESCE(s.last_name,e.last_name))) name,CASE WHEN l.student_id IS NOT NULL THEN COALESCE(p.name,TRIM(SUBSTRING_INDEX(s.program_section,'·',1))) ELSE NULL END course,CASE WHEN l.employee_id IS NOT NULL THEN TRIM(SUBSTRING_INDEX(e.department_role,'·',1)) ELSE NULL END department,l.checked_in_at timestamp FROM ${location.table} l INNER JOIN academic_periods ap ON ap.id=l.academic_period_id AND ap.is_current=TRUE LEFT JOIN students s ON s.id=l.student_id LEFT JOIN programs p ON p.id=s.program_id LEFT JOIN employees e ON e.id=l.employee_id WHERE (l.student_id IS NOT NULL OR l.employee_id IS NOT NULL) ${scopeWhere} ORDER BY l.checked_in_at DESC,l.id DESC`,
  );
  return rows;
};

exports.ensureSchema = ensureSchema;
exports.locationFor = locationFor;
