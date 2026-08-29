const pool = require("../../../db/db");
let schemaReady;
async function ensureSchema() {
  if (!schemaReady)
    schemaReady = (async () => {
      await pool.query(
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS first_name VARCHAR(80) NULL,ADD COLUMN IF NOT EXISTS middle_name VARCHAR(80) NULL AFTER first_name,ADD COLUMN IF NOT EXISTS last_name VARCHAR(80) NULL AFTER middle_name,ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500) NULL AFTER institutional_email",
      );
      const [legacy] = await pool.query(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='full_name'",
      );
      if (legacy.length) {
        await pool.query(
          "UPDATE students SET first_name=COALESCE(first_name,SUBSTRING_INDEX(full_name,' ',1)),last_name=COALESCE(last_name,CASE WHEN full_name LIKE '% %' THEN SUBSTRING_INDEX(full_name,' ',-1) ELSE full_name END)",
        );
        await pool.query("ALTER TABLE students DROP COLUMN full_name");
      }
      const [legacyProgramSection] = await pool.query(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='program_section'",
      );
      if (legacyProgramSection.length)
        await pool.query("ALTER TABLE students DROP COLUMN program_section");
      const [indexes] = await pool.query(
        "SELECT DISTINCT INDEX_NAME indexName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students'",
      );
      const existingIndexes = new Set(indexes.map((index) => index.indexName));
      const requiredIndexes = [
        [
          "idx_students_name",
          "ALTER TABLE students ADD INDEX idx_students_name (last_name,first_name)",
        ],
        [
          "idx_students_program",
          "ALTER TABLE students ADD INDEX idx_students_program (program_id)",
        ],
        [
          "idx_students_active_name",
          "ALTER TABLE students ADD INDEX idx_students_active_name (is_active,last_name,first_name)",
        ],
      ];
      for (const [name, sql] of requiredIndexes)
        if (!existingIndexes.has(name)) await pool.query(sql);
    })();
  return schemaReady;
}
const select = `SELECT s.id,s.id_number idNumber,TRIM(CONCAT_WS(' ',s.first_name,NULLIF(s.middle_name,''),s.last_name)) name,s.first_name firstName,s.middle_name middleName,s.last_name lastName,s.program_id programId,p.code programCode,p.name programName,s.year_level yearLevel,s.birthday,s.institutional_email institutionalEmail,s.photo_url photoUrl,s.gender,s.is_active isActive,s.contact,'Student' type FROM students s LEFT JOIN programs p ON p.id=s.program_id`;
exports.getAll = async () => {
  await ensureSchema();
  return (await pool.query(`${select} ORDER BY s.last_name,s.first_name`))[0];
};
exports.getById = async (id) => {
  await ensureSchema();
  return (await pool.query(`${select} WHERE s.id=? LIMIT 1`, [id]))[0][0];
};
exports.updatePhoto = async (id, photoUrl) => {
  await ensureSchema();
  return (await pool.query("UPDATE students SET photo_url=? WHERE id=?", [photoUrl, id]))[0];
};
exports.findId = async (idNumber, excludeId = null) => {
  await ensureSchema();
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
exports.create = async (data) => {
  await ensureSchema();
  return (
    await pool.query(
      `INSERT INTO students (id_number,contact,first_name,middle_name,last_name,program_id,year_level,birthday,institutional_email,gender,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,TRUE)`,
      [
        data.idNumber,
        data.institutionalEmail || null,
        data.firstName,
        data.middleName || null,
        data.lastName,
        data.programId,
        data.yearLevel,
        data.birthday,
        data.institutionalEmail || null,
        data.gender,
      ],
    )
  )[0];
};
exports.update = async (id, data) => {
  await ensureSchema();
  return (
    await pool.query(
      `UPDATE students SET id_number=?,contact=?,first_name=?,middle_name=?,last_name=?,program_id=?,year_level=?,birthday=?,institutional_email=?,gender=? WHERE id=?`,
      [
        data.idNumber,
        data.institutionalEmail || null,
        data.firstName,
        data.middleName || null,
        data.lastName,
        data.programId,
        data.yearLevel,
        data.birthday,
        data.institutionalEmail || null,
        data.gender,
        id,
      ],
    )
  )[0];
};
exports.setStatus = async (id, isActive) => {
  await ensureSchema();
  return (
    await pool.query("UPDATE students SET is_active=? WHERE id=?", [
      isActive,
      id,
    ])
  )[0];
};
exports.deactivateMissing = async (idNumbers) => {
  await ensureSchema();
  const placeholders = idNumbers.map(() => "?").join(",");
  return (
    await pool.query(
      `UPDATE students SET is_active=FALSE WHERE is_active=TRUE AND id_number NOT IN (${placeholders})`,
      idNumbers,
    )
  )[0];
};
