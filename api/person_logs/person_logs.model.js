const pool = require("../../db/db");
const attendance = require("../attendance/attendance.model");
const library = require("../library/library.model");
const personConfig = { Student: { column: "student_id" }, Employee: { column: "employee_id" } };
exports.getPerson = async (type, id) => {
  if (!personConfig[type]) return null;
  if (type === "Student") return (await pool.query("SELECT s.id,s.id_number idNumber,TRIM(CONCAT_WS(' ',s.first_name,NULLIF(s.middle_name,''),s.last_name)) name,p.name course,NULL department,'Student' type FROM students s LEFT JOIN programs p ON p.id=s.program_id WHERE s.id=?", [id]))[0][0];
  return (await pool.query("SELECT e.id,e.id_number idNumber,TRIM(CONCAT_WS(' ',e.first_name,NULLIF(e.middle_name,''),e.last_name)) name,NULL course,d.name department,'Employee' type FROM employees e LEFT JOIN employee_departments d ON d.id=e.emp_dept_id WHERE e.id=?", [id]))[0][0];
};
exports.getAcademicPeriod = async (id) =>
  (
    await pool.query(
      "SELECT id,school_year schoolYear,term,is_current isCurrent FROM academic_periods WHERE id=? LIMIT 1",
      [id],
    )
  )[0][0];
exports.getLogs = async (type, id, source, academicPeriodId, dateRange = null) => {
  await attendance.ensureSchema();
  await library.ensureSchema();
  const config = personConfig[type];
  if (!config) return null;
  const dateFilter = dateRange ? "AND a.checked_in_at>=? AND a.checked_in_at<DATE_ADD(?,INTERVAL 1 DAY)" : "";
  const params = dateRange ? [id,academicPeriodId,dateRange.from,dateRange.to] : [id,academicPeriodId];
  if (source === "university") return (await pool.query(`SELECT a.id,a.attendance_action action,a.checked_in_at timestamp FROM university_entrance_logs a WHERE a.${config.column}=? AND a.academic_period_id=? ${dateFilter} ORDER BY a.checked_in_at DESC,a.id DESC`, params))[0];
  if (source === "events") return (await pool.query(`SELECT a.id,a.event_id eventId,e.name eventName,e.starts_at startsAt,e.ends_at endsAt,a.attendance_action action,a.checked_in_at timestamp FROM event_attendance_logs a INNER JOIN events e ON e.id=a.event_id WHERE a.${config.column}=? AND a.academic_period_id=? ${dateFilter} ORDER BY e.starts_at DESC,a.checked_in_at ASC,a.id ASC`, params))[0];
  const table = source === "library" ? "library_entrance_logs" : source === "internet" ? "internet_section_entrance_logs" : null;
  if (!table) return null;
  return (await pool.query(`SELECT a.id,'Time In' action,a.checked_in_at timestamp FROM ${table} a WHERE a.${config.column}=? AND a.academic_period_id=? ${dateFilter} ORDER BY a.checked_in_at DESC,a.id DESC`, params))[0];
};
