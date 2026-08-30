const pool = require("../../../db/db");
const config = {
  employee_department: { table: "employee_departments", parent: null },
  school: { table: "schools", parent: null },
  college: {
    table: "colleges",
    parent: { table: "schools", column: "school_id", label: "schoolName" },
  },
  department: {
    table: "departments",
    parent: { table: "colleges", column: "college_id", label: "collegeName" },
  },
  program: {
    table: "programs",
    parent: {
      table: "departments",
      column: "department_id",
      label: "departmentName",
    },
  },
};
async function ensureEntity(entity) {
  if (entity === "employee_department")
    await pool.query(
      `CREATE TABLE IF NOT EXISTS employee_departments (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,name VARCHAR(180) NOT NULL UNIQUE,code VARCHAR(40) NOT NULL UNIQUE,is_active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX idx_employee_departments_active_name (is_active,name))`,
    );
}
exports.getAll = async (entity) => {
  await ensureEntity(entity);
  const item = config[entity];
  if (!item.parent)
    return (
      await pool.query(
        `SELECT id,name,code,is_active isActive FROM ${item.table} ORDER BY name`,
      )
    )[0];
  const [rows] = await pool.query(
    `SELECT child.id,child.name,child.code,child.is_active isActive,child.${item.parent.column} parentId,parent.name ${item.parent.label} FROM ${item.table} child INNER JOIN ${item.parent.table} parent ON parent.id=child.${item.parent.column} ORDER BY parent.name,child.name`,
  );
  return rows;
};
exports.create = async (entity, data) => {
  await ensureEntity(entity);
  const item = config[entity];
  if (!item.parent)
    return (
      await pool.query(
        `INSERT INTO ${item.table} (name,code,is_active) VALUES (?,?,?)`,
        [data.name, data.code, data.isActive],
      )
    )[0];
  return (
    await pool.query(
      `INSERT INTO ${item.table} (name,code,${item.parent.column},is_active) VALUES (?,?,?,?)`,
      [data.name, data.code, data.parentId, data.isActive],
    )
  )[0];
};
exports.update = async (entity, id, data) => {
  await ensureEntity(entity);
  const item = config[entity];
  if (!item.parent)
    return (
      await pool.query(
        `UPDATE ${item.table} SET name=?,code=?,is_active=? WHERE id=?`,
        [data.name, data.code, data.isActive, id],
      )
    )[0];
  return (
    await pool.query(
      `UPDATE ${item.table} SET name=?,code=?,${item.parent.column}=?,is_active=? WHERE id=?`,
      [data.name, data.code, data.parentId, data.isActive, id],
    )
  )[0];
};
exports.remove = async (entity, id) => {
  await ensureEntity(entity);
  return (
    await pool.query(`DELETE FROM ${config[entity].table} WHERE id=?`, [id])
  )[0];
};
exports.config = config;
