const pool = require("../../../db/db");
exports.getAll = async () =>
  (
    await pool.query(
      "SELECT id,id_number idNumber,full_name name,department_role groupName,contact,'Employee' type FROM employees ORDER BY full_name",
    )
  )[0];
exports.findId = async (idNumber) =>
  (
    await pool.query(
      "SELECT id FROM students WHERE id_number=? UNION SELECT id FROM employees WHERE id_number=?",
      [idNumber, idNumber],
    )
  )[0][0];
exports.create = async (data) =>
  (
    await pool.query(
      "INSERT INTO employees (id_number,full_name,department_role,contact) VALUES (?,?,?,?)",
      [data.idNumber, data.name, data.groupName, data.contact || null],
    )
  )[0];
exports.remove = async (id) =>
  (await pool.query("DELETE FROM employees WHERE id=?", [id]))[0];
