const pool = require("../../../db/db");
const schema = require("../../../db/schema");
const MAINTENANCE_MODULES = [
  "students",
  "alumni",
  "employees",
  "schools",
  "colleges",
  "departments",
  "employeeDepartments",
  "programs",
  "sections",
  "gates",
  "kiosks",
  "academicPeriods",
  "settings",
];
const normalizeMaintenanceModules = (value, defaultAll = false) => {
  let modules = value;
  if (Buffer.isBuffer(modules)) modules = modules.toString("utf8");
  if (typeof modules === "string") {
    try {
      modules = JSON.parse(modules);
    } catch (_error) {
      modules = [];
    }
  }
  if (!Array.isArray(modules)) modules = defaultAll ? MAINTENANCE_MODULES : [];
  return [
    ...new Set(
      modules.filter((module) => MAINTENANCE_MODULES.includes(module)),
    ),
  ];
};
const hydrate = (row) =>
  row && {
    ...row,
    maintenanceModules: normalizeMaintenanceModules(
      row.maintenanceModules,
      Boolean(row.maintenanceAccess),
    ),
  };
let ready;
async function ensureSchema() {
  if (!ready)
    ready = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS permissions (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,name VARCHAR(80) NOT NULL UNIQUE,description VARCHAR(255),overview_access BOOLEAN NOT NULL DEFAULT FALSE,attendance_access BOOLEAN NOT NULL DEFAULT FALSE,special_events_access BOOLEAN NOT NULL DEFAULT FALSE,library_access BOOLEAN NOT NULL DEFAULT FALSE,maintenance_access BOOLEAN NOT NULL DEFAULT FALSE,maintenance_modules TEXT NULL,users_access BOOLEAN NOT NULL DEFAULT FALSE,is_active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      );
      await schema.addColumns("permissions", [
        ["overview_access", "BOOLEAN NOT NULL DEFAULT FALSE AFTER description"],
        [
          "attendance_access",
          "BOOLEAN NOT NULL DEFAULT FALSE AFTER overview_access",
        ],
        [
          "special_events_access",
          "BOOLEAN NOT NULL DEFAULT FALSE AFTER attendance_access",
        ],
        [
          "library_access",
          "BOOLEAN NOT NULL DEFAULT FALSE AFTER special_events_access",
        ],
        [
          "maintenance_access",
          "BOOLEAN NOT NULL DEFAULT FALSE AFTER library_access",
        ],
        ["maintenance_modules", "TEXT NULL AFTER maintenance_access"],
        [
          "users_access",
          "BOOLEAN NOT NULL DEFAULT FALSE AFTER maintenance_modules",
        ],
      ]);
      await schema.dropColumn("permissions", "people_access");
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
        "UPDATE permissions SET maintenance_modules=? WHERE maintenance_access=TRUE AND (maintenance_modules IS NULL OR maintenance_modules='')",
        [JSON.stringify(MAINTENANCE_MODULES)],
      );
      await pool.query(
        "UPDATE permissions SET maintenance_modules='[]' WHERE maintenance_access=FALSE AND maintenance_modules IS NULL",
      );
      await schema.addColumn("users", "permission_id", "INT UNSIGNED NULL");
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
      await schema.dropColumns("users", [
        "role",
        "school_id",
        "school_designation",
      ]);
    })();
  return ready;
}
exports.ensureSchema = ensureSchema;
exports.MAINTENANCE_MODULES = MAINTENANCE_MODULES;
exports.normalizeMaintenanceModules = normalizeMaintenanceModules;
const select =
  "SELECT id,name,description,overview_access overviewAccess,attendance_access attendanceAccess,special_events_access specialEventsAccess,library_access libraryAccess,maintenance_access maintenanceAccess,maintenance_modules maintenanceModules,users_access usersAccess,is_active isActive,created_at createdAt FROM permissions";
exports.getAll = async () => {
  await ensureSchema();
  return (await pool.query(`${select} ORDER BY description,name`))[0].map(
    hydrate,
  );
};
exports.findById = async (id) => {
  await ensureSchema();
  return hydrate((await pool.query(`${select} WHERE id=?`, [id]))[0][0]);
};
exports.create = async (data) => {
  await ensureSchema();
  return (
    await pool.query(
      "INSERT INTO permissions (name,description,overview_access,attendance_access,special_events_access,library_access,maintenance_access,maintenance_modules,users_access,is_active) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [
        data.name,
        data.description || null,
        data.overviewAccess,
        data.attendanceAccess,
        data.specialEventsAccess,
        data.libraryAccess,
        data.maintenanceAccess,
        JSON.stringify(data.maintenanceModules),
        data.usersAccess,
        data.isActive,
      ],
    )
  )[0];
};
exports.update = async (id, data) => {
  await ensureSchema();
  return (
    await pool.query(
      "UPDATE permissions SET name=?,description=?,overview_access=?,attendance_access=?,special_events_access=?,library_access=?,maintenance_access=?,maintenance_modules=?,users_access=?,is_active=? WHERE id=?",
      [
        data.name,
        data.description || null,
        data.overviewAccess,
        data.attendanceAccess,
        data.specialEventsAccess,
        data.libraryAccess,
        data.maintenanceAccess,
        JSON.stringify(data.maintenanceModules),
        data.usersAccess,
        data.isActive,
        id,
      ],
    )
  )[0];
};
