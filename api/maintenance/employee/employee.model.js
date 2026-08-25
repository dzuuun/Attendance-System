const pool = require("../../../db/db");
let schemaReady;
const ensureSchema = () =>
  (schemaReady ||= (async () => {
    await pool.query(
      "ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER contact,ADD COLUMN IF NOT EXISTS first_name VARCHAR(80) NULL,ADD COLUMN IF NOT EXISTS middle_name VARCHAR(80) NULL AFTER first_name,ADD COLUMN IF NOT EXISTS last_name VARCHAR(80) NULL AFTER middle_name",
    );
    const [legacy] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='full_name'",
    );
    if (legacy.length) {
      await pool.query(
        "UPDATE employees SET first_name=COALESCE(first_name,SUBSTRING_INDEX(full_name,' ',1)),last_name=COALESCE(last_name,CASE WHEN full_name LIKE '% %' THEN SUBSTRING_INDEX(full_name,' ',-1) ELSE full_name END)",
      );
      await pool.query("ALTER TABLE employees DROP COLUMN full_name");
    }
  })());
exports.getAll = async () => {
  await ensureSchema();
  return (
    await pool.query(
      "SELECT id,id_number idNumber,TRIM(CONCAT_WS(' ',first_name,NULLIF(middle_name,''),last_name)) name,first_name firstName,middle_name middleName,last_name lastName,department_role groupName,contact,is_active isActive,'Employee' type FROM employees ORDER BY last_name,first_name",
    )
  )[0];
};
exports.findId = async (idNumber, exceptId = null) =>
  (
    await pool.query(
      "SELECT id FROM students WHERE id_number=? UNION SELECT id FROM employees WHERE id_number=? AND (? IS NULL OR id<>?)",
      [idNumber, idNumber, exceptId, exceptId],
    )
  )[0][0];
exports.create = async (data) => {
  await ensureSchema();
  return (
    await pool.query(
      "INSERT INTO employees (id_number,first_name,middle_name,last_name,department_role,contact,is_active) VALUES (?,?,?,?,?,?,?)",
      [
        data.idNumber,
        data.firstName,
        data.middleName || null,
        data.lastName,
        data.groupName,
        data.contact || null,
        data.isActive !== false,
      ],
    )
  )[0];
};
exports.update = async (id, data) => {
  await ensureSchema();
  return (
    await pool.query(
      "UPDATE employees SET id_number=?,first_name=?,middle_name=?,last_name=?,department_role=?,contact=?,is_active=? WHERE id=?",
      [
        data.idNumber,
        data.firstName,
        data.middleName || null,
        data.lastName,
        data.groupName,
        data.contact || null,
        data.isActive,
        id,
      ],
    )
  )[0];
};
exports.remove = async (id) =>
  (await pool.query("DELETE FROM employees WHERE id=?", [id]))[0];
