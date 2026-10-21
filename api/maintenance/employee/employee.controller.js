const model = require("./employee.model");
exports.getAll = async (_req, res) => res.json(await model.getAll());
exports.create = async (req, res) => {
  const data = {
    contact: String(req.body.contact || "").trim(),
    isActive: req.body.isActive !== false,
    firstName: String(req.body.firstName || "").trim(),
    middleName: String(req.body.middleName || "").trim(),
    lastName: String(req.body.lastName || "").trim(),
    idNumber: String(req.body.idNumber || "")
      .trim()
      .toUpperCase(),
    departmentId: Number(req.body.departmentId) || null,
  };
  data.name = [data.firstName, data.middleName, data.lastName]
    .filter(Boolean)
    .join(" ");
  if (!data.firstName || !data.lastName || !data.idNumber || !data.departmentId)
    return res
      .status(400)
      .json({ message: "Name, ID number, and department are required." });
  if (await model.findId(data.idNumber))
    return res
      .status(409)
      .json({ message: "That ID number is already registered." });
  const department = await model.getDepartment(data.departmentId);
  if (!department?.isActive)
    return res
      .status(400)
      .json({ message: "Choose an active employee department." });
  data.departmentName = department.name;
  data.departmentCode = department.code;
  data.groupName = department.name;
  const result = await model.create(data);
  req.activityDescription = `Added employee ${data.idNumber} — ${data.name}.`;
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
    departmentId: Number(req.body.departmentId) || null,
    contact: String(req.body.contact || "").trim(),
    isActive: req.body.isActive !== false,
  };
  data.name = [data.firstName, data.middleName, data.lastName]
    .filter(Boolean)
    .join(" ");
  if (!data.firstName || !data.lastName || !data.idNumber || !data.departmentId)
    return res
      .status(400)
      .json({ message: "Name, ID number, and department are required." });
  if (await model.findId(data.idNumber, req.params.id))
    return res
      .status(409)
      .json({ message: "That ID number is already registered." });
  const department = await model.getDepartment(data.departmentId);
  if (!department)
    return res.status(400).json({ message: "Choose an employee department." });
  data.departmentName = department.name;
  data.departmentCode = department.code;
  data.groupName = department.name;
  const result = await model.update(req.params.id, data);
  if (!result.affectedRows)
    return res.status(404).json({ message: "Employee not found." });
  req.activityDescription = `Updated employee ${data.idNumber} — ${data.name}.`;
  res.json({ id: Number(req.params.id), ...data, type: "Employee" });
};
exports.remove = async (req, res) => {
  const employee = await model.getById(req.params.id);
  if (!employee)
    return res.status(404).json({ message: "Employee not found." });
  const result = await model.remove(req.params.id);
  if (!result.affectedRows)
    return res.status(404).json({ message: "Employee not found." });
  req.activityDescription = `Deleted employee ${employee.idNumber} — ${employee.name}.`;
  res.status(204).end();
};
exports.setCardId = require("../student/card-enrollment.controller").saveFor("employee");
