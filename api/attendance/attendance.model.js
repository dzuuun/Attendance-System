const pool = require("../../db/db");
exports.getAll = async () =>
  (
    await pool.query(`SELECT * FROM (
  SELECT CONCAT('S-',a.id) id,'Student' type,a.student_id personId,a.id_number idNumber,a.full_name name,a.event_id eventId,e.name eventName,a.attendance_action action,a.checked_in_at timestamp FROM student_attendance a LEFT JOIN events e ON e.id=a.event_id
  UNION ALL
  SELECT CONCAT('E-',a.id) id,'Employee' type,a.employee_id personId,a.id_number idNumber,a.full_name name,a.event_id eventId,e.name eventName,a.attendance_action action,a.checked_in_at timestamp FROM employee_attendance a LEFT JOIN events e ON e.id=a.event_id
) records ORDER BY timestamp DESC LIMIT 1000`)
  )[0];
exports.findPerson = async (idNumber) => {
  const [[students], [employees]] = await Promise.all([
    pool.query(
      "SELECT id,id_number idNumber,full_name name,TRIM(SUBSTRING_INDEX(program_section,'·',1)) program,CASE WHEN program_section LIKE '%·%' THEN TRIM(SUBSTRING_INDEX(program_section,'·',-1)) ELSE '' END yearLevel,'Student' type FROM students WHERE id_number=? AND is_active=TRUE",
      [idNumber],
    ),
    pool.query(
      "SELECT id,id_number idNumber,full_name name,TRIM(SUBSTRING_INDEX(department_role,'·',1)) department,'Employee' type FROM employees WHERE id_number=?",
      [idNumber],
    ),
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
      : "event_id IS NULL AND DATE(checked_in_at)=CURDATE()",
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
  const { table, column } = target(person);
  return (
    await pool.query(
      `INSERT INTO ${table} (${column},id_number,full_name,event_id,attendance_action) VALUES (?,?,?,?,?)`,
      [person.id, person.idNumber, person.name, eventId, action],
    )
  )[0];
};
exports.clear = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM student_attendance");
    await connection.query("DELETE FROM employee_attendance");
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
