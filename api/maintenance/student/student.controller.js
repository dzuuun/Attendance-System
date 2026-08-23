const model = require("./student.model");
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
    yearLevel: String(body.yearLevel || "").trim(),
    birthday: body.birthday || null,
    institutionalEmail: String(body.institutionalEmail || "")
      .trim()
      .toLowerCase(),
    gender: String(body.gender || ""),
  };
  data.fullName = [data.firstName, data.middleName, data.lastName]
    .filter(Boolean)
    .join(" ");
  data.programSection = `${data.programName} · ${data.yearLevel}`;
  return data;
}
function valid(data) {
  return (
    data.idNumber &&
    data.firstName &&
    data.lastName &&
    data.programId &&
    data.programName &&
    data.yearLevel &&
    data.birthday &&
    data.institutionalEmail &&
    ["Male", "Female", "Other", "Prefer not to say"].includes(data.gender)
  );
}
exports.getAll = async (_req, res) => res.json(await model.getAll());
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
  res
    .status(201)
    .json({
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
