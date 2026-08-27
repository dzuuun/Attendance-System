const pool = require("../../db/db");
const attendance = require("../attendance/attendance.model");
const library = require("../library/library.model");
const personConfig = { Student: { column: "student_id" }, Employee: { column: "employee_id" } };
exports.getPerson = async (type, id) => {
  if (!personConfig[type]) return null;
  if (type === "Student") return (await pool.query("SELECT s.id,s.id_number idNumber,TRIM(CONCAT_WS(' ',s.first_name,NULLIF(s.middle_name,''),s.last_name)) name,COALESCE(p.name,TRIM(SUBSTRING_INDEX(s.program_section,'·',1))) course,NULL department,'Student' type FROM students s LEFT JOIN programs p ON p.id=s.program_id WHERE s.id=?", [id]))[0][0];
  return (await pool.query("SELECT e.id,e.id_number idNumber,TRIM(CONCAT_WS(' ',e.first_name,NULLIF(e.middle_name,''),e.last_name)) name,NULL course,TRIM(SUBSTRING_INDEX(e.department_role,'·',1)) department,'Employee' type FROM employees e WHERE e.id=?", [id]))[0][0];
};
exports.getLogs = async (type, id, source, dateRange = null) => {
  await attendance.ensureSchema();
  await library.ensureSchema();
  const config = personConfig[type];
  if (!config) return null;
  const dateFilter = dateRange ? "AND a.checked_in_at>=? AND a.checked_in_at<DATE_ADD(?,INTERVAL 1 DAY)" : "";
  const params = dateRange ? [id,dateRange.from,dateRange.to] : [id];
  if (source === "university") return (await pool.query(`SELECT a.id,a.attendance_action action,a.checked_in_at timestamp FROM university_entrance_logs a INNER JOIN academic_periods ap ON ap.id=a.academic_period_id AND ap.is_current=TRUE WHERE a.${config.column}=? ${dateFilter} ORDER BY a.checked_in_at DESC,a.id DESC`, params))[0];
  if (source === "events") return (await pool.query(`SELECT a.id,a.event_id eventId,e.name eventName,e.starts_at startsAt,e.ends_at endsAt,a.attendance_action action,a.checked_in_at timestamp FROM event_attendance_logs a INNER JOIN academic_periods ap ON ap.id=a.academic_period_id AND ap.is_current=TRUE INNER JOIN events e ON e.id=a.event_id WHERE a.${config.column}=? ${dateFilter} ORDER BY e.starts_at DESC,a.checked_in_at ASC,a.id ASC`, params))[0];
  const table = source === "library" ? "library_entrance_logs" : source === "internet" ? "internet_section_entrance_logs" : null;
  if (!table) return null;
  return (await pool.query(`SELECT a.id,'Time In' action,a.checked_in_at timestamp FROM ${table} a INNER JOIN academic_periods ap ON ap.id=a.academic_period_id AND ap.is_current=TRUE WHERE a.${config.column}=? ${dateFilter} ORDER BY a.checked_in_at DESC,a.id DESC`, params))[0];
};
