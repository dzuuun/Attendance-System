const pool = require("../../../db/db");
const schema = require("../../../db/schema");
const identifiers = require("../person-identifiers");

let ready;
async function ensureSchema() {
  if (!ready)
    ready = (async () => {
      await require("../section/section.model").ensureSchema();
      await pool.query(`CREATE TABLE IF NOT EXISTS alumni (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      student_id INT UNSIGNED NULL UNIQUE,
      id_number VARCHAR(80) NOT NULL UNIQUE,
      contact VARCHAR(150) NULL,
      first_name VARCHAR(80) NOT NULL,
      middle_name VARCHAR(80) NULL,
      last_name VARCHAR(80) NOT NULL,
      program_id INT UNSIGNED NULL,
      graduation_year SMALLINT UNSIGNED NOT NULL,
      birthday DATE NULL,
      institutional_email VARCHAR(150) NULL,
      photo_url VARCHAR(500) NULL,
      gender VARCHAR(30) NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      transferred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_alumni_name (last_name,first_name),
      INDEX idx_alumni_program (program_id),
      INDEX idx_alumni_active_name (is_active,last_name,first_name)
    )`);
      await schema.addColumn("alumni", "card_id", "VARCHAR(128) NULL UNIQUE");
      const [studentIdColumns] = await pool.query(
        "SELECT COLUMN_TYPE columnType,IS_NULLABLE isNullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='alumni' AND COLUMN_NAME='student_id'",
      );
      if (
        studentIdColumns[0]?.columnType !== "int unsigned" ||
        studentIdColumns[0]?.isNullable !== "YES"
      )
        await pool.query(
          "ALTER TABLE alumni MODIFY student_id INT UNSIGNED NULL",
        );
      await pool.query(`CREATE TABLE IF NOT EXISTS alumni_degrees (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        alumni_id INT UNSIGNED NOT NULL,
        program_id INT UNSIGNED NOT NULL,
        graduation_year SMALLINT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_alumni_degree (alumni_id,program_id,graduation_year),
        INDEX idx_alumni_degrees_alumni (alumni_id)
      )`);
      await pool.query(
        "INSERT IGNORE INTO alumni_degrees (alumni_id,program_id,graduation_year) SELECT id,program_id,graduation_year FROM alumni WHERE program_id IS NOT NULL",
      );
      await schema.addForeignKey(
        "alumni",
        "fk_alumni_student",
        ["student_id"],
        "students",
        ["id"],
        { onDelete: "SET NULL" },
      );
      await schema.addForeignKey(
        "alumni",
        "fk_alumni_program",
        ["program_id"],
        "programs",
        ["id"],
      );
      await schema.addForeignKey(
        "alumni_degrees",
        "fk_alumni_degrees_alumni",
        ["alumni_id"],
        "alumni",
        ["id"],
        { onDelete: "CASCADE" },
      );
      await schema.addForeignKey(
        "alumni_degrees",
        "fk_alumni_degrees_program",
        ["program_id"],
        "programs",
        ["id"],
      );
    })();
  return ready;
}

const select = `SELECT a.id,a.student_id studentId,a.id_number idNumber,a.card_id cardId,TRIM(CONCAT_WS(' ',a.first_name,NULLIF(a.middle_name,''),a.last_name)) name,a.first_name firstName,a.middle_name middleName,a.last_name lastName,a.program_id programId,p.code programCode,p.name programName,a.graduation_year graduationYear,a.birthday,a.institutional_email institutionalEmail,a.photo_url photoUrl,a.gender,a.is_active isActive,EXISTS(SELECT 1 FROM students s WHERE s.id=a.student_id AND s.is_active=TRUE) studentIsActive,(SELECT COUNT(*) FROM alumni_degrees ad WHERE ad.alumni_id=a.id) degreeCount,a.transferred_at transferredAt,'Alumnus' type FROM alumni a LEFT JOIN programs p ON p.id=a.program_id`;

const addDegree = (connection, alumniId, programId, graduationYear) =>
  connection.query(
    "INSERT IGNORE INTO alumni_degrees (alumni_id,program_id,graduation_year) VALUES (?,?,?)",
    [alumniId, programId, graduationYear],
  );

exports.ensureSchema = ensureSchema;
exports.getAll = async () => {
  await ensureSchema();
  return (await pool.query(`${select} ORDER BY a.last_name,a.first_name`))[0];
};
exports.getById = async (id) => {
  await ensureSchema();
  return (await pool.query(`${select} WHERE a.id=? LIMIT 1`, [id]))[0][0];
};
exports.findByStudentId = async (studentId) => {
  await ensureSchema();
  return (
    await pool.query(`${select} WHERE a.student_id=? LIMIT 1`, [studentId])
  )[0][0];
};
exports.getStudentIds = async () => {
  await ensureSchema();
  return new Set(
    (await pool.query("SELECT student_id studentId FROM alumni"))[0].map(
      (row) => Number(row.studentId),
    ),
  );
};
exports.setStatus = async (id, isActive) => {
  await ensureSchema();
  return (
    await pool.query("UPDATE alumni SET is_active=? WHERE id=?", [isActive, id])
  )[0];
};
exports.reenroll = async (id, programId, yearLevel, sectionId) => {
  await ensureSchema();
  return (
    await pool.query(
      `UPDATE students s INNER JOIN alumni a ON a.student_id=s.id SET s.program_id=?,s.year_level=?,s.section_id=?,s.is_active=TRUE WHERE a.id=?`,
      [programId, yearLevel, sectionId || null, id],
    )
  )[0];
};
exports.findIdNumber = async (idNumber, excludeId = null) => {
  await ensureSchema();
  const params = [idNumber];
  let sql = "SELECT id FROM alumni WHERE id_number=?";
  if (excludeId) {
    sql += " AND id<>?";
    params.push(excludeId);
  }
  return (await pool.query(`${sql} LIMIT 1`, params))[0][0];
};
exports.employeeUsesIdNumber = async (idNumber) =>
  Boolean(
    (
      await pool.query("SELECT id FROM employees WHERE id_number=? LIMIT 1", [
        idNumber,
      ])
    )[0][0],
  );
exports.create = async (data, { deactivateStudent = false } = {}) => {
  await ensureSchema();
  await identifiers.ensureSchema();
  const connection = await pool.getConnection();
  let identifierLock = false;
  try {
    await identifiers.acquire(connection);
    identifierLock = true;
    await connection.beginTransaction();
    const [students] = await connection.query(
      "SELECT id FROM students WHERE id_number=? LIMIT 1 FOR UPDATE",
      [data.idNumber],
    );
    let studentId = students[0]?.id || null;
    await identifiers.assertAvailable(connection, { type: "alumni", studentId, idNumber: data.idNumber });
    if (!studentId) {
      const [studentResult] = await connection.query(
        `INSERT INTO students (id_number,contact,first_name,middle_name,last_name,program_id,year_level,birthday,institutional_email,photo_url,gender,is_active) VALUES (?,?,?,?,?,?,NULL,?,?,NULL,?,FALSE)`,
        [
          data.idNumber,
          data.institutionalEmail || null,
          data.firstName,
          data.middleName || null,
          data.lastName,
          data.programId,
          data.birthday || null,
          data.institutionalEmail || null,
          ["Male", "Female"].includes(data.gender) ? data.gender : null,
        ],
      );
      studentId = studentResult.insertId;
    }
    const [result] = await connection.query(
      `INSERT INTO alumni (student_id,id_number,contact,first_name,middle_name,last_name,program_id,graduation_year,birthday,institutional_email,gender,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,TRUE)`,
      [
        studentId,
        data.idNumber,
        data.institutionalEmail || null,
        data.firstName,
        data.middleName || null,
        data.lastName,
        data.programId,
        data.graduationYear,
        data.birthday || null,
        data.institutionalEmail || null,
        data.gender || null,
      ],
    );
    await addDegree(
      connection,
      result.insertId,
      data.programId,
      data.graduationYear,
    );
    if (deactivateStudent)
      await connection.query("UPDATE students SET is_active=FALSE WHERE id=?", [
        studentId,
      ]);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    if (identifierLock) await identifiers.release(connection);
    connection.release();
  }
};
exports.update = async (id, data, { deactivateStudent = false } = {}) => {
  await ensureSchema();
  await identifiers.ensureSchema();
  const connection = await pool.getConnection();
  let identifierLock = false;
  try {
    await identifiers.acquire(connection);
    identifierLock = true;
    await connection.beginTransaction();
    const [[existing]] = await connection.query("SELECT student_id studentId FROM alumni WHERE id=? FOR UPDATE", [id]);
    if (!existing) {
      await connection.rollback();
      return { affectedRows: 0 };
    }
    await identifiers.assertAvailable(connection, { type: "alumni", id, studentId: existing.studentId, idNumber: data.idNumber });
    const [result] = await connection.query(
      `UPDATE alumni SET id_number=?,contact=?,first_name=?,middle_name=?,last_name=?,program_id=?,graduation_year=?,birthday=?,institutional_email=?,gender=? WHERE id=?`,
      [
        data.idNumber,
        data.institutionalEmail || null,
        data.firstName,
        data.middleName || null,
        data.lastName,
        data.programId,
        data.graduationYear,
        data.birthday || null,
        data.institutionalEmail || null,
        data.gender || null,
        id,
      ],
    );
    if (result.affectedRows)
      await connection.query(
        `UPDATE students s INNER JOIN alumni a ON a.student_id=s.id SET s.id_number=?,s.contact=?,s.first_name=?,s.middle_name=?,s.last_name=?,s.program_id=?,s.birthday=?,s.institutional_email=?,s.gender=? WHERE a.id=? AND s.is_active=FALSE`,
        [
          data.idNumber,
          data.institutionalEmail || null,
          data.firstName,
          data.middleName || null,
          data.lastName,
          data.programId,
          data.birthday || null,
          data.institutionalEmail || null,
          ["Male", "Female"].includes(data.gender) ? data.gender : null,
          id,
        ],
      );
    if (result.affectedRows) {
      await addDegree(connection, id, data.programId, data.graduationYear);
      if (deactivateStudent)
        await connection.query(
          "UPDATE students s INNER JOIN alumni a ON a.student_id=s.id SET s.is_active=FALSE WHERE a.id=?",
          [id],
        );
    }
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    if (identifierLock) await identifiers.release(connection);
    connection.release();
  }
};
exports.transferStudent = async (studentId, graduationYear) => {
  await ensureSchema();
  await identifiers.ensureSchema();
  const connection = await pool.getConnection();
  let identifierLock = false;
  try {
    await identifiers.acquire(connection);
    identifierLock = true;
    await connection.beginTransaction();
    const [students] = await connection.query(
      "SELECT * FROM students WHERE id=? LIMIT 1 FOR UPDATE",
      [studentId],
    );
    const student = students[0];
    if (!student) {
      await connection.rollback();
      return { status: "missing" };
    }
    const [existing] = await connection.query(
      "SELECT id,student_id studentId FROM alumni WHERE student_id=? OR id_number=? LIMIT 1",
      [student.id, student.id_number],
    );
    if (existing[0]?.studentId && Number(existing[0].studentId) !== Number(student.id))
      throw identifiers.conflictError();
    await identifiers.assertAvailable(connection, {
      type: "alumni", id: existing[0]?.id || 0, studentId: student.id, idNumber: student.id_number,
    });
    if (existing.length) {
      await connection.query(
        `UPDATE alumni SET student_id=?,id_number=?,contact=?,first_name=?,middle_name=?,last_name=?,program_id=?,graduation_year=?,birthday=?,institutional_email=?,photo_url=?,gender=?,is_active=TRUE WHERE id=?`,
        [
          student.id,
          student.id_number,
          student.contact,
          student.first_name,
          student.middle_name,
          student.last_name,
          student.program_id,
          graduationYear,
          student.birthday,
          student.institutional_email,
          student.photo_url,
          student.gender,
          existing[0].id,
        ],
      );
      await connection.query("UPDATE students SET is_active=FALSE WHERE id=?", [
        student.id,
      ]);
      await addDegree(
        connection,
        existing[0].id,
        student.program_id,
        graduationYear,
      );
      await connection.commit();
      return { status: "updated", id: existing[0].id };
    }
    const [result] = await connection.query(
      `INSERT INTO alumni (student_id,id_number,contact,first_name,middle_name,last_name,program_id,graduation_year,birthday,institutional_email,photo_url,gender,is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,TRUE)`,
      [
        student.id,
        student.id_number,
        student.contact,
        student.first_name,
        student.middle_name,
        student.last_name,
        student.program_id,
        graduationYear,
        student.birthday,
        student.institutional_email,
        student.photo_url,
        student.gender,
      ],
    );
    await connection.query("UPDATE students SET is_active=FALSE WHERE id=?", [
      student.id,
    ]);
    await addDegree(
      connection,
      result.insertId,
      student.program_id,
      graduationYear,
    );
    await connection.commit();
    return { status: "created", id: result.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    if (identifierLock) await identifiers.release(connection);
    connection.release();
  }
};
exports.transferStudentsByIdNumbers = async (idNumbers, graduationYear) => {
  await ensureSchema();
  const ids = [
    ...new Set(
      idNumbers
        .map((value) => String(value).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) return { transferred: 0, skipped: 0, movedIdNumbers: [] };
  await identifiers.ensureSchema();
  const connection = await pool.getConnection();
  let identifierLock = false;
  try {
    await identifiers.acquire(connection);
    identifierLock = true;
    await connection.beginTransaction();
    const placeholders = ids.map(() => "?").join(",");
    const [students] = await connection.query(
      `SELECT * FROM students WHERE id_number IN (${placeholders}) AND is_active=TRUE FOR UPDATE`,
      ids,
    );
    if (students.length) {
      const [linked] = await connection.query(
        `SELECT id,student_id studentId FROM alumni WHERE student_id IN (${students.map(() => "?").join(",")})`,
        students.map((student) => student.id),
      );
      const alumniByStudent = new Map(linked.map((item) => [Number(item.studentId), item.id]));
      for (const student of students)
        await identifiers.assertAvailable(connection, {
          type: "alumni", id: alumniByStudent.get(Number(student.id)) || 0,
          studentId: student.id, idNumber: student.id_number,
        });
    }
    for (let offset = 0; offset < students.length; offset += 500) {
      const batch = students.slice(offset, offset + 500);
      const values = [];
      const rows = batch
        .map((student) => {
          values.push(
            student.id,
            student.id_number,
            student.contact,
            student.first_name,
            student.middle_name,
            student.last_name,
            student.program_id,
            graduationYear,
            student.birthday,
            student.institutional_email,
            student.photo_url,
            student.gender,
          );
          return "(?,?,?,?,?,?,?,?,?,?,?,?,TRUE)";
        })
        .join(",");
      await connection.query(
        `INSERT INTO alumni (student_id,id_number,contact,first_name,middle_name,last_name,program_id,graduation_year,birthday,institutional_email,photo_url,gender,is_active)
         VALUES ${rows}
         ON DUPLICATE KEY UPDATE student_id=VALUES(student_id),id_number=VALUES(id_number),contact=VALUES(contact),first_name=VALUES(first_name),middle_name=VALUES(middle_name),last_name=VALUES(last_name),program_id=VALUES(program_id),graduation_year=VALUES(graduation_year),birthday=VALUES(birthday),institutional_email=VALUES(institutional_email),photo_url=VALUES(photo_url),gender=VALUES(gender),is_active=TRUE`,
        values,
      );
    }
    if (students.length) {
      await connection.query(
        `INSERT IGNORE INTO alumni_degrees (alumni_id,program_id,graduation_year)
         SELECT a.id,s.program_id,? FROM alumni a INNER JOIN students s ON s.id=a.student_id
         WHERE s.id IN (${students.map(() => "?").join(",")}) AND s.program_id IS NOT NULL`,
        [graduationYear, ...students.map((student) => student.id)],
      );
      const activeIds = students.map((student) => student.id);
      await connection.query(
        `UPDATE students SET is_active=FALSE WHERE id IN (${activeIds.map(() => "?").join(",")})`,
        activeIds,
      );
    }
    await connection.commit();
    return {
      transferred: students.length,
      skipped: ids.length - students.length,
      movedIdNumbers: students.map((student) => student.id_number),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    if (identifierLock) await identifiers.release(connection);
    connection.release();
  }
};
