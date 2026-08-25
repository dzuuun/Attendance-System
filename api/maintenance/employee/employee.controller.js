const model = require("./employee.model");
exports.getAll = async (_req, res) => res.json(await model.getAll());
exports.create = async (req, res) => {
  const data = {
    ...req.body,
    firstName: String(req.body.firstName || "").trim(),
    middleName: String(req.body.middleName || "").trim(),
    lastName: String(req.body.lastName || "").trim(),
    idNumber: String(req.body.idNumber || "")
      .trim()
      .toUpperCase(),
  };
  data.name = [data.firstName, data.middleName, data.lastName]
    .filter(Boolean)
    .join(" ");
  if (
    !data.firstName ||
    !data.lastName ||
    !data.idNumber ||
    !data.groupName?.trim()
  )
    return res
      .status(400)
      .json({ message: "Name, ID number, and department are required." });
  if (await model.findId(data.idNumber))
    return res
      .status(409)
      .json({ message: "That ID number is already registered." });
  const result = await model.create(data);
  res.status(201).json({ id: result.insertId, ...data, type: "Employee" });
};
exports.update = async (req, res) => {
  const data = {
    firstName: String(req.body.firstName || "").trim(),
    middleName: String(req.body.middleName || "").trim(),
    lastName: String(req.body.lastName || "").trim(),
    idNumber: String(req.body.idNumber || "")
      .trim()
      .toUpperCase(),
    groupName: String(req.body.groupName || "").trim(),
    contact: String(req.body.contact || "").trim(),
    isActive: req.body.isActive !== false,
  };
  data.name = [data.firstName, data.middleName, data.lastName]
    .filter(Boolean)
    .join(" ");
  if (!data.firstName || !data.lastName || !data.idNumber || !data.groupName)
    return res
      .status(400)
      .json({ message: "Name, ID number, and department are required." });
  if (await model.findId(data.idNumber, req.params.id))
    return res
      .status(409)
      .json({ message: "That ID number is already registered." });
  const result = await model.update(req.params.id, data);
  if (!result.affectedRows)
    return res.status(404).json({ message: "Employee not found." });
  res.json({ id: Number(req.params.id), ...data, type: "Employee" });
};
exports.remove = async (req, res) => {
  const result = await model.remove(req.params.id);
  if (!result.affectedRows)
    return res.status(404).json({ message: "Employee not found." });
  res.status(204).end();
};
