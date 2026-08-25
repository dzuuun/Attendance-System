const pool = require("../../db/db");
const permissionModel = require("../user/permission/permission.model");
async function ensureNames() {
  const [columns] = await pool.query(
    "SELECT COLUMN_NAME name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='full_name'",
  );
  if (columns.length) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(80) NULL, ADD COLUMN IF NOT EXISTS middle_name VARCHAR(80) NULL, ADD COLUMN IF NOT EXISTS last_name VARCHAR(80) NULL",
    );
    await pool.query(
      "UPDATE users SET first_name=COALESCE(first_name,SUBSTRING_INDEX(full_name,' ',1)),last_name=COALESCE(last_name,CASE WHEN full_name LIKE '% %' THEN SUBSTRING_INDEX(full_name,' ',-1) ELSE full_name END)",
    );
    await pool.query("ALTER TABLE users DROP COLUMN full_name");
  }
}
const findByUsername = async (username) => {
  await permissionModel.ensureSchema();
  await ensureNames();
  return (
    await pool.query(
      "SELECT u.id,TRIM(CONCAT_WS(' ',u.first_name,NULLIF(u.middle_name,''),u.last_name)) fullName,u.username,u.password_hash passwordHash,p.name role,u.is_active isActive,p.is_active permissionActive,p.attendance_access attendanceAccess,p.special_events_access specialEventsAccess,p.historical_data_access historicalDataAccess,p.library_access libraryAccess,p.maintenance_access maintenanceAccess,p.users_access usersAccess,p.people_access peopleAccess FROM users u INNER JOIN permissions p ON p.id=u.permission_id WHERE u.username=?",
      [username],
    )
  )[0][0];
};
const findByInstitutionalEmail = async (email) => {
  await require("../user/user_management/user_management.model").ensureSchema();
  await ensureNames();
  return (
    await pool.query(
      "SELECT u.id,TRIM(CONCAT_WS(' ',u.first_name,NULLIF(u.middle_name,''),u.last_name)) fullName,u.username,u.institutional_email institutionalEmail,p.name role,u.is_active isActive,p.is_active permissionActive,p.attendance_access attendanceAccess,p.special_events_access specialEventsAccess,p.historical_data_access historicalDataAccess,p.library_access libraryAccess,p.maintenance_access maintenanceAccess,p.users_access usersAccess,p.people_access peopleAccess FROM users u INNER JOIN permissions p ON p.id=u.permission_id WHERE LOWER(u.institutional_email)=LOWER(?) LIMIT 1",
      [email],
    )
  )[0][0];
};
const countUsers = async () =>
  (await pool.query("SELECT COUNT(*) count FROM users"))[0][0].count;
const createSuperadmin = async ({ fullName, username, passwordHash }) => {
  await permissionModel.ensureSchema();
  await ensureNames();
  const parts = String(fullName).trim().split(/\s+/),
    firstName = parts.shift(),
    lastName = parts.pop() || firstName,
    middleName = parts.join(" ") || null;
  return (
    await pool.query(
      "INSERT INTO users (first_name,middle_name,last_name,username,password_hash,permission_id) VALUES (?,?,?,?,?,(SELECT id FROM permissions WHERE name='Superadmin' LIMIT 1))",
      [firstName, middleName, lastName, username, passwordHash],
    )
  )[0];
};
module.exports = {
  findByUsername,
  findByInstitutionalEmail,
  countUsers,
  createSuperadmin,
};
