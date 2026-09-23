const pool = require("../db/db");

async function main() {
  const [
    [birthdayRows],
    [snapshotRows],
    [degreeRows],
    [constraintRows],
    [securityTableRows],
    [integrityRows],
    [kioskSessionRows],
    [kioskActivityRows],
  ] = await Promise.all([
    pool.query(
      "SELECT birthday FROM students WHERE birthday IS NOT NULL LIMIT 1",
    ),
    pool.query(
      "SELECT TABLE_NAME tableName,COUNT(*) columnsFound FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME IN ('person_type','id_number_snapshot','name_snapshot','affiliation_snapshot') GROUP BY TABLE_NAME ORDER BY TABLE_NAME",
    ),
    pool.query("SHOW TABLES LIKE 'alumni_degrees'"),
    pool.query(
      "SELECT TABLE_NAME tableName,CONSTRAINT_NAME constraintName,CONSTRAINT_TYPE constraintType FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND (CONSTRAINT_NAME LIKE 'chk\\_%\\_identity' OR CONSTRAINT_NAME LIKE 'fk\\_university\\_entrance\\_logs\\_%' OR CONSTRAINT_NAME LIKE 'fk\\_library\\_entrance\\_logs\\_%' OR CONSTRAINT_NAME LIKE 'fk\\_internet\\_section\\_entrance\\_logs\\_%') ORDER BY TABLE_NAME,CONSTRAINT_NAME",
    ),
    pool.query(
      "SELECT TABLE_NAME tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('auth_sessions','kiosk_sessions','api_rate_limits') ORDER BY TABLE_NAME",
    ),
    pool.query(
      `SELECT
        (SELECT COUNT(*) FROM university_entrance_logs WHERE (student_id IS NULL)=(employee_id IS NULL)) +
        (SELECT COUNT(*) FROM event_attendance_logs WHERE (student_id IS NULL)=(employee_id IS NULL)) +
        (SELECT COUNT(*) FROM library_entrance_logs WHERE (student_id IS NULL)=(employee_id IS NULL)) +
        (SELECT COUNT(*) FROM internet_section_entrance_logs WHERE (student_id IS NULL)=(employee_id IS NULL)) invalidIdentities`,
    ),
    pool.query(
      "SELECT kiosk_id kioskId,COUNT(*) sessions,MAX(created_at) newest,MAX(last_seen_at) lastSeen,MAX(expires_at) expiresAt,SUM(revoked_at IS NULL) active FROM kiosk_sessions GROUP BY kiosk_id ORDER BY newest DESC LIMIT 20",
    ),
    pool.query(
      "SELECT action,actor_username actor,description,created_at createdAt FROM activity_logs WHERE action IN ('KIOSK_VERIFIED','KIOSK_VERIFICATION_FAILED') ORDER BY id DESC LIMIT 20",
    ),
  ]);
  console.log(
    JSON.stringify(
      {
        birthday: birthdayRows[0]?.birthday || null,
        birthdayType: typeof birthdayRows[0]?.birthday,
        snapshotTables: snapshotRows,
        alumniDegrees: Boolean(degreeRows.length),
        securityTables: securityTableRows.map((row) => row.tableName),
        constraints: constraintRows,
        invalidLogIdentities: Number(integrityRows[0]?.invalidIdentities || 0),
        kioskSessions: kioskSessionRows,
        kioskVerificationActivity: kioskActivityRows,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
