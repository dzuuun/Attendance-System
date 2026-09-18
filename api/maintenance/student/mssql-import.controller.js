const sql = require("mssql");
const pool = require("../../../db/db");
const model = require("./student.model");

const YEAR_LEVELS = new Set([
  ...Array.from({ length: 12 }, (_, index) => `Grade ${index + 1}`),
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "5th Year",
]);
const REQUIRED_COLUMNS = [
  "SchoolID",
  "LastName",
  "FirstName",
  "MiddleName",
  "BirthDate",
  "CourseCode",
  "YearLevel",
  "Gender",
];

const clean = (value) => String(value ?? "").trim();
const dateValue = (value) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : clean(value).slice(0, 10);
function normalizeYearLevel(value) {
  const input = clean(value).replace(/\s+/g, " ");
  const existing = [...YEAR_LEVELS].find(
    (level) => level.toLowerCase() === input.toLowerCase(),
  );
  if (existing) return existing;
  const collegeYear = input.match(/^(\d)(?:st|nd|rd|th)?(?:\s*year)?$/i);
  if (collegeYear && Number(collegeYear[1]) >= 1 && Number(collegeYear[1]) <= 5)
    return ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"][
      Number(collegeYear[1]) - 1
    ];
  const grade = input.match(/^grade\s*(\d{1,2})$/i);
  if (grade && Number(grade[1]) >= 1 && Number(grade[1]) <= 12)
    return `Grade ${Number(grade[1])}`;
  return input;
}

function period(source) {
  const schoolYear = clean(source?.schoolYear);
  const semester = Number(source?.semester);
  if (!/^\d{4}-\d{4}$/.test(schoolYear) || ![1, 2, 3].includes(semester)) {
    const error = new Error(
      "Choose a school year in YYYY-YYYY format and a valid semester.",
    );
    error.status = 400;
    throw error;
  }
  return { schoolYear, semester };
}

function viewName() {
  const parts = clean(
    process.env.MSSQL_STUDENT_VIEW || "dbo.vw_TapTrackStudents",
  ).split(".");
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part))
  ) {
    const error = new Error(
      "Set MSSQL_STUDENT_VIEW to a trusted two-part view name, for example dbo.vw_TapTrackStudents.",
    );
    error.status = 500;
    throw error;
  }
  return parts.map((part) => `[${part}]`).join(".");
}

async function readSource(sourcePeriod) {
  const settings = {
    server: clean(process.env.MSSQL_SERVER),
    database: clean(process.env.MSSQL_DATABASE),
    user: clean(process.env.MSSQL_USER),
    password: clean(process.env.MSSQL_PASSWORD),
  };
  if (Object.values(settings).some((value) => !value)) {
    const error = new Error(
      "Configure MSSQL_SERVER, MSSQL_DATABASE, MSSQL_USER, and MSSQL_PASSWORD before importing students.",
    );
    error.status = 503;
    throw error;
  }
  const connection = await new sql.ConnectionPool({
    ...settings,
    port: Number(process.env.MSSQL_PORT || 1433),
    options: {
      encrypt: process.env.MSSQL_ENCRYPT !== "false",
      trustServerCertificate:
        process.env.MSSQL_TRUST_SERVER_CERTIFICATE === "true",
    },
    connectionTimeout: 15000,
    requestTimeout: 60000,
  }).connect();
  try {
    const result = await connection
      .request()
      .input("schoolYear", sql.VarChar(20), sourcePeriod.schoolYear)
      .input("semester", sql.Int, sourcePeriod.semester)
      .query(`SELECT ${REQUIRED_COLUMNS.map((column) => `[${column}]`).join(", ")}, [InstitutionalEmail]
        FROM ${viewName()} WHERE [SchoolYear]=@schoolYear AND [Semester]=@semester
        ORDER BY [LastName], [FirstName], [MiddleName], [SchoolID]`);
    return result.recordset.map((row) => ({
      idNumber: clean(row.SchoolID).toUpperCase(),
      firstName: clean(row.FirstName),
      middleName: clean(row.MiddleName),
      lastName: clean(row.LastName),
      programCode: clean(row.CourseCode).toUpperCase(),
      yearLevel: normalizeYearLevel(row.YearLevel),
      birthday: dateValue(row.BirthDate),
      gender: clean(row.Gender),
      institutionalEmail: clean(row.InstitutionalEmail).toLowerCase(),
    }));
  } finally {
    await connection.close();
  }
}

async function review(sourcePeriod) {
  const [rows, programs, students, employeeRows] = await Promise.all([
    readSource(sourcePeriod),
    require("../academic/academic.model").getAll("program"),
    model.getAll(),
    pool
      .query("SELECT id_number idNumber FROM employees")
      .then(([rows]) => rows),
  ]);
  const programByCode = new Map(
    programs
      .filter((item) => item.isActive)
      .map((item) => [clean(item.code).toUpperCase(), item]),
  );
  const studentById = new Map(
    students.map((item) => [clean(item.idNumber).toUpperCase(), item]),
  );
  const employeeIds = new Set(
    employeeRows.map((item) => clean(item.idNumber).toUpperCase()),
  );
  const seen = new Set();
  const items = [],
    errors = [];
  rows.forEach((row, index) => {
    const messages = [];
    if (
      !row.idNumber ||
      !row.firstName ||
      !row.lastName ||
      !row.birthday ||
      !row.yearLevel ||
      !row.gender
    )
      messages.push("Required student data is missing");
    if (seen.has(row.idNumber))
      messages.push("Duplicate SchoolID in the SQL Server source");
    if (employeeIds.has(row.idNumber))
      messages.push("SchoolID is already assigned to an employee");
    seen.add(row.idNumber);
    const program = programByCode.get(row.programCode);
    if (!program)
      messages.push("CourseCode does not match an active TapTrack program");
    if (!YEAR_LEVELS.has(row.yearLevel)) messages.push("YearLevel is invalid");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(row.birthday) ||
      Number.isNaN(Date.parse(row.birthday))
    )
      messages.push("BirthDate is invalid");
    if (!["Male", "Female"].includes(row.gender))
      messages.push("Gender is invalid");
    if (
      row.institutionalEmail &&
      !/^\S+@\S+\.\S+$/.test(row.institutionalEmail)
    )
      messages.push("InstitutionalEmail is invalid");
    const item = {
      ...row,
      row: index + 1,
      programId: program?.id,
      programName: program?.name,
      existing: studentById.get(row.idNumber),
      messages,
    };
    (messages.length ? errors : items).push(item);
  });
  return {
    rows,
    items,
    errors,
    sourceIds: [...new Set(rows.map((row) => row.idNumber).filter(Boolean))],
  };
}

function preview(result, offset = 0) {
  const records = (items, kind) =>
    items.map((item) => ({
      kind,
      row: item.row,
      idNumber: item.idNumber,
      name: [item.lastName, item.firstName, item.middleName]
        .filter(Boolean)
        .join(", "),
      programCode: item.programCode,
      message:
        item.messages?.join("; ") ||
        (kind === "new"
          ? "Student will be created."
          : "Student record will be updated."),
    }));
  const created = result.items.filter((item) => !item.existing),
    updated = result.items.filter((item) => item.existing);
  const limit = 100;
  const page = (items) => ({
    records: items.slice(offset, offset + limit),
    recordTotal: items.length,
    nextOffset: Math.min(offset + limit, items.length),
    hasMore: offset + limit < items.length,
  });
  const groups = {
    new: page(records(created, "new")),
    update: page(records(updated, "update")),
    error: page(records(result.errors, "error")),
  };
  const allRecords = [
    ...records(created, "new"),
    ...records(updated, "update"),
    ...records(result.errors, "error"),
  ];
  return {
    total: result.rows.length,
    new: created.length,
    update: updated.length,
    invalid: result.errors.length,
    groups,
    // Retained for compatibility with open browser tabs while the grouped UI loads.
    records: allRecords.slice(offset, offset + limit),
    recordTotal: allRecords.length,
    nextOffset: Math.min(offset + limit, allRecords.length),
    hasMore: offset + limit < allRecords.length,
  };
}

async function deactivationCount(sourceIds, connection = pool) {
  const [rows] = await connection.query(
    "SELECT id_number idNumber FROM students WHERE is_active=TRUE",
  );
  const ids = new Set(sourceIds);
  return rows.filter((row) => !ids.has(clean(row.idNumber).toUpperCase()))
    .length;
}

exports.preview = async (req, res) => {
  const result = await review(period(req.query));
  const offset = Number(req.query.offset || 0);
  if (!Number.isInteger(offset) || offset < 0) {
    const error = new Error(
      "Preview offset must be a non-negative whole number.",
    );
    error.status = 400;
    throw error;
  }
  res.json({
    period: period(req.query),
    deactivate: await deactivationCount(result.sourceIds),
    ...preview(result, offset),
  });
};

exports.import = async (req, res) => {
  const sourcePeriod = period(req.body);
  const result = await review(sourcePeriod);
  if (!result.items.length)
    return res.status(400).json({
      message: "No valid student rows are available from the SQL Server view.",
      ...preview(result),
    });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const pendingDeactivations = await deactivationCount(
      result.sourceIds,
      connection,
    );
    let inserted = 0,
      updated = 0;
    for (const item of result.items) {
      const values = [
        item.idNumber,
        item.institutionalEmail || null,
        item.firstName,
        item.middleName || null,
        item.lastName,
        item.programId,
        item.yearLevel,
        item.birthday,
        item.institutionalEmail || null,
        item.gender,
      ];
      if (item.existing) {
        await connection.query(
          "UPDATE students SET contact=?,first_name=?,middle_name=?,last_name=?,program_id=?,year_level=?,birthday=?,institutional_email=?,gender=?,is_active=TRUE WHERE id=?",
          [...values.slice(1), item.existing.id],
        );
        updated++;
      } else {
        await connection.query(
          "INSERT INTO students (id_number,contact,first_name,middle_name,last_name,program_id,year_level,birthday,institutional_email,gender,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,TRUE)",
          values,
        );
        inserted++;
      }
    }
    let deactivated = 0;
    if (req.body.confirmDeactivation === true && pendingDeactivations) {
      const placeholders = result.sourceIds.map(() => "?").join(",");
      const [status] = await connection.query(
        `UPDATE students SET is_active=FALSE WHERE is_active=TRUE AND id_number NOT IN (${placeholders})`,
        result.sourceIds,
      );
      deactivated = status.affectedRows;
    }
    await connection.commit();
    req.activityAction = "MSSQL_IMPORTED";
    const semesterLabel = {
      1: "First Semester",
      2: "Second Semester",
      3: "Summer",
    }[sourcePeriod.semester];
    req.activityDescription = `Imported ${inserted + updated} students from SQL Server for ${sourcePeriod.schoolYear}, ${semesterLabel}: ${inserted} added, ${updated} updated, ${deactivated} deactivated.`;
    res.json({
      message: `${inserted + updated} students imported from SQL Server.${deactivated ? ` ${deactivated} students not enrolled in the selected term were deactivated.` : " No other students were deactivated."}`,
      period: sourcePeriod,
      inserted,
      updated,
      deactivated,
      invalid: result.errors.length,
      errors: result.errors.slice(0, 50),
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
