const model = require("./student.model");
const YEAR_LEVELS = new Set([
  ...Array.from({ length: 12 }, (_, index) => `Grade ${index + 1}`),
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "5th Year",
]);
function normalizeBirthday(value) {
  const input = String(value || "").trim();
  const slashDate = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashDate) {
    const [, month, day, sourceYear] = slashDate;
    const year =
      sourceYear.length === 2
        ? String(
            Number(sourceYear) >= 50
              ? 1900 + Number(sourceYear)
              : 2000 + Number(sourceYear),
          )
        : sourceYear;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return input || null;
}
function payload(body) {
  const data = {
    idNumber: String(body.idNumber || "")
      .trim()
      .toUpperCase(),
    firstName: String(body.firstName || "").trim(),
    middleName: String(body.middleName || "").trim(),
    lastName: String(body.lastName || "").trim(),
    programId: Number(body.programId) || null,
    programName: String(body.programName || "").trim(),
    yearLevel:
      [...YEAR_LEVELS].find(
        (level) =>
          level.toLowerCase() ===
          String(body.yearLevel || "")
            .trim()
            .toLowerCase(),
      ) || String(body.yearLevel || "").trim(),
    sectionId: Number(body.sectionId) || null,
    birthday: normalizeBirthday(body.birthday),
    institutionalEmail: String(body.institutionalEmail || "")
      .trim()
      .toLowerCase(),
    gender: String(body.gender || ""),
  };
  data.fullName = [data.firstName, data.middleName, data.lastName]
    .filter(Boolean)
    .join(" ");
  if (!/^Grade\s+(?:[1-9]|1[0-2])$/i.test(data.yearLevel))
    data.sectionId = null;
  return data;
}
function valid(data) {
  return (
    data.idNumber &&
    data.firstName &&
    data.lastName &&
    data.programId &&
    data.programName &&
    YEAR_LEVELS.has(data.yearLevel) &&
    (!data.yearLevel.startsWith("Grade ") || data.sectionId) &&
    data.birthday &&
    (!data.institutionalEmail ||
      /^\S+@\S+\.\S+$/.test(data.institutionalEmail)) &&
    ["Male", "Female"].includes(data.gender)
  );
}
function validationMessage(data) {
  if (data.yearLevel.startsWith("Grade ") && !data.sectionId)
    return "Choose an active section for Grade 1 to Grade 12 students.";
  return "Complete all required student fields.";
}
async function validateSection(data) {
  if (!data.sectionId) return null;
  const section = await require("../section/section.model").getById(
    data.sectionId,
  );
  if (!section?.isActive || section.yearLevel !== data.yearLevel) return null;
  data.sectionName = section.name;
  return section;
}
exports.getAll = async (_req, res) => res.json(await model.getAll());
exports.create = async (req, res) => {
  const data = payload(req.body);
  if (!valid(data))
    return res.status(400).json({ message: validationMessage(data) });
  if (data.sectionId && !(await validateSection(data)))
    return res.status(400).json({
      message: "Choose an active section assigned to the selected grade level.",
    });
  if (await model.findId(data.idNumber))
    return res
      .status(409)
      .json({ message: "That ID number is already registered." });
  const result = await model.create(data);
  req.activityDescription = `Added student ${data.idNumber} — ${data.fullName}.`;
  res.status(201).json({
    id: result.insertId,
    ...data,
    name: data.fullName,
    isActive: 1,
    type: "Student",
  });
};
exports.update = async (req, res) => {
  const data = payload(req.body);
  if (!valid(data))
    return res.status(400).json({ message: validationMessage(data) });
  if (data.sectionId && !(await validateSection(data)))
    return res.status(400).json({
      message: "Choose an active section assigned to the selected grade level.",
    });
  if (await model.findId(data.idNumber, req.params.id))
    return res
      .status(409)
      .json({ message: "That ID number is already registered." });
  const result = await model.update(req.params.id, data);
  if (!result.affectedRows)
    return res.status(404).json({ message: "Student not found." });
  req.activityDescription = `Updated student ${data.idNumber} — ${data.fullName}.`;
  res.json({
    id: Number(req.params.id),
    ...data,
    name: data.fullName,
    type: "Student",
  });
};
exports.setCardId = require("./card-enrollment.controller").saveFor("student");
exports.setStatus = async (req, res) => {
  const student = await model.getById(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found." });
  const isActive = Boolean(req.body.isActive);
  const result = await model.setStatus(req.params.id, isActive);
  if (!result.affectedRows)
    return res.status(404).json({ message: "Student not found." });
  req.activityDescription = `${isActive ? "Enabled" : "Disabled"} student ${student.idNumber} — ${student.name}.`;
  res.status(204).end();
};
exports.transferToAlumni = async (req, res) => {
  const graduationYear = Number(req.body.graduationYear);
  const maximumYear = new Date().getFullYear() + 1;
  if (
    !Number.isInteger(graduationYear) ||
    graduationYear < 1900 ||
    graduationYear > maximumYear
  )
    return res.status(400).json({ message: "Enter a valid graduation year." });
  const alumniModel = require("../alumni/alumni.model");
  const result = await alumniModel.transferStudent(
    req.params.id,
    graduationYear,
  );
  if (result.status === "missing")
    return res.status(404).json({ message: "Student not found." });
  const alumnus = await alumniModel.getById(result.id);
  req.activityAction = "STUDENT_GRADUATED";
  req.activityDescription = `Transferred ${alumnus.idNumber} — ${alumnus.name} to Alumni (${graduationYear}) and deactivated the student record.`;
  res.status(result.status === "created" ? 201 : 200).json(alumnus);
};
exports.bulkTransferToAlumni = async (req, res) => {
  const graduationYear = Number(req.body.graduationYear);
  const idNumbers = [
    ...new Set(
      (Array.isArray(req.body.idNumbers) ? req.body.idNumbers : [])
        .map((value) =>
          String(value || "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  ];
  const maximumYear = new Date().getFullYear() + 1;
  if (!idNumbers.length || idNumbers.length > 10000)
    return res
      .status(400)
      .json({ message: "Import between 1 and 10,000 student IDs." });
  if (
    !Number.isInteger(graduationYear) ||
    graduationYear < 1900 ||
    graduationYear > maximumYear
  )
    return res.status(400).json({ message: "Enter a valid graduation year." });
  const result =
    await require("../alumni/alumni.model").transferStudentsByIdNumbers(
      idNumbers,
      graduationYear,
    );
  if (!result.transferred)
    return res
      .status(409)
      .json({ message: "None of the selected students are active." });
  req.activityAction = "STUDENTS_GRADUATED";
  req.activityDescription = `Bulk transferred ${result.transferred} student${result.transferred === 1 ? "" : "s"} to Alumni (${graduationYear}) by ID import and deactivated their student records. ${result.skipped} ID${result.skipped === 1 ? " was" : "s were"} skipped.`;
  res.json(result);
};
exports.deactivateMissing = async (req, res) => {
  const idNumbers = [
    ...new Set(
      (Array.isArray(req.body.idNumbers) ? req.body.idNumbers : [])
        .map((value) =>
          String(value || "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  ];
  if (!idNumbers.length)
    return res
      .status(400)
      .json({ message: "The import must contain at least one student ID." });
  const result = await model.deactivateMissing(idNumbers);
  req.activityAction = "STATUS_CHANGED";
  req.activityDescription = `Deactivated ${result.affectedRows} student${result.affectedRows === 1 ? "" : "s"} missing from the bulk import.`;
  res.json({ deactivated: result.affectedRows });
};
