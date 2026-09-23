const pool = require("../../../db/db");
const schema = require("../../../db/schema");

let ready;
async function ensureSchema() {
  if (!ready)
    ready = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS sections (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        year_level VARCHAR(40) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sections_year_name (year_level,name),
        INDEX idx_sections_active_year (is_active,year_level,name)
      )`);
      await schema.addColumns("students", [
        ["section_id", "INT UNSIGNED NULL AFTER year_level"],
      ]);
      if (await schema.columnExists("students", "section_name")) {
        await pool.query(
          "INSERT IGNORE INTO sections (name,year_level,is_active) SELECT DISTINCT section_name,year_level,TRUE FROM students WHERE section_name IS NOT NULL AND section_name<>'' AND year_level REGEXP '^Grade ([1-9]|1[0-2])$'",
        );
        await pool.query(
          "UPDATE students s INNER JOIN sections x ON x.year_level=s.year_level AND x.name=s.section_name SET s.section_id=x.id WHERE s.section_id IS NULL",
        );
      }
      await schema.addForeignKey(
        "students",
        "fk_students_section",
        ["section_id"],
        "sections",
        ["id"],
        { onDelete: "RESTRICT" },
      );
    })();
  return ready;
}

exports.ensureSchema = ensureSchema;
exports.getAll = async () => {
  await ensureSchema();
  return (
    await pool.query(
      "SELECT id,name,year_level yearLevel,is_active isActive FROM sections ORDER BY CAST(SUBSTRING_INDEX(year_level,' ',-1) AS UNSIGNED),name",
    )
  )[0];
};
exports.getById = async (id) => {
  await ensureSchema();
  return (
    await pool.query(
      "SELECT id,name,year_level yearLevel,is_active isActive FROM sections WHERE id=? LIMIT 1",
      [id],
    )
  )[0][0];
};
exports.create = async (data) => {
  await ensureSchema();
  return (
    await pool.query(
      "INSERT INTO sections (name,year_level,is_active) VALUES (?,?,?)",
      [data.name, data.yearLevel, data.isActive],
    )
  )[0];
};
exports.update = async (id, data) => {
  await ensureSchema();
  return (
    await pool.query(
      "UPDATE sections SET name=?,year_level=?,is_active=? WHERE id=?",
      [data.name, data.yearLevel, data.isActive, id],
    )
  )[0];
};
exports.studentCount = async (id) => {
  await ensureSchema();
  return Number(
    (
      await pool.query(
        "SELECT COUNT(*) count FROM students WHERE section_id=?",
        [id],
      )
    )[0][0].count,
  );
};
exports.remove = async (id) => {
  await ensureSchema();
  return (await pool.query("DELETE FROM sections WHERE id=?", [id]))[0];
};
