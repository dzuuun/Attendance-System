const pool = require("../../../db/db");
let schemaReady;
const ensureSchema = () =>
  (schemaReady ||= (async () => {
    await pool.query(
      "ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER contact,ADD COLUMN IF NOT EXISTS first_name VARCHAR(80) NULL,ADD COLUMN IF NOT EXISTS middle_name VARCHAR(80) NULL AFTER first_name,ADD COLUMN IF NOT EXISTS last_name VARCHAR(80) NULL AFTER middle_name,ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500) NULL AFTER contact",
    );
    await pool.query(`CREATE TABLE IF NOT EXISTS employee_departments (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,name VARCHAR(180) NOT NULL UNIQUE,code VARCHAR(40) NOT NULL UNIQUE,is_active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX idx_employee_departments_active_name (is_active,name))`);
    const [legacyDepartmentRole] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='department_role'");
    if (legacyDepartmentRole.length)
      await pool.query(`INSERT IGNORE INTO employee_departments (name,code) SELECT DISTINCT TRIM(SUBSTRING_INDEX(department_role,'·',1)),CONCAT('LEG-',LEFT(SHA1(TRIM(SUBSTRING_INDEX(department_role,'·',1))),12)) FROM employees WHERE department_role IS NOT NULL AND TRIM(SUBSTRING_INDEX(department_role,'·',1))<>''`);
    await pool.query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS emp_dept_id INT UNSIGNED NULL AFTER last_name");
    const [oldDepartmentId] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='employee_department_id'");
    if (oldDepartmentId.length)
      await pool.query("UPDATE employees SET emp_dept_id=COALESCE(emp_dept_id,employee_department_id)");
    if (legacyDepartmentRole.length)
      await pool.query(`UPDATE employees e INNER JOIN employee_departments d ON d.name=TRIM(SUBSTRING_INDEX(e.department_role,'·',1)) SET e.emp_dept_id=COALESCE(e.emp_dept_id,d.id) WHERE e.emp_dept_id IS NULL`);
    const [departmentIndexes] = await pool.query("SELECT COUNT(*) count FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND INDEX_NAME='idx_employees_department_name'");
    if (departmentIndexes[0].count && oldDepartmentId.length)
      await pool.query("ALTER TABLE employees DROP INDEX idx_employees_department_name");
    if (oldDepartmentId.length) await pool.query("ALTER TABLE employees DROP COLUMN employee_department_id");
    if (legacyDepartmentRole.length) await pool.query("ALTER TABLE employees DROP COLUMN department_role");
    await pool.query("UPDATE employees e LEFT JOIN employee_departments d ON d.id=e.emp_dept_id SET e.emp_dept_id=NULL WHERE e.emp_dept_id IS NOT NULL AND d.id IS NULL");
    if (!departmentIndexes[0].count || oldDepartmentId.length)
      await pool.query("ALTER TABLE employees ADD INDEX idx_employees_department_name (emp_dept_id,last_name,first_name)");
    const [departmentForeignKey] = await pool.query("SELECT COUNT(*) count FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND CONSTRAINT_NAME='fk_employee_department' AND CONSTRAINT_TYPE='FOREIGN KEY'");
    if (!departmentForeignKey[0].count)
      await pool.query("ALTER TABLE employees ADD CONSTRAINT fk_employee_department FOREIGN KEY (emp_dept_id) REFERENCES employee_departments(id) ON UPDATE CASCADE ON DELETE RESTRICT");
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
exports.ensureSchema = ensureSchema;
exports.getAll = async () => {
  await ensureSchema();
  return (
    await pool.query(
      "SELECT e.id,e.id_number idNumber,TRIM(CONCAT_WS(' ',e.first_name,NULLIF(e.middle_name,''),e.last_name)) name,e.first_name firstName,e.middle_name middleName,e.last_name lastName,e.emp_dept_id departmentId,d.name departmentName,d.name groupName,e.contact,e.photo_url photoUrl,e.is_active isActive,'Employee' type FROM employees e LEFT JOIN employee_departments d ON d.id=e.emp_dept_id ORDER BY e.last_name,e.first_name",
    )
  )[0];
};
exports.getById = async (id) => {
  await ensureSchema();
  return (
    await pool.query(
      "SELECT id,id_number idNumber,TRIM(CONCAT_WS(' ',first_name,NULLIF(middle_name,''),last_name)) name,photo_url photoUrl,is_active isActive FROM employees WHERE id=? LIMIT 1",
      [id],
    )
  )[0][0];
};
exports.updatePhoto = async (id, photoUrl) => {
  await ensureSchema();
  return (await pool.query("UPDATE employees SET photo_url=? WHERE id=?", [photoUrl, id]))[0];
};
exports.findId = async (idNumber, exceptId = null) =>
  (
    await pool.query(
      "SELECT id FROM students WHERE id_number=? UNION SELECT id FROM employees WHERE id_number=? AND (? IS NULL OR id<>?)",
      [idNumber, idNumber, exceptId, exceptId],
    )
  )[0][0];
exports.getDepartment = async (id) => {
  await ensureSchema();
  return (await pool.query("SELECT id,name,code,is_active isActive FROM employee_departments WHERE id=? LIMIT 1", [id]))[0][0];
};
exports.create = async (data) => {
  await ensureSchema();
  const [departments] = await pool.query("SELECT id,name FROM employee_departments WHERE id=? AND is_active=TRUE LIMIT 1", [data.departmentId]);
  if (!departments[0]) return { affectedRows: 0, insertId: 0 };
  return (
    await pool.query(
      "INSERT INTO employees (id_number,first_name,middle_name,last_name,emp_dept_id,contact,is_active) VALUES (?,?,?,?,?,?,?)",
      [
        data.idNumber,
        data.firstName,
        data.middleName || null,
        data.lastName,
        data.departmentId,
        data.contact || null,
        data.isActive !== false,
      ],
    )
  )[0];
};
exports.update = async (id, data) => {
  await ensureSchema();
  const [departments] = await pool.query("SELECT id,name FROM employee_departments WHERE id=? LIMIT 1", [data.departmentId]);
  if (!departments[0]) return { affectedRows: 0 };
  return (
    await pool.query(
      "UPDATE employees SET id_number=?,first_name=?,middle_name=?,last_name=?,emp_dept_id=?,contact=?,is_active=? WHERE id=?",
      [
        data.idNumber,
        data.firstName,
        data.middleName || null,
        data.lastName,
        data.departmentId,
        data.contact || null,
        data.isActive,
        id,
      ],
    )
  )[0];
};
exports.remove = async (id) =>
  (await pool.query("DELETE FROM employees WHERE id=?", [id]))[0];
