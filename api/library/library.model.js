const pool = require("../../db/db");
const schema = require("../../db/schema");
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
      const definition = `(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,student_id INT UNSIGNED NULL,employee_id INT UNSIGNED NULL,checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,academic_period_id INT UNSIGNED NULL,INDEX idx_period_time (academic_period_id,checked_in_at,id),INDEX idx_student_time (student_id,checked_in_at,id),INDEX idx_employee_time (employee_id,checked_in_at,id),INDEX idx_student_period_time (student_id,academic_period_id,checked_in_at,id),INDEX idx_employee_period_time (employee_id,academic_period_id,checked_in_at,id))`;
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
        await schema.dropColumns(table, ["id_number", "person_type"]);
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
        if (!existing.has("idx_student_period_time"))
          await pool.query(
            `ALTER TABLE ${table} ADD INDEX idx_student_period_time (student_id,academic_period_id,checked_in_at,id)`,
          );
        if (!existing.has("idx_employee_period_time"))
          await pool.query(
            `ALTER TABLE ${table} ADD INDEX idx_employee_period_time (employee_id,academic_period_id,checked_in_at,id)`,
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
  if (!person) {
    const inactiveStudent = await attendance.findInactiveStudent(idNumber);
    if (inactiveStudent) {
      const error = new Error(
        `${inactiveStudent.name}'s student account is inactive. Please visit the MIS Office for reactivation.`,
      );
      error.code = "INACTIVE_STUDENT";
      throw error;
    }
    return null;
  }
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

exports.getAll = async (locationKey, periodId = null) => {
  await ensureSchema();
  const location = locationFor(locationKey);
  const periodClause = periodId ? "ap.id=?" : "ap.is_current=TRUE";
  const params = periodId ? [periodId] : [];
  const [rows] = await pool.query(
    `SELECT l.id,COALESCE(s.id_number,e.id_number) idNumber,CASE WHEN l.student_id IS NOT NULL THEN 'Student' ELSE 'Employee' END type,CONCAT(COALESCE(s.last_name,e.last_name),', ',COALESCE(s.first_name,e.first_name),IF(COALESCE(s.middle_name,e.middle_name) IS NULL OR COALESCE(s.middle_name,e.middle_name)='','',CONCAT(' ',COALESCE(s.middle_name,e.middle_name)))) name,CASE WHEN l.student_id IS NOT NULL THEN p.code ELSE NULL END courseCode,CASE WHEN l.student_id IS NOT NULL THEN d.code ELSE ed.code END department,l.checked_in_at timestamp FROM ${location.table} l INNER JOIN academic_periods ap ON ap.id=l.academic_period_id AND ${periodClause} LEFT JOIN students s ON s.id=l.student_id LEFT JOIN programs p ON p.id=s.program_id LEFT JOIN departments d ON d.id=p.department_id LEFT JOIN employees e ON e.id=l.employee_id LEFT JOIN employee_departments ed ON ed.id=e.emp_dept_id WHERE l.student_id IS NOT NULL OR l.employee_id IS NOT NULL ORDER BY l.checked_in_at DESC,l.id DESC`,
    params,
  );
  return rows;
};

exports.getToday = async (locationKey, limit = 10) => {
  await ensureSchema();
  const location = locationFor(locationKey);
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const [scans] = await pool.query(
    `SELECT l.id,COALESCE(s.id_number,e.id_number) idNumber,CASE WHEN l.student_id IS NOT NULL THEN 'Student' ELSE 'Employee' END type,CONCAT(COALESCE(s.last_name,e.last_name),', ',COALESCE(s.first_name,e.first_name),IF(COALESCE(s.middle_name,e.middle_name) IS NULL OR COALESCE(s.middle_name,e.middle_name)='','',CONCAT(' ',COALESCE(s.middle_name,e.middle_name)))) name,p.name program,s.year_level yearLevel,ed.name department,COALESCE(s.photo_url,e.photo_url) photoUrl,l.checked_in_at timestamp,'Time In' action,? location FROM ${location.table} l INNER JOIN academic_periods ap ON ap.id=l.academic_period_id AND ap.is_current=TRUE LEFT JOIN students s ON s.id=l.student_id LEFT JOIN programs p ON p.id=s.program_id LEFT JOIN employees e ON e.id=l.employee_id LEFT JOIN employee_departments ed ON ed.id=e.emp_dept_id WHERE (l.student_id IS NOT NULL OR l.employee_id IS NOT NULL) AND l.checked_in_at>=CURDATE() AND l.checked_in_at<CURDATE()+INTERVAL 1 DAY ORDER BY l.checked_in_at DESC,l.id DESC LIMIT ${safeLimit}`,
    [location.label],
  );
  const [[stats]] = await pool.query(
    `SELECT COUNT(*) total,SUM(l.student_id IS NOT NULL) students,SUM(l.employee_id IS NOT NULL) employees FROM ${location.table} l INNER JOIN academic_periods ap ON ap.id=l.academic_period_id AND ap.is_current=TRUE WHERE (l.student_id IS NOT NULL OR l.employee_id IS NOT NULL) AND l.checked_in_at>=CURDATE() AND l.checked_in_at<CURDATE()+INTERVAL 1 DAY`,
  );
  return {
    scans,
    stats: {
      total: Number(stats.total || 0),
      students: Number(stats.students || 0),
      employees: Number(stats.employees || 0),
    },
  };
};

exports.ensureSchema = ensureSchema;
exports.locationFor = locationFor;
