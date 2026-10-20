const sql = require("mssql");
const pool = require("../../../db/db");
const model = require("./student.model");
const profilePhotos = require("../profile-photo");
const academicPeriods = require("../academic_period/academic_period.model");

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

function sourcePhoto(value) {
  if (value === null || value === undefined || value === "") return {};
  if ((Buffer.isBuffer(value) || value instanceof Uint8Array) && !value.length)
    return {};
  let buffer;
  if (Buffer.isBuffer(value)) buffer = value;
  else if (value instanceof Uint8Array) buffer = Buffer.from(value);
  else if (typeof value === "string") {
    const input = value.trim();
    const dataUrl = input.match(
      /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i,
    );
    const encoded = dataUrl?.[1] || input;
    if (/^[A-Za-z0-9+/=\s]+$/.test(encoded)) {
      try {
        buffer = Buffer.from(encoded.replace(/\s+/g, ""), "base64");
      } catch (_error) {
        buffer = null;
      }
    }
  }
  if (!buffer?.length || !profilePhotos.photoType(buffer))
    return {
      warning:
        "Photo is not valid JPEG, PNG, or WebP image data and will be skipped",
    };
  return { buffer };
}

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

async function currentPeriod(expectedId) {
  const active = await academicPeriods.getCurrent();
  const semesters = {
    "First Semester": 1, "Second Semester": 2, Summer: 3,
    "First Term": 1, "Second Term": 2, "Third Term": 3,
  };
  if (!active || !semesters[active.term]) {
    const error = new Error("Set a current academic period before importing students.");
    error.status = 400;
    throw error;
  }
  if (expectedId !== undefined && String(expectedId) !== String(active.id)) {
    const error = new Error("The current academic period changed. Close this window and preview the import again.");
    error.status = 409;
    throw error;
  }
  return { id: active.id, schoolYear: active.schoolYear, semester: semesters[active.term], term: active.term };
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

function studentTableName() {
  const parts = clean(process.env.MSSQL_STUDENT_TABLE || "dbo.Student").split(
    ".",
  );
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part))
  ) {
    const error = new Error(
      "Set MSSQL_STUDENT_TABLE to a trusted two-part table name, for example dbo.Student.",
    );
    error.status = 500;
    throw error;
  }
  return parts.map((part) => `[${part}]`).join(".");
}

async function openSourceConnection({ photos = false } = {}) {
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
  return new sql.ConnectionPool({
    ...settings,
    port: Number(process.env.MSSQL_PORT || 1433),
    options: {
      encrypt: process.env.MSSQL_ENCRYPT !== "false",
      trustServerCertificate:
        process.env.MSSQL_TRUST_SERVER_CERTIFICATE === "true",
    },
    connectionTimeout: 15000,
    requestTimeout: Number(
      process.env.MSSQL_REQUEST_TIMEOUT || (photos ? 300000 : 60000),
    ),
  }).connect();
}

async function readSource(sourcePeriod, { includePhotos = false } = {}) {
  const connection = await openSourceConnection();
  try {
    const querySource = (
      photoFromStudentTable = false,
      sectionFromView = true,
    ) => {
      const photoOwner = photoFromStudentTable
        ? "StudentSource"
        : "ImportSource";
      const photoSelection = includePhotos
        ? `CASE WHEN DATALENGTH(${photoOwner}.[Photo]) > 0 THEN 1 ELSE 0 END AS [HasPhoto]`
        : "CAST(0 AS bit) AS [HasPhoto]";
      const sectionSelection = sectionFromView
        ? "ImportSource.[SectionName]"
        : "CAST(NULL AS varchar(100)) AS [SectionName]";
      const join =
        includePhotos && photoFromStudentTable
          ? `LEFT JOIN ${studentTableName()} AS StudentSource
          ON LTRIM(RTRIM(CONVERT(varchar(100), StudentSource.[StudentID]))) = ImportSource.[SchoolID]`
          : "";
      return connection
        .request()
        .input("schoolYear", sql.VarChar(20), sourcePeriod.schoolYear)
        .input("semester", sql.Int, sourcePeriod.semester)
        .query(`SELECT ${REQUIRED_COLUMNS.map((column) => `ImportSource.[${column}]`).join(", ")}, ImportSource.[InstitutionalEmail], ${sectionSelection}, ${photoSelection}
          FROM ${viewName()} AS ImportSource
          ${join}
          WHERE ImportSource.[SchoolYear]=@schoolYear AND ImportSource.[Semester]=@semester
          ORDER BY ImportSource.[LastName], ImportSource.[FirstName], ImportSource.[MiddleName], ImportSource.[SchoolID]`);
    };
    let result,
      photoFromStudentTable = false,
      sectionFromView = true;
    while (!result) {
      try {
        result = await querySource(photoFromStudentTable, sectionFromView);
      } catch (error) {
        if (
          sectionFromView &&
          error.number === 207 &&
          /SectionName/i.test(error.message)
        ) {
          sectionFromView = false;
          continue;
        }
        if (
          includePhotos &&
          !photoFromStudentTable &&
          error.number === 207 &&
          /(?:column name\s+['"]?Photo|\[Photo\])/i.test(error.message)
        ) {
          photoFromStudentTable = true;
          continue;
        }
        if (!includePhotos || !photoFromStudentTable) throw error;
        const configurationError = new Error(
          "The SQL Server view does not expose Photo, and TapTrack cannot read dbo.Student.Photo. Add S.Photo AS Photo to the configured view, or grant the import account SELECT access to StudentID and Photo in the configured student table.",
        );
        configurationError.status = 503;
        configurationError.cause = error;
        throw configurationError;
      }
    }
    return result.recordset.map((row) => ({
      idNumber: clean(row.SchoolID).toUpperCase(),
      firstName: clean(row.FirstName),
      middleName: clean(row.MiddleName),
      lastName: clean(row.LastName),
      programCode: clean(row.CourseCode).toUpperCase(),
      yearLevel: normalizeYearLevel(row.YearLevel),
      sectionName: clean(row.SectionName).replace(/\s+/g, " "),
      birthday: dateValue(row.BirthDate),
      gender: clean(row.Gender),
      institutionalEmail: clean(row.InstitutionalEmail).toLowerCase(),
      hasPhoto: Boolean(row.HasPhoto),
    }));
  } finally {
    await connection.close();
  }
}

async function review(sourcePeriod, { includePhotos = false } = {}) {
  const [rows, programs, sections, students, employeeRows] = await Promise.all([
    readSource(sourcePeriod, { includePhotos }),
    require("../academic/academic.model").getAll("program"),
    require("../section/section.model").getAll(),
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
  const sectionByGradeAndName = new Map(
    sections
      .filter((item) => item.isActive)
      .map((item) => [
        `${item.yearLevel}|${clean(item.name).toLowerCase()}`,
        item,
      ]),
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
      /^Grade\s+(?:[1-9]|1[0-2])$/.test(row.yearLevel) &&
      (!row.sectionName || row.sectionName.length > 100)
    )
      messages.push(
        "SectionName is required for Grade 1 to Grade 12 and must not exceed 100 characters",
      );
    const section = row.sectionName
      ? sectionByGradeAndName.get(
          `${row.yearLevel}|${row.sectionName.toLowerCase()}`,
        )
      : null;
    if (
      /^Grade\s+(?:[1-9]|1[0-2])$/.test(row.yearLevel) &&
      row.sectionName &&
      !section
    )
      messages.push(
        "SectionName does not match an active section for this grade",
      );
    if (!row.yearLevel.startsWith("Grade ")) row.sectionName = "";
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
      sectionId: section?.id || null,
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

function preview(result, offset = 0, importPhotos = false) {
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
        [
          kind === "new"
            ? "Student will be created."
            : "Student record will be updated.",
          importPhotos && item.hasPhoto ? "Photo will be imported." : "",
        ]
          .filter(Boolean)
          .join(" "),
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

async function importPhotos(targets) {
  const imported = [];
  const failed = [];
  const batchSize = 8;
  for (let offset = 0; offset < targets.length; offset += batchSize) {
    const batch = targets.slice(offset, offset + batchSize);
    const results = await Promise.all(
      batch.map(async (target) => {
        try {
          const photoUrl = await profilePhotos.saveBuffer(
            "student",
            target.idNumber,
            target.photo,
            { versioned: true },
          );
          await pool.query("UPDATE students SET photo_url=? WHERE id=?", [
            photoUrl,
            target.studentId,
          ]);
          return { idNumber: target.idNumber, photoUrl };
        } catch (error) {
          return { idNumber: target.idNumber, error: error.message };
        }
      }),
    );
    results.forEach((item) =>
      item.error ? failed.push(item) : imported.push(item),
    );
  }
  return { imported, failed };
}

async function importSourcePhotos(targets) {
  const imported = [];
  const failed = [];
  if (!targets.length) return { imported, failed };
  const connection = await openSourceConnection({ photos: true });
  const batchSize = 8;
  try {
    for (let offset = 0; offset < targets.length; offset += batchSize) {
      const batch = targets.slice(offset, offset + batchSize);
      const request = connection.request();
      const parameters = batch.map((target, index) => {
        request.input(`schoolId${index}`, sql.VarChar(100), target.idNumber);
        return `@schoolId${index}`;
      });
      let rows;
      try {
        const result = await request.query(
          `SELECT LTRIM(RTRIM(CONVERT(varchar(100), [StudentID]))) AS [SchoolID], [Photo]
           FROM ${studentTableName()}
           WHERE LTRIM(RTRIM(CONVERT(varchar(100), [StudentID]))) IN (${parameters.join(",")})`,
        );
        rows = result.recordset;
      } catch (error) {
        failed.push(
          ...batch.map((target) => ({
            idNumber: target.idNumber,
            error: `Photo could not be read from SQL Server: ${error.message}`,
          })),
        );
        continue;
      }
      const targetById = new Map(
        batch.map((target) => [target.idNumber, target]),
      );
      const ready = [];
      for (const row of rows) {
        const idNumber = clean(row.SchoolID).toUpperCase();
        const target = targetById.get(idNumber);
        if (!target) continue;
        targetById.delete(idNumber);
        const photo = sourcePhoto(row.Photo);
        if (photo.buffer) ready.push({ ...target, photo: photo.buffer });
        else
          failed.push({
            idNumber,
            error: photo.warning || "Photo is empty and was skipped",
          });
      }
      failed.push(
        ...[...targetById.values()].map((target) => ({
          idNumber: target.idNumber,
          error: "Photo could not be found in the SQL Server Student table",
        })),
      );
      const saved = await importPhotos(ready);
      imported.push(...saved.imported);
      failed.push(...saved.failed);
    }
  } finally {
    await connection.close();
  }
  return { imported, failed };
}

exports.preview = async (req, res) => {
  const importPhotos = req.query.importPhotos === "true";
  const sourcePeriod = await currentPeriod(req.query.periodId);
  const result = await review(sourcePeriod, {
    includePhotos: importPhotos,
  });
  const offset = Number(req.query.offset || 0);
  if (!Number.isInteger(offset) || offset < 0) {
    const error = new Error(
      "Preview offset must be a non-negative whole number.",
    );
    error.status = 400;
    throw error;
  }
  res.json({
    period: sourcePeriod,
    importPhotos,
    deactivate: await deactivationCount(result.sourceIds),
    ...preview(result, offset, importPhotos),
  });
};

exports.import = async (req, res) => {
  const sourcePeriod = await currentPeriod(req.body.id);
  if (req.body.id === undefined || req.body.schoolYear !== sourcePeriod.schoolYear || Number(req.body.semester) !== sourcePeriod.semester || req.body.term !== sourcePeriod.term) {
    const error = new Error("The current academic period changed or the preview is missing. Preview the import again.");
    error.status = 409;
    throw error;
  }
  if (
    req.body.importPhotos !== undefined &&
    typeof req.body.importPhotos !== "boolean"
  ) {
    const error = new Error("The photo import option must be true or false.");
    error.status = 400;
    throw error;
  }
  const importPhotos = req.body.importPhotos === true;
  const result = await review(sourcePeriod, { includePhotos: importPhotos });
  if (!result.items.length)
    return res.status(400).json({
      message: "No valid student rows are available from the SQL Server view.",
      importPhotos,
      ...preview(result, 0, importPhotos),
    });
  const connection = await pool.getConnection();
  const photoTargets = [];
  let inserted = 0,
    updated = 0,
    deactivated = 0;
  try {
    await connection.beginTransaction();
    const pendingDeactivations = await deactivationCount(
      result.sourceIds,
      connection,
    );
    for (const item of result.items) {
      const values = [
        item.idNumber,
        item.institutionalEmail || null,
        item.firstName,
        item.middleName || null,
        item.lastName,
        item.programId,
        item.yearLevel,
        item.sectionId || null,
        item.birthday,
        item.institutionalEmail || null,
        item.gender,
      ];
      let studentId;
      if (item.existing) {
        await connection.query(
          "UPDATE students SET contact=?,first_name=?,middle_name=?,last_name=?,program_id=?,year_level=?,section_id=?,birthday=?,institutional_email=?,gender=?,is_active=TRUE WHERE id=?",
          [...values.slice(1), item.existing.id],
        );
        studentId = item.existing.id;
        updated++;
      } else {
        const [status] = await connection.query(
          "INSERT INTO students (id_number,contact,first_name,middle_name,last_name,program_id,year_level,section_id,birthday,institutional_email,gender,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,TRUE)",
          values,
        );
        studentId = status.insertId;
        inserted++;
      }
      if (importPhotos && item.hasPhoto)
        photoTargets.push({
          studentId,
          idNumber: item.idNumber,
        });
    }
    if (req.body.confirmDeactivation === true && pendingDeactivations) {
      const placeholders = result.sourceIds.map(() => "?").join(",");
      const [status] = await connection.query(
        `UPDATE students SET is_active=FALSE WHERE is_active=TRUE AND id_number NOT IN (${placeholders})`,
        result.sourceIds,
      );
      deactivated = status.affectedRows;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  let photos = { imported: [], failed: [] };
  if (importPhotos) {
    try {
      photos = await importSourcePhotos(photoTargets);
    } catch (error) {
      photos = {
        imported: [],
        failed: photoTargets.map((target) => ({
          idNumber: target.idNumber,
          error: `Photo import could not connect to SQL Server: ${error.message}`,
        })),
      };
    }
  }
  const photoErrors = photos.failed;
  req.activityAction = "MSSQL_IMPORTED";
  const semesterLabel = {
    1: "First Semester",
    2: "Second Semester",
    3: "Summer",
  }[sourcePeriod.semester];
  const photoActivity = importPhotos
    ? `${photos.imported.length} photos imported, ${photoErrors.length} photos skipped`
    : "photo import not requested";
  req.activityDescription = `Imported ${inserted + updated} students from SQL Server for ${sourcePeriod.schoolYear}, ${semesterLabel}: ${inserted} added, ${updated} updated, ${photoActivity}, ${deactivated} deactivated.`;
  const photoMessage = importPhotos
    ? ` ${photos.imported.length} profile photo${photos.imported.length === 1 ? " was" : "s were"} imported.${photoErrors.length ? ` ${photoErrors.length} source photo${photoErrors.length === 1 ? " was" : "s were"} skipped.` : ""}`
    : " Student photos were not imported.";
  res.json({
    message: `${inserted + updated} students imported from SQL Server.${photoMessage}${deactivated ? ` ${deactivated} students not enrolled in the selected term were deactivated.` : " No other students were deactivated."}`,
    period: sourcePeriod,
    importPhotos,
    inserted,
    updated,
    photosImported: photos.imported.length,
    photosSkipped: photoErrors.length,
    photoErrors: photoErrors.slice(0, 50),
    deactivated,
    invalid: result.errors.length,
    errors: result.errors.slice(0, 50),
  });
};
