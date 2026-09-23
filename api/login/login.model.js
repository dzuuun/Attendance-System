const pool = require("../../db/db");
const schema = require("../../db/schema");
const permissionModel = require("../user/permission/permission.model");
async function ensureNames() {
  const [columns] = await pool.query(
    "SELECT COLUMN_NAME name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='full_name'",
  );
  if (columns.length) {
    await schema.addColumns("users", [
      ["first_name", "VARCHAR(80) NULL"],
      ["middle_name", "VARCHAR(80) NULL"],
      ["last_name", "VARCHAR(80) NULL"],
    ]);
    await pool.query(
      "UPDATE users SET first_name=COALESCE(first_name,SUBSTRING_INDEX(full_name,' ',1)),last_name=COALESCE(last_name,CASE WHEN full_name LIKE '% %' THEN SUBSTRING_INDEX(full_name,' ',-1) ELSE full_name END)",
    );
    await pool.query("ALTER TABLE users DROP COLUMN full_name");
  }
}
const findByUsername = async (username) => {
  await require("../user/user_management/user_management.model").ensureSchema();
  await ensureNames();
  return (
    await pool.query(
      "SELECT u.id,TRIM(CONCAT_WS(' ',u.first_name,NULLIF(u.middle_name,''),u.last_name)) fullName,u.username,u.password_hash passwordHash,p.name role,u.is_active isActive,p.is_active permissionActive,p.overview_access overviewAccess,p.attendance_access attendanceAccess,p.special_events_access specialEventsAccess,p.library_access libraryAccess,p.maintenance_access maintenanceAccess,p.maintenance_modules maintenanceModules,p.users_access usersAccess FROM users u INNER JOIN permissions p ON p.id=u.permission_id WHERE u.username=?",
      [username],
    )
  )[0][0];
};
const findByInstitutionalEmail = async (email) => {
  await require("../user/user_management/user_management.model").ensureSchema();
  await ensureNames();
  return (
    await pool.query(
      "SELECT u.id,TRIM(CONCAT_WS(' ',u.first_name,NULLIF(u.middle_name,''),u.last_name)) fullName,u.username,u.institutional_email institutionalEmail,p.name role,u.is_active isActive,p.is_active permissionActive,p.overview_access overviewAccess,p.attendance_access attendanceAccess,p.special_events_access specialEventsAccess,p.library_access libraryAccess,p.maintenance_access maintenanceAccess,p.maintenance_modules maintenanceModules,p.users_access usersAccess FROM users u INNER JOIN permissions p ON p.id=u.permission_id WHERE u.institutional_email=? LIMIT 1",
      [email],
    )
  )[0][0];
};
const findPasswordById = async (id) =>
  (
    await pool.query(
      "SELECT id,username,password_hash passwordHash FROM users WHERE id=? LIMIT 1",
      [id],
    )
  )[0][0];
const updatePassword = async (id, passwordHash) =>
  (
    await pool.query("UPDATE users SET password_hash=? WHERE id=?", [
      passwordHash,
      id,
    ])
  )[0];
const countUsers = async () =>
  (await pool.query("SELECT COUNT(*) count FROM users"))[0][0].count;
const createInitialSuperadmin = async ({
  firstName,
  middleName,
  lastName,
  username,
  passwordHash,
}) => {
  await permissionModel.ensureSchema();
  await ensureNames();
  const connection = await pool.getConnection();
  try {
    const [lock] = await connection.query(
      "SELECT GET_LOCK('taptrack-initial-setup',10) acquired",
    );
    if (!lock[0]?.acquired)
      throw new Error("Initial setup is busy. Try again.");
    await connection.beginTransaction();
    const [counts] = await connection.query(
      "SELECT COUNT(*) count FROM users FOR UPDATE",
    );
    if (counts[0].count) {
      await connection.rollback();
      return null;
    }
    const result = (
      await connection.query(
        "INSERT INTO users (first_name,middle_name,last_name,username,password_hash,permission_id) VALUES (?,?,?,?,?,(SELECT id FROM permissions WHERE name='Superadmin' LIMIT 1))",
        [firstName, middleName, lastName, username, passwordHash],
      )
    )[0];
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection
      .query("SELECT RELEASE_LOCK('taptrack-initial-setup')")
      .catch(() => {});
    connection.release();
  }
};
module.exports = {
  findByUsername,
  findByInstitutionalEmail,
  findPasswordById,
  updatePassword,
  countUsers,
  createInitialSuperadmin,
};
