const pool = require("../../../db/db");
const select = `SELECT s.id,s.id_number idNumber,s.full_name name,s.first_name firstName,s.middle_name middleName,s.last_name lastName,s.program_id programId,COALESCE(p.name,TRIM(SUBSTRING_INDEX(s.program_section,'·',1))) programName,s.year_level yearLevel,s.birthday,s.institutional_email institutionalEmail,s.gender,s.is_active isActive,s.contact,'Student' type FROM students s LEFT JOIN programs p ON p.id=s.program_id`;
exports.getAll = async () =>
  (await pool.query(`${select} ORDER BY s.last_name,s.first_name`))[0];
exports.findId = async (idNumber, excludeId = null) => {
  const params = [idNumber];
  let sql = "SELECT id FROM students WHERE id_number=?";
  if (excludeId) {
    sql += " AND id<>?";
    params.push(excludeId);
  }
  const [students] = await pool.query(sql, params),
    [employees] = await pool.query(
      "SELECT id FROM employees WHERE id_number=?",
      [idNumber],
    );
  return students[0] || employees[0];
};
exports.create = async (data) =>
  (
    await pool.query(
      `INSERT INTO students (id_number,full_name,program_section,contact,first_name,middle_name,last_name,program_id,year_level,birthday,institutional_email,gender,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,TRUE)`,
      [
        data.idNumber,
        data.fullName,
        data.programSection,
        data.institutionalEmail,
        data.firstName,
        data.middleName || null,
        data.lastName,
        data.programId,
        data.yearLevel,
        data.birthday,
        data.institutionalEmail,
        data.gender,
      ],
    )
  )[0];
exports.update = async (id, data) =>
  (
    await pool.query(
      `UPDATE students SET id_number=?,full_name=?,program_section=?,contact=?,first_name=?,middle_name=?,last_name=?,program_id=?,year_level=?,birthday=?,institutional_email=?,gender=? WHERE id=?`,
      [
        data.idNumber,
        data.fullName,
        data.programSection,
        data.institutionalEmail,
        data.firstName,
        data.middleName || null,
        data.lastName,
        data.programId,
        data.yearLevel,
        data.birthday,
        data.institutionalEmail,
        data.gender,
        id,
      ],
    )
  )[0];
exports.setStatus = async (id, isActive) =>
  (
    await pool.query("UPDATE students SET is_active=? WHERE id=?", [
      isActive,
      id,
    ])
  )[0];
