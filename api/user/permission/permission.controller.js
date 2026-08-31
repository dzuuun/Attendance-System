const model = require("./permission.model");
const payload = (body) => ({
  name: String(body.name || "").trim(),
  description: String(body.description || "").trim(),
  overviewAccess: Boolean(body.overviewAccess),
  attendanceAccess: Boolean(body.attendanceAccess),
  specialEventsAccess: Boolean(body.specialEventsAccess),
  libraryAccess: Boolean(body.libraryAccess),
  maintenanceAccess: Boolean(body.maintenanceAccess),
  usersAccess: Boolean(body.usersAccess),
  isActive: Boolean(body.isActive),
});
exports.getAll = async (_req, res) => res.json(await model.getAll());
exports.create = async (req, res) => {
  const data = payload(req.body);
  if (!data.name)
    return res.status(400).json({ message: "Permission name is required." });
  try {
    const result = await model.create(data);
    req.activityLabel = data.name;
    res.status(201).json({ id: result.insertId, ...data });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({ message: "That permission already exists." });
    throw error;
  }
};
exports.update = async (req, res) => {
  const data = payload(req.body);
  if (!data.name)
    return res.status(400).json({ message: "Permission name is required." });
  const existing = await model.findById(req.params.id);
  if (!existing)
    return res.status(404).json({ message: "Permission not found." });
  if (
    existing.name === "Superadmin" &&
    (data.name !== "Superadmin" ||
      !data.isActive ||
      !data.overviewAccess ||
      !data.specialEventsAccess ||
      !data.libraryAccess ||
      !data.maintenanceAccess)
  )
    return res.status(400).json({
      message:
        "The Superadmin permission must remain active with Maintenance access.",
    });
  try {
    const result = await model.update(req.params.id, data);
    if (!result.affectedRows)
      return res.status(404).json({ message: "Permission not found." });
    req.activityLabel = data.name;
    res.json({ id: Number(req.params.id), ...data });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({ message: "That permission already exists." });
    throw error;
  }
};
