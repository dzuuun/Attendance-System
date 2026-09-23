const pool = require("../../db/db");
const schema = require("../../db/schema");
const periods = require("../maintenance/academic_period/academic_period.model");

let schemaReady;
async function tableExists(table) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
    [table],
  );
  return Boolean(rows[0].count);
}
async function ensurePersonNames() {
  for (const table of ["students", "employees"]) {
    await schema.addColumns(table, [
      ["first_name", "VARCHAR(80) NULL"],
      ["middle_name", "VARCHAR(80) NULL AFTER first_name"],
      ["last_name", "VARCHAR(80) NULL AFTER middle_name"],
      ["photo_url", "VARCHAR(500) NULL"],
    ]);
    const [legacy] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='full_name'",
      [table],
    );
    if (legacy.length) {
      await pool.query(
        `UPDATE ${table} SET first_name=COALESCE(first_name,SUBSTRING_INDEX(full_name,' ',1)),last_name=COALESCE(last_name,CASE WHEN full_name LIKE '% %' THEN SUBSTRING_INDEX(full_name,' ',-1) ELSE full_name END)`,
      );
      await pool.query(`ALTER TABLE ${table} DROP COLUMN full_name`);
    }
  }
  await require("../maintenance/section/section.model").ensureSchema();
}
async function migrateLegacyTable(table, personColumn) {
  if (!(await tableExists(table))) return;
  const otherColumn =
    personColumn === "student_id" ? "employee_id" : "student_id";
  await pool.query(
    `INSERT INTO university_entrance_logs (${personColumn},${otherColumn},attendance_action,checked_in_at,academic_period_id) SELECT ${personColumn},NULL,attendance_action,checked_in_at,academic_period_id FROM ${table} WHERE event_id IS NULL`,
  );
  await pool.query(
    `INSERT INTO event_attendance_logs (event_id,${personColumn},${otherColumn},attendance_action,checked_in_at,academic_period_id) SELECT event_id,${personColumn},NULL,attendance_action,checked_in_at,academic_period_id FROM ${table} WHERE event_id IS NOT NULL`,
  );
  await pool.query(`DROP TABLE ${table}`);
}
async function backfillSnapshots(table) {
  await pool.query(
    `UPDATE ${table} a
     LEFT JOIN students s ON s.id=a.student_id
     LEFT JOIN alumni al ON al.student_id=a.student_id
     LEFT JOIN employees e ON e.id=a.employee_id
     LEFT JOIN programs pr ON pr.id=COALESCE(IF(s.is_active,s.program_id,NULL),al.program_id,s.program_id)
     LEFT JOIN employee_departments ed ON ed.id=e.emp_dept_id
     SET a.person_type=CASE WHEN a.student_id IS NOT NULL AND s.is_active=TRUE THEN 'Student' WHEN al.id IS NOT NULL THEN 'Alumnus' WHEN a.student_id IS NOT NULL THEN 'Student' ELSE 'Employee' END,
         a.id_number_snapshot=COALESCE(IF(s.is_active,s.id_number,NULL),al.id_number,s.id_number,e.id_number),
         a.name_snapshot=CONCAT(COALESCE(IF(s.is_active,s.last_name,NULL),al.last_name,s.last_name,e.last_name),', ',COALESCE(IF(s.is_active,s.first_name,NULL),al.first_name,s.first_name,e.first_name),IF(COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name) IS NULL OR COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name)='','',CONCAT(' ',COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name)))),
         a.affiliation_snapshot=COALESCE(pr.name,ed.name)
     WHERE a.person_type IS NULL AND (a.student_id IS NOT NULL OR a.employee_id IS NOT NULL)`,
  );
}
async function ensureSchema() {
  if (!schemaReady)
    schemaReady = (async () => {
      await periods.ensureSchema();
      await require("../maintenance/alumni/alumni.model").ensureSchema();
      await ensurePersonNames();
      await pool.query(
        `CREATE TABLE IF NOT EXISTS university_entrance_logs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,student_id INT UNSIGNED NULL,employee_id INT UNSIGNED NULL,attendance_action ENUM('Time In','Time Out') NOT NULL DEFAULT 'Time In',scan_location VARCHAR(120) NULL,checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,academic_period_id INT UNSIGNED NULL,INDEX idx_university_period_time (academic_period_id,checked_in_at,id),INDEX idx_university_student_time (student_id,academic_period_id,checked_in_at,id),INDEX idx_university_employee_time (employee_id,academic_period_id,checked_in_at,id))`,
      );
      await schema.addColumn(
        "university_entrance_logs",
        "scan_location",
        "VARCHAR(120) NULL AFTER attendance_action",
      );
      await schema.addColumns("university_entrance_logs", [
        [
          "person_type",
          "ENUM('Student','Employee','Alumnus') NULL AFTER employee_id",
        ],
        ["id_number_snapshot", "VARCHAR(80) NULL AFTER person_type"],
        ["name_snapshot", "VARCHAR(255) NULL AFTER id_number_snapshot"],
        ["affiliation_snapshot", "VARCHAR(255) NULL AFTER name_snapshot"],
      ]);
      await pool.query(
        `CREATE TABLE IF NOT EXISTS event_attendance_logs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,event_id INT UNSIGNED NOT NULL,student_id INT UNSIGNED NULL,employee_id INT UNSIGNED NULL,attendance_action ENUM('Time In','Time Out') NOT NULL DEFAULT 'Time In',checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,academic_period_id INT UNSIGNED NULL,INDEX idx_event_attendance_event_time (event_id,checked_in_at,id),INDEX idx_event_attendance_student_time (student_id,event_id,checked_in_at,id),INDEX idx_event_attendance_employee_time (employee_id,event_id,checked_in_at,id),INDEX idx_event_attendance_period_time (academic_period_id,checked_in_at,id),INDEX idx_event_student_period_time (student_id,academic_period_id,checked_in_at,id),INDEX idx_event_employee_period_time (employee_id,academic_period_id,checked_in_at,id))`,
      );
      await schema.addColumns("event_attendance_logs", [
        [
          "person_type",
          "ENUM('Student','Employee','Alumnus') NULL AFTER employee_id",
        ],
        ["id_number_snapshot", "VARCHAR(80) NULL AFTER person_type"],
        ["name_snapshot", "VARCHAR(255) NULL AFTER id_number_snapshot"],
        ["affiliation_snapshot", "VARCHAR(255) NULL AFTER name_snapshot"],
      ]);
      await pool.query(
        `CREATE TABLE IF NOT EXISTS event_attendance_corrections (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,attendance_log_id BIGINT UNSIGNED NOT NULL,event_id INT UNSIGNED NOT NULL,attendee_id_number VARCHAR(50) NOT NULL,attendee_name VARCHAR(255) NOT NULL,attendee_type ENUM('Student','Employee','Alumnus') NOT NULL,correction_type ENUM('Updated','Deleted') NOT NULL,original_action ENUM('Time In','Time Out') NOT NULL,original_checked_in_at DATETIME NOT NULL,corrected_action ENUM('Time In','Time Out') NULL,corrected_checked_in_at DATETIME NULL,reason VARCHAR(500) NOT NULL,corrected_by INT UNSIGNED NOT NULL,corrector_name VARCHAR(255) NOT NULL,corrected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_event_corrections_event_time (event_id,corrected_at,id),INDEX idx_event_corrections_log (attendance_log_id,corrected_at))`,
      );
      await pool.query(
        "ALTER TABLE event_attendance_corrections MODIFY attendee_type ENUM('Student','Employee','Alumnus') NOT NULL",
      );
      await schema.addColumns("event_attendance_corrections", [
        [
          "attendee_id_number",
          "VARCHAR(50) NOT NULL DEFAULT '' AFTER event_id",
        ],
        [
          "attendee_name",
          "VARCHAR(255) NOT NULL DEFAULT '' AFTER attendee_id_number",
        ],
        [
          "attendee_type",
          "ENUM('Student','Employee','Alumnus') NOT NULL DEFAULT 'Student' AFTER attendee_name",
        ],
      ]);
      await migrateLegacyTable("student_attendance", "student_id");
      await migrateLegacyTable("employee_attendance", "employee_id");
      await backfillSnapshots("university_entrance_logs");
      await backfillSnapshots("event_attendance_logs");
      const current = await periods.getCurrent();
      if (current) {
        await pool.query(
          "UPDATE university_entrance_logs SET academic_period_id=? WHERE academic_period_id IS NULL",
          [current.id],
        );
        await pool.query(
          "UPDATE event_attendance_logs SET academic_period_id=? WHERE academic_period_id IS NULL",
          [current.id],
        );
      }
      await schema.addForeignKey(
        "event_attendance_logs",
        "fk_event_attendance_event",
        ["event_id"],
        "events",
        ["id"],
      );
      for (const table of [
        "university_entrance_logs",
        "event_attendance_logs",
      ]) {
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
      await schema.addForeignKey(
        "event_attendance_logs",
        "fk_event_attendance_student",
        ["student_id"],
        "students",
        ["id"],
      );
      await schema.addForeignKey(
        "event_attendance_logs",
        "fk_event_attendance_employee",
        ["employee_id"],
        "employees",
        ["id"],
      );
      await schema.addForeignKey(
        "event_attendance_logs",
        "fk_event_attendance_period",
        ["academic_period_id"],
        "academic_periods",
        ["id"],
      );
    })();
  return schemaReady;
}

const personSelect = `COALESCE(a.id_number_snapshot,IF(s.is_active,s.id_number,NULL),al.id_number,s.id_number,e.id_number) idNumber,COALESCE(a.person_type,CASE WHEN a.student_id IS NOT NULL AND s.is_active=TRUE THEN 'Student' WHEN al.id IS NOT NULL THEN 'Alumnus' WHEN a.student_id IS NOT NULL THEN 'Student' ELSE 'Employee' END) type,COALESCE(a.student_id,a.employee_id) personId,COALESCE(a.person_type='Alumnus',al.id IS NOT NULL) isAlumnus,COALESCE(a.name_snapshot,CONCAT(COALESCE(IF(s.is_active,s.last_name,NULL),al.last_name,s.last_name,e.last_name),', ',COALESCE(IF(s.is_active,s.first_name,NULL),al.first_name,s.first_name,e.first_name),IF(COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name) IS NULL OR COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name)='','',CONCAT(' ',COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name))))) name`;
const personJoins =
  "LEFT JOIN students s ON s.id=a.student_id LEFT JOIN alumni al ON al.student_id=a.student_id LEFT JOIN employees e ON e.id=a.employee_id";

exports.getAll = async (periodId = null) => {
  await ensureSchema();
  const periodClause = periodId ? "ap.id=?" : "ap.is_current=TRUE";
  const params = periodId ? [periodId] : [];
  return (
    await pool.query(
      `SELECT a.id,${personSelect},NULL eventId,NULL eventName,a.scan_location location,a.attendance_action action,a.checked_in_at timestamp FROM university_entrance_logs a INNER JOIN academic_periods ap ON ap.id=a.academic_period_id AND ${periodClause} ${personJoins} WHERE a.student_id IS NOT NULL OR a.employee_id IS NOT NULL ORDER BY a.checked_in_at DESC,a.id DESC`,
      params,
    )
  )[0];
};
exports.getToday = async () => {
  await ensureSchema();
  return (
    await pool.query(
      `SELECT a.id,${personSelect},NULL eventId,NULL eventName,a.scan_location location,a.attendance_action action,a.checked_in_at timestamp FROM university_entrance_logs a INNER JOIN academic_periods ap ON ap.id=a.academic_period_id AND ap.is_current=TRUE ${personJoins} WHERE (a.student_id IS NOT NULL OR a.employee_id IS NOT NULL) AND a.checked_in_at>=CURDATE() AND a.checked_in_at<CURDATE()+INTERVAL 1 DAY ORDER BY a.checked_in_at DESC,a.id DESC`,
    )
  )[0];
};
exports.getTodayByLocation = async (location, limit = 10) => {
  await ensureSchema();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 25));
  const where = `a.scan_location=? AND (a.student_id IS NOT NULL OR a.employee_id IS NOT NULL) AND a.checked_in_at>=CURDATE() AND a.checked_in_at<CURDATE()+INTERVAL 1 DAY`;
  const [records] = await pool.query(
    `SELECT a.id,${personSelect},a.scan_location location,a.attendance_action action,a.checked_in_at timestamp,COALESCE(a.affiliation_snapshot,pr.name,ed.name) program,c.name college,ed.name department,COALESCE(IF(s.is_active,s.photo_url,NULL),al.photo_url,s.photo_url,e.photo_url) photoUrl,al.graduation_year graduationYear FROM university_entrance_logs a INNER JOIN academic_periods ap ON ap.id=a.academic_period_id AND ap.is_current=TRUE ${personJoins} LEFT JOIN programs pr ON pr.id=COALESCE(IF(s.is_active,s.program_id,NULL),al.program_id,s.program_id) LEFT JOIN departments d ON d.id=pr.department_id LEFT JOIN colleges c ON c.id=d.college_id LEFT JOIN employee_departments ed ON ed.id=e.emp_dept_id WHERE ${where} ORDER BY a.checked_in_at DESC,a.id DESC LIMIT ${safeLimit}`,
    [location],
  );
  const [[stats]] = await pool.query(
    `SELECT COUNT(*) total,SUM(a.attendance_action='Time In') timeIn,SUM(a.attendance_action='Time Out') timeOut FROM university_entrance_logs a INNER JOIN academic_periods ap ON ap.id=a.academic_period_id AND ap.is_current=TRUE WHERE ${where}`,
    [location],
  );
  return {
    records,
    stats: {
      total: Number(stats.total || 0),
      in: Number(stats.timeIn || 0),
      out: Number(stats.timeOut || 0),
    },
  };
};
exports.getByEvent = async (eventId) => {
  await ensureSchema();
  return (
    await pool.query(
      `SELECT a.id,${personSelect},COALESCE(a.affiliation_snapshot,pr.name,ed.name) program,COALESCE(a.affiliation_snapshot,pr.name) course,pr.code programCode,d.code departmentCode,c.name college,c.code collegeCode,CASE WHEN a.employee_id IS NOT NULL THEN COALESCE(a.affiliation_snapshot,ed.name) ELSE NULL END department,ed.code employeeDepartmentCode,COALESCE(IF(s.is_active,s.photo_url,NULL),al.photo_url,s.photo_url,e.photo_url) photoUrl,al.graduation_year graduationYear,a.event_id eventId,ev.name eventName,a.attendance_action action,a.checked_in_at timestamp FROM event_attendance_logs a ${personJoins} LEFT JOIN employee_departments ed ON ed.id=e.emp_dept_id LEFT JOIN programs pr ON pr.id=COALESCE(IF(s.is_active,s.program_id,NULL),al.program_id,s.program_id) LEFT JOIN departments d ON d.id=pr.department_id LEFT JOIN colleges c ON c.id=d.college_id INNER JOIN events ev ON ev.id=a.event_id WHERE a.event_id=? ORDER BY a.checked_in_at DESC,a.id DESC`,
      [eventId],
    )
  )[0];
};
exports.findPerson = async (idNumber, audience = "Both") => {
  await ensureSchema();
  const findStudent = () =>
    pool.query(
      "SELECT s.id,s.id_number idNumber,TRIM(CONCAT_WS(' ',s.first_name,NULLIF(s.middle_name,''),s.last_name)) name,p.name program,p.code programCode,c.name college,s.year_level yearLevel,x.name sectionName,s.photo_url photoUrl,al.id IS NOT NULL isAlumnus,al.graduation_year graduationYear,'Student' type FROM students s LEFT JOIN alumni al ON al.student_id=s.id LEFT JOIN programs p ON p.id=s.program_id LEFT JOIN departments d ON d.id=p.department_id LEFT JOIN colleges c ON c.id=d.college_id LEFT JOIN sections x ON x.id=s.section_id WHERE s.id_number=? AND s.is_active=TRUE",
      [idNumber],
    );
  const findEmployee = () =>
    pool.query(
      "SELECT e.id,e.id_number idNumber,TRIM(CONCAT_WS(' ',e.first_name,NULLIF(e.middle_name,''),e.last_name)) name,d.name department,e.photo_url photoUrl,'Employee' type FROM employees e LEFT JOIN employee_departments d ON d.id=e.emp_dept_id WHERE e.id_number=? AND e.is_active=TRUE",
      [idNumber],
    );
  const findAlumnus = () =>
    pool.query(
      "SELECT a.student_id id,a.id alumniId,a.id_number idNumber,TRIM(CONCAT_WS(' ',a.first_name,NULLIF(a.middle_name,''),a.last_name)) name,p.name program,p.code programCode,c.name college,NULL yearLevel,NULL sectionName,a.graduation_year graduationYear,a.photo_url photoUrl,'Alumnus' type FROM alumni a LEFT JOIN programs p ON p.id=a.program_id LEFT JOIN departments d ON d.id=p.department_id LEFT JOIN colleges c ON c.id=d.college_id WHERE a.id_number=? AND a.is_active=TRUE",
      [idNumber],
    );
  if (audience === "Students") return (await findStudent())[0][0];
  if (audience === "Employees") return (await findEmployee())[0][0];
  const [[students], [alumni], [employees]] = await Promise.all([
    findStudent(),
    findAlumnus(),
    findEmployee(),
  ]);
  return students[0] || alumni[0] || employees[0];
};
exports.findInactiveStudent = async (idNumber) => {
  await ensureSchema();
  return (
    await pool.query(
      "SELECT s.id,COALESCE(a.id_number,s.id_number) idNumber,TRIM(CONCAT_WS(' ',COALESCE(a.first_name,s.first_name),NULLIF(COALESCE(a.middle_name,s.middle_name),''),COALESCE(a.last_name,s.last_name))) name,CASE WHEN a.id IS NOT NULL THEN 'Alumnus' ELSE 'Student' END type FROM students s LEFT JOIN alumni a ON a.student_id=s.id WHERE COALESCE(a.id_number,s.id_number)=? AND s.is_active=FALSE AND (a.id IS NULL OR a.is_active=FALSE) LIMIT 1",
      [idNumber],
    )
  )[0][0];
};
const personColumn = (person) =>
  person.type === "Employee" ? "employee_id" : "student_id";
exports.acquireScanLock = async (person, eventId) => {
  const connection = await pool.getConnection();
  const key =
    `taptrack-scan:${person.type}:${person.id}:${eventId || "entrance"}`.slice(
      0,
      64,
    );
  try {
    const [rows] = await connection.query("SELECT GET_LOCK(?,5) acquired", [
      key,
    ]);
    if (!rows[0]?.acquired) {
      connection.release();
      return null;
    }
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      await connection.query("SELECT RELEASE_LOCK(?)", [key]).catch(() => {});
      connection.release();
    };
  } catch (error) {
    connection.release();
    throw error;
  }
};
exports.findLatest = async (person, eventId) => {
  await ensureSchema();
  const column = personColumn(person);
  const table = eventId ? "event_attendance_logs" : "university_entrance_logs";
  const clause = eventId
    ? "event_id=?"
    : "academic_period_id=(SELECT id FROM academic_periods WHERE is_current=TRUE LIMIT 1) AND checked_in_at>=CURDATE() AND checked_in_at<CURDATE()+INTERVAL 1 DAY";
  const params = eventId ? [person.id, eventId] : [person.id];
  return (
    await pool.query(
      `SELECT attendance_action action,checked_in_at timestamp,TIMESTAMPDIFF(SECOND,checked_in_at,CURRENT_TIMESTAMP) secondsAgo FROM ${table} WHERE ${column}=? AND ${clause} ORDER BY checked_in_at DESC,id DESC LIMIT 1`,
      params,
    )
  )[0][0];
};
exports.getActionCounts = async (person, eventId) => {
  if (!eventId) return null;
  await ensureSchema();
  const column = personColumn(person);
  const [rows] = await pool.query(
    `SELECT SUM(attendance_action='Time In') timeIns,SUM(attendance_action='Time Out') timeOuts FROM event_attendance_logs WHERE ${column}=? AND event_id=?`,
    [person.id, eventId],
  );
  return {
    timeIns: Number(rows[0].timeIns || 0),
    timeOuts: Number(rows[0].timeOuts || 0),
  };
};
exports.record = async (person, action, eventId = null, location = null) => {
  await ensureSchema();
  const current = await periods.getCurrent();
  if (!current) throw new Error("No current academic period is configured.");
  const column = personColumn(person);
  const table = eventId ? "event_attendance_logs" : "university_entrance_logs";
  const columns = eventId
    ? `(event_id,${column},person_type,id_number_snapshot,name_snapshot,affiliation_snapshot,attendance_action,academic_period_id)`
    : `(${column},person_type,id_number_snapshot,name_snapshot,affiliation_snapshot,attendance_action,scan_location,academic_period_id)`;
  const values = eventId
    ? [
        eventId,
        person.id,
        person.type,
        person.idNumber,
        person.name,
        person.program || person.department || null,
        action,
        current.id,
      ]
    : [
        person.id,
        person.type,
        person.idNumber,
        person.name,
        person.program || person.department || null,
        action,
        location,
        current.id,
      ];
  return (
    await pool.query(
      `INSERT INTO ${table} ${columns} VALUES (${values.map(() => "?").join(",")})`,
      values,
    )
  )[0];
};
exports.getEventScan = async (eventId, scanId) => {
  await ensureSchema();
  return (
    await pool.query(
      "SELECT id,event_id eventId,attendance_action action,checked_in_at timestamp FROM event_attendance_logs WHERE id=? AND event_id=? LIMIT 1",
      [scanId, eventId],
    )
  )[0][0];
};
exports.correctEventScan = async (eventId, scanId, data, user) => {
  await ensureSchema();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT a.id,a.attendance_action action,a.checked_in_at timestamp,COALESCE(a.id_number_snapshot,IF(s.is_active,s.id_number,NULL),al.id_number,s.id_number,e.id_number) idNumber,COALESCE(a.name_snapshot,TRIM(CONCAT_WS(' ',COALESCE(IF(s.is_active,s.first_name,NULL),al.first_name,s.first_name,e.first_name),NULLIF(COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name),''),COALESCE(IF(s.is_active,s.last_name,NULL),al.last_name,s.last_name,e.last_name)))) name,COALESCE(a.person_type,CASE WHEN a.student_id IS NOT NULL AND s.is_active=TRUE THEN 'Student' WHEN al.id IS NOT NULL THEN 'Alumnus' WHEN a.student_id IS NOT NULL THEN 'Student' ELSE 'Employee' END) type FROM event_attendance_logs a LEFT JOIN students s ON s.id=a.student_id LEFT JOIN alumni al ON al.student_id=a.student_id LEFT JOIN employees e ON e.id=a.employee_id WHERE a.id=? AND a.event_id=? FOR UPDATE`,
      [scanId, eventId],
    );
    const original = rows[0];
    if (!original) {
      await connection.rollback();
      return null;
    }
    await connection.query(
      "INSERT INTO event_attendance_corrections (attendance_log_id,event_id,attendee_id_number,attendee_name,attendee_type,correction_type,original_action,original_checked_in_at,corrected_action,corrected_checked_in_at,reason,corrected_by,corrector_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        scanId,
        eventId,
        original.idNumber,
        original.name,
        original.type,
        "Updated",
        original.action,
        original.timestamp,
        data.action,
        data.timestamp,
        data.reason,
        user.id,
        user.fullName,
      ],
    );
    await connection.query(
      "UPDATE event_attendance_logs SET attendance_action=?,checked_in_at=? WHERE id=? AND event_id=?",
      [data.action, data.timestamp, scanId, eventId],
    );
    await connection.commit();
    return original;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
exports.deleteEventScan = async (eventId, scanId, reason, user) => {
  await ensureSchema();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT a.id,a.attendance_action action,a.checked_in_at timestamp,COALESCE(a.id_number_snapshot,IF(s.is_active,s.id_number,NULL),al.id_number,s.id_number,e.id_number) idNumber,COALESCE(a.name_snapshot,TRIM(CONCAT_WS(' ',COALESCE(IF(s.is_active,s.first_name,NULL),al.first_name,s.first_name,e.first_name),NULLIF(COALESCE(IF(s.is_active,s.middle_name,NULL),al.middle_name,s.middle_name,e.middle_name),''),COALESCE(IF(s.is_active,s.last_name,NULL),al.last_name,s.last_name,e.last_name)))) name,COALESCE(a.person_type,CASE WHEN a.student_id IS NOT NULL AND s.is_active=TRUE THEN 'Student' WHEN al.id IS NOT NULL THEN 'Alumnus' WHEN a.student_id IS NOT NULL THEN 'Student' ELSE 'Employee' END) type FROM event_attendance_logs a LEFT JOIN students s ON s.id=a.student_id LEFT JOIN alumni al ON al.student_id=a.student_id LEFT JOIN employees e ON e.id=a.employee_id WHERE a.id=? AND a.event_id=? FOR UPDATE`,
      [scanId, eventId],
    );
    const original = rows[0];
    if (!original) {
      await connection.rollback();
      return null;
    }
    await connection.query(
      "INSERT INTO event_attendance_corrections (attendance_log_id,event_id,attendee_id_number,attendee_name,attendee_type,correction_type,original_action,original_checked_in_at,reason,corrected_by,corrector_name) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [
        scanId,
        eventId,
        original.idNumber,
        original.name,
        original.type,
        "Deleted",
        original.action,
        original.timestamp,
        reason,
        user.id,
        user.fullName,
      ],
    );
    await connection.query(
      "DELETE FROM event_attendance_logs WHERE id=? AND event_id=?",
      [scanId, eventId],
    );
    await connection.commit();
    return original;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
exports.getEventCorrections = async (eventId) => {
  await ensureSchema();
  return (
    await pool.query(
      "SELECT id,attendance_log_id attendanceLogId,attendee_id_number idNumber,attendee_name name,attendee_type type,correction_type correctionType,original_action originalAction,original_checked_in_at originalTimestamp,corrected_action correctedAction,corrected_checked_in_at correctedTimestamp,reason,corrected_by correctedBy,corrector_name correctorName,corrected_at correctedAt FROM event_attendance_corrections WHERE event_id=? ORDER BY corrected_at DESC,id DESC",
      [eventId],
    )
  )[0];
};
exports.clear = async () => {
  await ensureSchema();
  await pool.query(
    "DELETE FROM university_entrance_logs WHERE academic_period_id=(SELECT id FROM academic_periods WHERE is_current=TRUE LIMIT 1)",
  );
};
exports.ensureSchema = ensureSchema;
