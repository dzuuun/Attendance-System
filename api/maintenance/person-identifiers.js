const pool = require("../../db/db");
// All ID-number and card assignments must use this same database lock.
const LOCK_NAME = "taptrack:card-enrollment";
let ready;
async function ensureSchema() {
  return (ready ||= (async () => {
    await require("./student/student.model").ensureSchema();
    await require("./employee/employee.model").ensureSchema();
    await require("./alumni/alumni.model").ensureSchema();
  })());
}
function conflictError() {
  return Object.assign(new Error("That ID number is already assigned or matches another person's card ID."), {
    code: "IDENTIFIER_CONFLICT", status: 409,
  });
}
async function acquire(connection) {
  const [[lock]] = await connection.query("SELECT GET_LOCK(?,10) acquired", [LOCK_NAME]);
  if (!lock?.acquired)
    throw Object.assign(new Error("Another ID or card assignment is in progress. Please try again."), { status: 503 });
}
async function release(connection) {
  await connection.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]).catch(() => {});
}
async function assertAvailable(connection, { type, id = 0, studentId = null, idNumber }) {
  const value = String(idNumber).trim().toUpperCase();
  const [rows] = await connection.query(
    "SELECT id,id_number idNumber,card_id cardId,id studentId,'student' type FROM students WHERE id_number=? OR card_id=? UNION ALL SELECT id,id_number idNumber,card_id cardId,NULL studentId,'employee' type FROM employees WHERE id_number=? OR card_id=? UNION ALL SELECT id,id_number idNumber,card_id cardId,student_id studentId,'alumni' type FROM alumni WHERE id_number=? OR card_id=?",
    [value, value, value, value, value, value],
  );
  const linkedStudentId = type === "student" ? Number(id) : Number(studentId);
  for (const row of rows) {
    if (row.type === type && Number(row.id) === Number(id)) continue;
    // A student's own linked alumni record may retain the same official ID.
    if (type !== "employee" && row.type !== "employee" && linkedStudentId > 0
      && Number(row.studentId) === linkedStudentId
      && String(row.idNumber).trim().toUpperCase() === value) continue;
    throw conflictError();
  }
}
async function withTransaction(work) {
  // Schema work must finish before reserving a connection or taking the lock.
  await ensureSchema();
  const connection = await pool.getConnection();
  let locked = false, started = false;
  try {
    await acquire(connection);
    locked = true;
    await connection.beginTransaction();
    started = true;
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    if (started) await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") throw conflictError();
    throw error;
  } finally {
    if (locked) await release(connection);
    connection.release();
  }
}
module.exports = { ensureSchema, acquire, release, assertAvailable, withTransaction, conflictError };
