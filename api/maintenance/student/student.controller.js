const model = require("./student.model");
const nfcWriter = require("../../../scanner/nfc-writer");
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
    birthday: normalizeBirthday(body.birthday),
    institutionalEmail: String(body.institutionalEmail || "")
      .trim()
      .toLowerCase(),
    gender: String(body.gender || ""),
  };
  data.fullName = [data.firstName, data.middleName, data.lastName]
    .filter(Boolean)
    .join(" ");
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
    data.birthday &&
    (!data.institutionalEmail ||
      /^\S+@\S+\.\S+$/.test(data.institutionalEmail)) &&
    ["Male", "Female", "Other", "Prefer not to say"].includes(data.gender)
  );
}
exports.getAll = async (_req, res) => res.json(await model.getAll());
exports.cardWriterStatus = (_req, res) => res.json(nfcWriter.status());
exports.readCard = async (req, res) => {
  const result = await nfcWriter.readCard();
  req.activityAction = "CARD_READ";
  req.activityDescription = "Read an NFC card before student card enrollment.";
  res.json(result);
};
exports.enrollCard = async (req, res) => {
  const student = await model.getById(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found." });
  if (!student.isActive)
    return res
      .status(400)
      .json({ message: "Activate the student before enrolling a card." });
  if (!/^(?:\d{7,8}|\d{12})$/.test(student.idNumber))
    return res.status(400).json({
      message:
        "The student identifier must use YYYYXXX, YYYYXXXX, or the 12-digit LRN format before it can be written to a card.",
    });
  await nfcWriter.writeAndVerify(student.idNumber);
  req.activityAction = "CARD_ENROLLED";
  req.activityDescription = `Wrote and verified student ID ${student.idNumber} on an NFC card for ${student.name}.`;
  res.json({
    success: true,
    studentId: student.id,
    idNumber: student.idNumber,
    verified: true,
  });
};
exports.create = async (req, res) => {
  const data = payload(req.body);
  if (!valid(data))
    return res
      .status(400)
      .json({ message: "Complete all required student fields." });
  if (await model.findId(data.idNumber))
    return res
      .status(409)
      .json({ message: "That ID number is already registered." });
  const result = await model.create(data);
  req.activityDescription = `Added student ${data.fullName}.`;
  res.status(201).json({
    id: result.insertId,
    ...data,
    name: data.fullName,
    isActive: 1,
    type: "Student",
  });
};
exports.importSummary = async (req, res) => {
  const added = Math.max(0, Number(req.body.added) || 0);
  const updated = Math.max(0, Number(req.body.updated) || 0);
  req.activityAction = "CREATED";
  req.activityDescription =
    `Bulk imported students: ${added} new row${added === 1 ? "" : "s"} added` +
    ` and ${updated} row${updated === 1 ? "" : "s"} updated.`;
  res.json({ added, updated });
};
exports.update = async (req, res) => {
  const data = payload(req.body);
  if (!valid(data))
    return res
      .status(400)
      .json({ message: "Complete all required student fields." });
  if (await model.findId(data.idNumber, req.params.id))
    return res
      .status(409)
      .json({ message: "That ID number is already registered." });
  const result = await model.update(req.params.id, data);
  if (!result.affectedRows)
    return res.status(404).json({ message: "Student not found." });
  res.json({
    id: Number(req.params.id),
    ...data,
    name: data.fullName,
    type: "Student",
  });
};
exports.setStatus = async (req, res) => {
  const result = await model.setStatus(
    req.params.id,
    Boolean(req.body.isActive),
  );
  if (!result.affectedRows)
    return res.status(404).json({ message: "Student not found." });
  res.status(204).end();
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
