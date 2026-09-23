const model = require("./alumni.model");
const YEAR_LEVELS = new Set([
  ...Array.from({ length: 12 }, (_, index) => `Grade ${index + 1}`),
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "5th Year",
]);

exports.getAll = async (_req, res) => res.json(await model.getAll());

function payload(body) {
  return {
    idNumber: String(body.idNumber || "")
      .trim()
      .toUpperCase(),
    firstName: String(body.firstName || "").trim(),
    middleName: String(body.middleName || "").trim(),
    lastName: String(body.lastName || "").trim(),
    programId: Number(body.programId) || null,
    graduationYear: Number(body.graduationYear),
    birthday: String(body.birthday || "").trim() || null,
    institutionalEmail: String(body.institutionalEmail || "")
      .trim()
      .toLowerCase(),
    gender: String(body.gender || "").trim() || null,
  };
}
function valid(data) {
  return (
    data.idNumber &&
    data.firstName &&
    data.lastName &&
    data.programId &&
    Number.isInteger(data.graduationYear) &&
    data.graduationYear >= 1900 &&
    data.graduationYear <= new Date().getFullYear() + 1 &&
    (!data.institutionalEmail || /^\S+@\S+\.\S+$/.test(data.institutionalEmail))
  );
}
exports.create = async (req, res) => {
  if (
    req.get("X-Bulk-Import") === "alumni" &&
    !["Superadmin", "Administrator"].includes(req.user?.role)
  )
    return res.status(403).json({
      message:
        "Administrator access is required to deactivate linked students.",
    });
  const data = payload(req.body);
  if (!valid(data))
    return res
      .status(400)
      .json({ message: "Complete all required alumni fields." });
  if (await model.findIdNumber(data.idNumber))
    return res
      .status(409)
      .json({ message: "That ID number is already in the Alumni directory." });
  if (await model.employeeUsesIdNumber(data.idNumber))
    return res
      .status(409)
      .json({ message: "That ID number is assigned to an employee." });
  const result = await model.create(data, {
    deactivateStudent: req.get("X-Bulk-Import") === "alumni",
  });
  const alumnus = await model.getById(result.insertId);
  req.activityDescription = `Added alumnus ${alumnus.idNumber} — ${alumnus.name}.`;
  res.status(201).json(alumnus);
};
exports.update = async (req, res) => {
  if (
    req.get("X-Bulk-Import") === "alumni" &&
    !["Superadmin", "Administrator"].includes(req.user?.role)
  )
    return res.status(403).json({
      message:
        "Administrator access is required to deactivate linked students.",
    });
  const data = payload(req.body);
  if (!valid(data))
    return res
      .status(400)
      .json({ message: "Complete all required alumni fields." });
  if (await model.findIdNumber(data.idNumber, req.params.id))
    return res
      .status(409)
      .json({ message: "That ID number is already in the Alumni directory." });
  if (await model.employeeUsesIdNumber(data.idNumber))
    return res
      .status(409)
      .json({ message: "That ID number is assigned to an employee." });
  const result = await model.update(req.params.id, data, {
    deactivateStudent: req.get("X-Bulk-Import") === "alumni",
  });
  if (!result.affectedRows)
    return res.status(404).json({ message: "Alumnus not found." });
  req.activityDescription = `Updated alumnus ${data.idNumber}.`;
  res.json(await model.getById(req.params.id));
};

exports.setStatus = async (req, res) => {
  const alumnus = await model.getById(req.params.id);
  if (!alumnus) return res.status(404).json({ message: "Alumnus not found." });
  const isActive = Boolean(req.body.isActive);
  await model.setStatus(req.params.id, isActive);
  req.activityAction = "STATUS_CHANGED";
  req.activityDescription = `${isActive ? "Enabled" : "Disabled"} alumnus ${alumnus.idNumber} — ${alumnus.name}.`;
  res.status(204).end();
};
exports.reenroll = async (req, res) => {
  const alumnus = await model.getById(req.params.id);
  if (!alumnus) return res.status(404).json({ message: "Alumnus not found." });
  const programId = Number(req.body.programId);
  const yearLevel = String(req.body.yearLevel || "").trim();
  const isGrade = /^Grade\s+(?:[1-9]|1[0-2])$/.test(yearLevel);
  const sectionId = isGrade ? Number(req.body.sectionId) || null : null;
  if (
    !Number.isInteger(programId) ||
    programId < 1 ||
    !YEAR_LEVELS.has(yearLevel) ||
    (isGrade && !sectionId)
  )
    return res.status(400).json({
      message: isGrade
        ? "Choose a valid program, year level, and section name."
        : "Choose a valid program and year level.",
    });
  const programs = await require("../academic/academic.model").getAll(
    "program",
  );
  if (
    !programs.some(
      (program) => Number(program.id) === programId && program.isActive,
    )
  )
    return res.status(400).json({ message: "Choose an active program." });
  if (sectionId) {
    const section = await require("../section/section.model").getById(
      sectionId,
    );
    if (!section?.isActive || section.yearLevel !== yearLevel)
      return res.status(400).json({
        message:
          "Choose an active section assigned to the selected grade level.",
      });
  }
  const result = await model.reenroll(
    alumnus.id,
    programId,
    yearLevel,
    sectionId,
  );
  if (!result.affectedRows)
    return res
      .status(409)
      .json({ message: "The linked student record could not be activated." });
  req.activityAction = "ALUMNUS_REENROLLED";
  req.activityDescription = `Re-enrolled alumnus ${alumnus.idNumber} — ${alumnus.name} as an active student.`;
  res.json({ success: true, studentId: alumnus.studentId });
};
