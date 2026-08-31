const pool = require("../../../db/db");
const schema = require("../../../db/schema");
const permissionModel = require("../permission/permission.model");
let schemaReady;
async function ensureSchema() {
  if (!schemaReady)
    schemaReady = (async () => {
      await permissionModel.ensureSchema();
      await schema.addColumns("users", [
        ["first_name", "VARCHAR(80) NULL"],
        ["middle_name", "VARCHAR(80) NULL AFTER first_name"],
        ["last_name", "VARCHAR(80) NULL AFTER middle_name"],
        ["institutional_email", "VARCHAR(190) NULL AFTER username"],
      ]);
      const [emailIndexes] = await pool.query(
        "SELECT COUNT(*) count FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='users' AND index_name='uq_users_institutional_email'",
      );
      if (!emailIndexes[0].count)
        await pool.query(
          "ALTER TABLE users ADD UNIQUE KEY uq_users_institutional_email (institutional_email)",
        );
      const [legacy] = await pool.query(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='full_name'",
      );
      if (legacy.length) {
        await pool.query(
          `UPDATE users SET first_name=COALESCE(first_name,SUBSTRING_INDEX(full_name,' ',1)),last_name=COALESCE(last_name,CASE WHEN full_name LIKE '% %' THEN SUBSTRING_INDEX(full_name,' ',-1) ELSE full_name END)`,
        );
        await pool.query("ALTER TABLE users DROP COLUMN full_name");
      }
    })();
  return schemaReady;
}
exports.getAll = async () => {
  await ensureSchema();
  return (
    await pool.query(
      "SELECT u.id,TRIM(CONCAT_WS(' ',u.first_name,NULLIF(u.middle_name,''),u.last_name)) fullName,u.first_name firstName,u.middle_name middleName,u.last_name lastName,u.username,u.institutional_email institutionalEmail,u.permission_id permissionId,p.name role,u.is_active isActive,u.created_at createdAt FROM users u INNER JOIN permissions p ON p.id=u.permission_id ORDER BY u.last_name,u.first_name",
    )
  )[0];
};
exports.create = async (data) => {
  await ensureSchema();
  return (
    await pool.query(
      "INSERT INTO users (first_name,middle_name,last_name,username,institutional_email,password_hash,permission_id,is_active) VALUES (?,?,?,?,?,?,?,?)",
      [
        data.firstName,
        data.middleName || null,
        data.lastName,
        data.username,
        data.institutionalEmail,
        data.passwordHash,
        data.permissionId,
        data.isActive,
      ],
    )
  )[0];
};
exports.update = async (id, data) => {
  await ensureSchema();
  const fields = [
      "first_name=?",
      "middle_name=?",
      "last_name=?",
      "username=?",
      "institutional_email=?",
      "permission_id=?",
      "is_active=?",
    ],
    values = [
      data.firstName,
      data.middleName || null,
      data.lastName,
      data.username,
      data.institutionalEmail,
      data.permissionId,
      data.isActive,
    ];
  if (data.passwordHash) {
    fields.push("password_hash=?");
    values.push(data.passwordHash);
  }
  values.push(id);
  return (
    await pool.query(`UPDATE users SET ${fields.join(",")} WHERE id=?`, values)
  )[0];
};
exports.setStatus = async (id, isActive) =>
  pool.query("UPDATE users SET is_active=? WHERE id=?", [isActive, id]);
exports.ensureSchema = ensureSchema;
