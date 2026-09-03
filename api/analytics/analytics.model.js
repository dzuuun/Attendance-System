const pool = require("../../db/db");

const numeric = (row) =>
  Object.fromEntries(
    Object.entries(row || {}).map(([key, value]) => [
      key,
      typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
    ]),
  );

const filter = (alias, from, to, periodId) =>
  periodId
    ? { sql: `${alias}academic_period_id=?`, params: [periodId] }
    : {
        sql: `${alias}checked_in_at>=? AND ${alias}checked_in_at<DATE_ADD(?,INTERVAL 1 DAY)`,
        params: [from, to],
      };

exports.entrance = async (from, to, periodId = null) => {
  const range = filter("", from, to, periodId);
  const personKey =
    "CONCAT(IF(student_id IS NULL,'E','S'),COALESCE(student_id,employee_id))";
  const [[[summary]], [daily], [locations], [hours]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) total,COUNT(DISTINCT ${personKey}) uniquePeople,SUM(student_id IS NOT NULL) students,SUM(employee_id IS NOT NULL) employees,SUM(attendance_action='Time In') timeIn,SUM(attendance_action='Time Out') timeOut FROM university_entrance_logs WHERE ${range.sql}`,
      range.params,
    ),
    pool.query(
      `SELECT DATE_FORMAT(checked_in_at,'%Y-%m-%d') date,COUNT(*) total,SUM(attendance_action='Time In') timeIn,SUM(attendance_action='Time Out') timeOut FROM university_entrance_logs WHERE ${range.sql} GROUP BY DATE(checked_in_at) ORDER BY DATE(checked_in_at)`,
      range.params,
    ),
    pool.query(
      `SELECT COALESCE(NULLIF(scan_location,''),'Unspecified') label,COUNT(*) total FROM university_entrance_logs WHERE ${range.sql} GROUP BY scan_location ORDER BY total DESC,label LIMIT 10`,
      range.params,
    ),
    pool.query(
      `SELECT HOUR(checked_in_at) hour,COUNT(*) total FROM university_entrance_logs WHERE ${range.sql} GROUP BY HOUR(checked_in_at) ORDER BY hour`,
      range.params,
    ),
  ]);
  return {
    summary: numeric(summary),
    daily: daily.map(numeric),
    breakdown: locations.map(numeric),
    hours: hours.map(numeric),
  };
};

const facility = async (table, from, to, periodId) => {
  const range = filter("l.", from, to, periodId);
  const [[[summary]], [daily], [groups], [hours]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) total,COUNT(DISTINCT CONCAT(IF(l.student_id IS NULL,'E','S'),COALESCE(l.student_id,l.employee_id))) uniquePeople,SUM(l.student_id IS NOT NULL) students,SUM(l.employee_id IS NOT NULL) employees FROM ${table} l WHERE ${range.sql}`,
      range.params,
    ),
    pool.query(
      `SELECT DATE_FORMAT(l.checked_in_at,'%Y-%m-%d') date,COUNT(*) total FROM ${table} l WHERE ${range.sql} GROUP BY DATE(l.checked_in_at) ORDER BY DATE(l.checked_in_at)`,
      range.params,
    ),
    pool.query(
      `SELECT COALESCE(p.code,ed.code,IF(l.student_id IS NOT NULL,'Student - unspecified','Employee - unspecified')) label,COUNT(*) total FROM ${table} l LEFT JOIN students s ON s.id=l.student_id LEFT JOIN programs p ON p.id=s.program_id LEFT JOIN employees e ON e.id=l.employee_id LEFT JOIN employee_departments ed ON ed.id=e.emp_dept_id WHERE ${range.sql} GROUP BY label ORDER BY total DESC,label LIMIT 10`,
      range.params,
    ),
    pool.query(
      `SELECT HOUR(l.checked_in_at) hour,COUNT(*) total FROM ${table} l WHERE ${range.sql} GROUP BY HOUR(l.checked_in_at) ORDER BY hour`,
      range.params,
    ),
  ]);
  return {
    summary: numeric(summary),
    daily: daily.map(numeric),
    breakdown: groups.map(numeric),
    hours: hours.map(numeric),
  };
};

exports.library = async (from, to, periodId = null) => {
  const [library, internet] = await Promise.all([
    facility("library_entrance_logs", from, to, periodId),
    facility("internet_section_entrance_logs", from, to, periodId),
  ]);
  return { library, internet };
};
