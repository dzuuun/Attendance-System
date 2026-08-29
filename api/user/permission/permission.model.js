const pool = require("../../../db/db");
let ready;
async function ensureSchema() {
  if (!ready)
    ready = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS permissions (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,name VARCHAR(80) NOT NULL UNIQUE,description VARCHAR(255),overview_access BOOLEAN NOT NULL DEFAULT FALSE,attendance_access BOOLEAN NOT NULL DEFAULT FALSE,special_events_access BOOLEAN NOT NULL DEFAULT FALSE,library_access BOOLEAN NOT NULL DEFAULT FALSE,maintenance_access BOOLEAN NOT NULL DEFAULT FALSE,users_access BOOLEAN NOT NULL DEFAULT FALSE,people_access ENUM('Students','Employees','Both') NOT NULL DEFAULT 'Both',is_active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      );
      await pool.query(
        `ALTER TABLE permissions ADD COLUMN IF NOT EXISTS overview_access BOOLEAN NOT NULL DEFAULT FALSE AFTER description,ADD COLUMN IF NOT EXISTS attendance_access BOOLEAN NOT NULL DEFAULT FALSE AFTER overview_access,ADD COLUMN IF NOT EXISTS special_events_access BOOLEAN NOT NULL DEFAULT FALSE AFTER attendance_access,ADD COLUMN IF NOT EXISTS library_access BOOLEAN NOT NULL DEFAULT FALSE AFTER special_events_access,ADD COLUMN IF NOT EXISTS maintenance_access BOOLEAN NOT NULL DEFAULT FALSE AFTER library_access,ADD COLUMN IF NOT EXISTS users_access BOOLEAN NOT NULL DEFAULT FALSE AFTER maintenance_access,ADD COLUMN IF NOT EXISTS people_access ENUM('Students','Employees','Both') NOT NULL DEFAULT 'Both' AFTER users_access`,
      );
      const [legacyHistory] = await pool.query(
        "SELECT COUNT(*) count FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='permissions' AND column_name='historical_data_access'",
      );
      if (legacyHistory[0].count)
        await pool.query(
          "UPDATE permissions SET special_events_access=TRUE WHERE historical_data_access=TRUE",
        );
      await pool.query(
        `INSERT IGNORE INTO permissions (name,description,attendance_access,special_events_access,maintenance_access,users_access) VALUES ('Superadmin','Full system access',TRUE,TRUE,TRUE,TRUE),('Administrator','Administrative access',TRUE,TRUE,TRUE,TRUE),('Staff','Standard attendance access',TRUE,FALSE,FALSE,FALSE)`,
      );
      await pool.query(
        "UPDATE permissions SET library_access=TRUE WHERE name='Superadmin'",
      );
      await pool.query(
        "UPDATE permissions SET library_access=TRUE WHERE name='Administrator'",
      );
      await pool.query(
        "UPDATE permissions SET overview_access=TRUE WHERE name IN ('Superadmin','Administrator','Staff','Student Organizations')",
      );
      await pool.query(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_id INT UNSIGNED NULL",
      );
      const [roleColumns] = await pool.query(
        "SELECT COUNT(*) count FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='role'",
      );
      if (roleColumns[0].count)
        await pool.query(
          "UPDATE users u INNER JOIN permissions p ON p.name=u.role SET u.permission_id=COALESCE(u.permission_id,p.id)",
        );
      await pool.query(
        "UPDATE users SET permission_id=(SELECT id FROM permissions WHERE name='Staff' LIMIT 1) WHERE permission_id IS NULL",
      );
      const [foreignKeys] = await pool.query(
        "SELECT COUNT(*) count FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='users' AND constraint_name='fk_users_permission'",
      );
      if (!foreignKeys[0].count)
        await pool.query(
          "ALTER TABLE users ADD CONSTRAINT fk_users_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON UPDATE CASCADE ON DELETE RESTRICT",
        );
      await pool.query(
        "ALTER TABLE users MODIFY permission_id INT UNSIGNED NOT NULL",
      );
      await pool.query(
        "ALTER TABLE users DROP COLUMN IF EXISTS role,DROP COLUMN IF EXISTS school_id,DROP COLUMN IF EXISTS school_designation",
      );
    })();
  return ready;
}
exports.ensureSchema = ensureSchema;
const select =
  "SELECT id,name,description,overview_access overviewAccess,attendance_access attendanceAccess,special_events_access specialEventsAccess,library_access libraryAccess,maintenance_access maintenanceAccess,users_access usersAccess,people_access peopleAccess,is_active isActive,created_at createdAt FROM permissions";
exports.getAll = async () => {
  await ensureSchema();
  return (await pool.query(`${select} ORDER BY name`))[0];
};
exports.findById = async (id) => {
  await ensureSchema();
  return (await pool.query(`${select} WHERE id=?`, [id]))[0][0];
};
exports.create = async (data) => {
  await ensureSchema();
  return (
    await pool.query(
      "INSERT INTO permissions (name,description,overview_access,attendance_access,special_events_access,library_access,maintenance_access,users_access,people_access,is_active) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [
        data.name,
        data.description || null,
        data.overviewAccess,
        data.attendanceAccess,
        data.specialEventsAccess,
        data.libraryAccess,
        data.maintenanceAccess,
        data.usersAccess,
        data.peopleAccess,
        data.isActive,
      ],
    )
  )[0];
};
exports.update = async (id, data) => {
  await ensureSchema();
  return (
    await pool.query(
      "UPDATE permissions SET name=?,description=?,overview_access=?,attendance_access=?,special_events_access=?,library_access=?,maintenance_access=?,users_access=?,people_access=?,is_active=? WHERE id=?",
      [
        data.name,
        data.description || null,
        data.overviewAccess,
        data.attendanceAccess,
        data.specialEventsAccess,
        data.libraryAccess,
        data.maintenanceAccess,
        data.usersAccess,
        data.peopleAccess,
        data.isActive,
        id,
      ],
    )
  )[0];
};
