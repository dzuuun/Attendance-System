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
        await schema.addColumns(table, [
          [
            "person_type",
            "ENUM('Student','Employee','Alumnus') NULL AFTER employee_id",
          ],
          ["id_number_snapshot", "VARCHAR(80) NULL AFTER person_type"],
          ["name_snapshot", "VARCHAR(255) NULL AFTER id_number_snapshot"],
          ["affiliation_snapshot", "VARCHAR(255) NULL AFTER name_snapshot"],
        ]);
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
        await pool.query(
          `UPDATE ${table} l
           LEFT JOIN students s ON s.id=l.student_id
           LEFT JOIN alumni al ON al.student_id=l.student_id
           LEFT JOIN employees e ON e.id=l.employee_id
           LEFT JOIN programs p ON p.id=COALESCE(IF(s.is_active,s.program_id,NULL),al.program_id,s.program_id)
           LEFT JOIN employee_departments ed ON ed.id=e.emp_dept_id
           SET l.person_type=CASE WHEN l.student_id IS NOT NULL AND s.is_active=TRUE THEN 'Student' WHEN al.id IS NOT NULL THEN 'Alumnus' WHEN l.student_id IS NOT NULL THEN 'Student' ELSE 'Employee' END,
               l.id_number_snapshot=COALESCE(IF(s.is_active,s.id_number,NULL),al.id_number,s.id_number,e.id_number),
               l.name_snapshot=CONCAT(COALESCE(IF(s.is_active,s.last_name,NULL),al.last_name,s.last_name,e.last_name),', ',COALESCE(IF(s.is_active,s.first_name,NULL),al.first_name,s.first_name,e.first_name),IF(COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name) IS NULL OR COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name)='','',CONCAT(' ',COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name)))),
               l.affiliation_snapshot=COALESCE(p.name,ed.name)
           WHERE l.person_type IS NULL AND (l.student_id IS NOT NULL OR l.employee_id IS NOT NULL)`,
        );
        await schema.addForeignKey(
          table,
          `fk_${table}_student`,
          ["student_id"],
          "students",
          ["id"],
        );
        await schema.addForeignKey(
          table,
          `fk_${table}_employee`,
          ["employee_id"],
          "employees",
          ["id"],
        );
        await schema.addForeignKey(
          table,
          `fk_${table}_period`,
          ["academic_period_id"],
          "academic_periods",
          ["id"],
        );
        await schema.addCheckConstraint(
          table,
          `chk_${table}_identity`,
          "(student_id IS NULL) <> (employee_id IS NULL)",
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
        `${inactiveStudent.name}'s ${inactiveStudent.type.toLowerCase()} account is inactive. Please visit the MIS Office for reactivation.`,
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
  const studentId = person.type !== "Employee" ? person.id : null;
  const employeeId = person.type === "Employee" ? person.id : null;
  const connection = await pool.getConnection();
  const lockKey =
    `taptrack-library:${locationKey}:${person.type}:${person.id}`.slice(0, 64);
  let locked = false;
  let result;
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK(?,5) acquired", [
      lockKey,
    ]);
    locked = Boolean(lock?.acquired);
    if (!locked) {
      const error = new Error(
        "Another scan for this ID is still being processed.",
      );
      error.code = "DUPLICATE_SCAN";
      throw error;
    }
    const personColumn = studentId ? "student_id" : "employee_id";
    const [[latest]] = await connection.query(
      `SELECT TIMESTAMPDIFF(SECOND,checked_in_at,NOW()) secondsAgo FROM ${location.table} WHERE ${personColumn}=? AND academic_period_id=? ORDER BY checked_in_at DESC,id DESC LIMIT 1`,
      [person.id, current.id],
    );
    if (latest && Number(latest.secondsAgo) < 5) {
      const error = new Error(
        "This ID was already scanned. Please wait a few seconds.",
      );
      error.code = "DUPLICATE_SCAN";
      throw error;
    }
    [result] = await connection.query(
      `INSERT INTO ${location.table} (student_id,employee_id,person_type,id_number_snapshot,name_snapshot,affiliation_snapshot,academic_period_id) VALUES (?,?,?,?,?,?,?)`,
      [
        studentId,
        employeeId,
        person.type,
        person.idNumber,
        person.name,
        person.program || person.department || null,
        current.id,
      ],
    );
  } finally {
    if (locked)
      await connection
        .query("SELECT RELEASE_LOCK(?)", [lockKey])
        .catch(() => {});
    connection.release();
  }
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
    `SELECT l.id,COALESCE(l.id_number_snapshot,IF(s.is_active,s.id_number,NULL),al.id_number,s.id_number,e.id_number) idNumber,COALESCE(l.person_type,CASE WHEN l.student_id IS NOT NULL AND s.is_active=TRUE THEN 'Student' WHEN al.id IS NOT NULL THEN 'Alumnus' WHEN l.student_id IS NOT NULL THEN 'Student' ELSE 'Employee' END) type,COALESCE(l.person_type='Alumnus',al.id IS NOT NULL) isAlumnus,COALESCE(l.name_snapshot,CONCAT(COALESCE(IF(s.is_active,s.last_name,NULL),al.last_name,s.last_name,e.last_name),', ',COALESCE(IF(s.is_active,s.first_name,NULL),al.first_name,s.first_name,e.first_name),IF(COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name) IS NULL OR COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name)='','',CONCAT(' ',COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name))))) name,CASE WHEN l.student_id IS NOT NULL THEN p.code ELSE NULL END courseCode,COALESCE(l.affiliation_snapshot,CASE WHEN l.student_id IS NOT NULL THEN d.code ELSE ed.code END) department,l.checked_in_at timestamp FROM ${location.table} l INNER JOIN academic_periods ap ON ap.id=l.academic_period_id AND ${periodClause} LEFT JOIN students s ON s.id=l.student_id LEFT JOIN alumni al ON al.student_id=l.student_id LEFT JOIN programs p ON p.id=COALESCE(IF(s.is_active,s.program_id,NULL),al.program_id,s.program_id) LEFT JOIN departments d ON d.id=p.department_id LEFT JOIN employees e ON e.id=l.employee_id LEFT JOIN employee_departments ed ON ed.id=e.emp_dept_id WHERE l.student_id IS NOT NULL OR l.employee_id IS NOT NULL ORDER BY l.checked_in_at DESC,l.id DESC`,
    params,
  );
  return rows;
};

exports.getToday = async (locationKey, limit = 10) => {
  await ensureSchema();
  const location = locationFor(locationKey);
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const [scans] = await pool.query(
    `SELECT l.id,COALESCE(l.id_number_snapshot,IF(s.is_active,s.id_number,NULL),al.id_number,s.id_number,e.id_number) idNumber,COALESCE(l.person_type,CASE WHEN l.student_id IS NOT NULL AND s.is_active=TRUE THEN 'Student' WHEN al.id IS NOT NULL THEN 'Alumnus' WHEN l.student_id IS NOT NULL THEN 'Student' ELSE 'Employee' END) type,COALESCE(l.person_type='Alumnus',al.id IS NOT NULL) isAlumnus,COALESCE(l.name_snapshot,CONCAT(COALESCE(IF(s.is_active,s.last_name,NULL),al.last_name,s.last_name,e.last_name),', ',COALESCE(IF(s.is_active,s.first_name,NULL),al.first_name,s.first_name,e.first_name),IF(COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name) IS NULL OR COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name)='','',CONCAT(' ',COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name))))) name,COALESCE(l.affiliation_snapshot,p.name,ed.name) program,CASE WHEN l.person_type='Student' OR (l.person_type IS NULL AND s.is_active=TRUE) THEN s.year_level ELSE NULL END yearLevel,al.graduation_year graduationYear,ed.name department,COALESCE(IF(s.is_active,s.photo_url,NULL),al.photo_url,s.photo_url,e.photo_url) photoUrl,l.checked_in_at timestamp,'Time In' action,? location FROM ${location.table} l INNER JOIN academic_periods ap ON ap.id=l.academic_period_id AND ap.is_current=TRUE LEFT JOIN students s ON s.id=l.student_id LEFT JOIN alumni al ON al.student_id=l.student_id LEFT JOIN programs p ON p.id=COALESCE(IF(s.is_active,s.program_id,NULL),al.program_id,s.program_id) LEFT JOIN employees e ON e.id=l.employee_id LEFT JOIN employee_departments ed ON ed.id=e.emp_dept_id WHERE (l.student_id IS NOT NULL OR l.employee_id IS NOT NULL) AND l.checked_in_at>=CURDATE() AND l.checked_in_at<CURDATE()+INTERVAL 1 DAY ORDER BY l.checked_in_at DESC,l.id DESC LIMIT ${safeLimit}`,
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
