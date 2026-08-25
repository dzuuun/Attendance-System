const pool = require("../../db/db");
let namesReady;
async function ensurePersonNames() {
  if (!namesReady)
    namesReady = (async () => {
      await require("../maintenance/academic_period/academic_period.model").ensureSchema();
      for (const table of ["students", "employees"]) {
        await pool.query(
          `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS first_name VARCHAR(80) NULL,ADD COLUMN IF NOT EXISTS middle_name VARCHAR(80) NULL AFTER first_name,ADD COLUMN IF NOT EXISTS last_name VARCHAR(80) NULL AFTER middle_name`,
        );
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
      for (const table of ["student_attendance", "employee_attendance"])
        await pool.query(
          `ALTER TABLE ${table} DROP COLUMN IF EXISTS full_name`,
        );
    })();
  return namesReady;
}
exports.getAll = async () => {
  await ensurePersonNames();
  return (
    await pool.query(`SELECT * FROM (
  SELECT CONCAT('S-',a.id) id,'Student' type,a.student_id personId,a.id_number idNumber,TRIM(CONCAT_WS(' ',s.first_name,NULLIF(s.middle_name,''),s.last_name)) name,a.event_id eventId,e.name eventName,a.attendance_action action,a.checked_in_at timestamp FROM student_attendance a INNER JOIN academic_periods ap ON ap.id=a.academic_period_id AND ap.is_current=TRUE INNER JOIN students s ON s.id=a.student_id LEFT JOIN events e ON e.id=a.event_id
  UNION ALL
  SELECT CONCAT('E-',a.id) id,'Employee' type,a.employee_id personId,a.id_number idNumber,TRIM(CONCAT_WS(' ',p.first_name,NULLIF(p.middle_name,''),p.last_name)) name,a.event_id eventId,e.name eventName,a.attendance_action action,a.checked_in_at timestamp FROM employee_attendance a INNER JOIN academic_periods ap ON ap.id=a.academic_period_id AND ap.is_current=TRUE INNER JOIN employees p ON p.id=a.employee_id LEFT JOIN events e ON e.id=a.event_id
) records ORDER BY timestamp DESC LIMIT 1000`)
  )[0];
};
exports.getByEvent = async (eventId) => {
  await ensurePersonNames();
  return (
    await pool.query(
      `SELECT * FROM (
  SELECT CONCAT('S-',a.id) id,'Student' type,a.student_id personId,a.id_number idNumber,TRIM(CONCAT_WS(' ',s.first_name,NULLIF(s.middle_name,''),s.last_name)) name,COALESCE(pr.name,TRIM(SUBSTRING_INDEX(s.program_section,'·',1))) course,NULL department,a.event_id eventId,e.name eventName,a.attendance_action action,a.checked_in_at timestamp FROM student_attendance a INNER JOIN students s ON s.id=a.student_id LEFT JOIN programs pr ON pr.id=s.program_id INNER JOIN events e ON e.id=a.event_id WHERE a.event_id=?
  UNION ALL
  SELECT CONCAT('E-',a.id) id,'Employee' type,a.employee_id personId,a.id_number idNumber,TRIM(CONCAT_WS(' ',p.first_name,NULLIF(p.middle_name,''),p.last_name)) name,NULL course,TRIM(SUBSTRING_INDEX(p.department_role,'·',1)) department,a.event_id eventId,e.name eventName,a.attendance_action action,a.checked_in_at timestamp FROM employee_attendance a INNER JOIN employees p ON p.id=a.employee_id INNER JOIN events e ON e.id=a.event_id WHERE a.event_id=?
) records ORDER BY timestamp DESC`,
      [eventId, eventId],
    )
  )[0];
};
exports.findPerson = async (idNumber, audience = "Both") => {
  await ensurePersonNames();
  const findStudent = () =>
    pool.query(
      "SELECT id,id_number idNumber,TRIM(CONCAT_WS(' ',first_name,NULLIF(middle_name,''),last_name)) name,TRIM(SUBSTRING_INDEX(program_section,'·',1)) program,CASE WHEN program_section LIKE '%·%' THEN TRIM(SUBSTRING_INDEX(program_section,'·',-1)) ELSE '' END yearLevel,'Student' type FROM students WHERE id_number=? AND is_active=TRUE",
      [idNumber],
    );
  const findEmployee = () =>
    pool.query(
      "SELECT id,id_number idNumber,TRIM(CONCAT_WS(' ',first_name,NULLIF(middle_name,''),last_name)) name,TRIM(SUBSTRING_INDEX(department_role,'·',1)) department,'Employee' type FROM employees WHERE id_number=? AND is_active=TRUE",
      [idNumber],
    );
  if (audience === "Students") return (await findStudent())[0][0];
  if (audience === "Employees") return (await findEmployee())[0][0];
  const [[students], [employees]] = await Promise.all([
    findStudent(),
    findEmployee(),
  ]);
  return students[0] || employees[0];
};
const target = (person) =>
  person.type === "Student"
    ? { table: "student_attendance", column: "student_id" }
    : { table: "employee_attendance", column: "employee_id" };
exports.findLatest = async (person, eventId) => {
  const { table, column } = target(person),
    clause = eventId
      ? "event_id=?"
      : "event_id IS NULL AND academic_period_id=(SELECT id FROM academic_periods WHERE is_current=TRUE LIMIT 1) AND DATE(checked_in_at)=CURDATE()",
    params = eventId ? [person.id, eventId] : [person.id];
  return (
    await pool.query(
      `SELECT attendance_action action,checked_in_at timestamp FROM ${table} WHERE ${column}=? AND ${clause} ORDER BY checked_in_at DESC,id DESC LIMIT 1`,
      params,
    )
  )[0][0];
};
exports.getActionCounts = async (person, eventId) => {
  if (!eventId) return null;
  const { table, column } = target(person),
    [rows] = await pool.query(
      `SELECT SUM(attendance_action='Time In') timeIns,SUM(attendance_action='Time Out') timeOuts FROM ${table} WHERE ${column}=? AND event_id=?`,
      [person.id, eventId],
    );
  return {
    timeIns: Number(rows[0].timeIns || 0),
    timeOuts: Number(rows[0].timeOuts || 0),
  };
};
exports.record = async (person, action, eventId = null) => {
  await ensurePersonNames();
  const current =
    await require("../maintenance/academic_period/academic_period.model").getCurrent();
  if (!current) throw new Error("No current academic period is configured.");
  const { table, column } = target(person);
  return (
    await pool.query(
      `INSERT INTO ${table} (${column},id_number,event_id,attendance_action,academic_period_id) VALUES (?,?,?,?,?)`,
      [person.id, person.idNumber, eventId, action, current.id],
    )
  )[0];
};
exports.clear = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "DELETE FROM student_attendance WHERE academic_period_id=(SELECT id FROM academic_periods WHERE is_current=TRUE LIMIT 1)",
    );
    await connection.query(
      "DELETE FROM employee_attendance WHERE academic_period_id=(SELECT id FROM academic_periods WHERE is_current=TRUE LIMIT 1)",
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
