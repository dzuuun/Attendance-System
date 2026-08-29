const pool = require("./db");

const indexes = {
  students: {
    idx_students_name: ["last_name", "first_name"],
    idx_students_program: ["program_id"],
    idx_students_active_name: ["is_active", "last_name", "first_name"],
  },
  employees: {
    idx_employees_name: ["last_name", "first_name"],
    idx_employees_active_name: ["is_active", "last_name", "first_name"],
  },
  employee_departments: {
    idx_employee_departments_active_name: ["is_active", "name"],
  },
  schools: { idx_schools_active_name: ["is_active", "name"] },
  colleges: { idx_colleges_school_name: ["school_id", "name"] },
  departments: { idx_departments_college_name: ["college_id", "name"] },
  programs: {
    idx_programs_department_name: ["department_id", "name"],
    idx_programs_code: ["code"],
  },
  academic_periods: { idx_academic_current: ["is_current"] },
  events: {
    idx_event_schedule: ["starts_at", "ends_at"],
    idx_events_period_schedule: ["academic_period_id", "starts_at"],
  },
  university_entrance_logs: {
    idx_university_period_time: ["academic_period_id", "checked_in_at", "id"],
    idx_university_student_time: ["student_id", "academic_period_id", "checked_in_at", "id"],
    idx_university_employee_time: ["employee_id", "academic_period_id", "checked_in_at", "id"],
  },
  event_attendance_logs: {
    idx_event_attendance_event_time: ["event_id", "checked_in_at", "id"],
    idx_event_attendance_student_time: ["student_id", "event_id", "checked_in_at", "id"],
    idx_event_attendance_employee_time: ["employee_id", "event_id", "checked_in_at", "id"],
    idx_event_attendance_period_time: ["academic_period_id", "checked_in_at", "id"],
    idx_event_student_period_time: ["student_id", "academic_period_id", "checked_in_at", "id"],
    idx_event_employee_period_time: ["employee_id", "academic_period_id", "checked_in_at", "id"],
  },
  users: {
    idx_users_permission_name: ["permission_id", "last_name", "first_name"],
    idx_users_name: ["last_name", "first_name"],
  },
  activity_logs: { idx_activity_created_id: ["created_at", "id"] },
  library_entrance_logs: {
    idx_period_time: ["academic_period_id", "checked_in_at", "id"],
    idx_student_period_time: ["student_id", "academic_period_id", "checked_in_at", "id"],
    idx_employee_period_time: ["employee_id", "academic_period_id", "checked_in_at", "id"],
  },
  internet_section_entrance_logs: {
    idx_period_time: ["academic_period_id", "checked_in_at", "id"],
    idx_student_period_time: ["student_id", "academic_period_id", "checked_in_at", "id"],
    idx_employee_period_time: ["employee_id", "academic_period_id", "checked_in_at", "id"],
  },
};

exports.ensureIndexes = async () => {
  const [rows] = await pool.query(
    "SELECT TABLE_NAME tableName,INDEX_NAME indexName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()",
  );
  const existing = new Set(
    rows.map((row) => `${row.tableName}.${row.indexName}`),
  );
  const tables = new Set(rows.map((row) => row.tableName));
  for (const [table, definitions] of Object.entries(indexes)) {
    if (!tables.has(table)) continue;
    for (const [name, columns] of Object.entries(definitions)) {
      if (existing.has(`${table}.${name}`)) continue;
      const quotedColumns = columns.map((column) => `\`${column}\``).join(",");
      await pool.query(
        `ALTER TABLE \`${table}\` ADD INDEX \`${name}\` (${quotedColumns})`,
      );
      existing.add(`${table}.${name}`);
    }
  }
};
