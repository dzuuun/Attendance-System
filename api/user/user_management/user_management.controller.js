const bcrypt = require("bcryptjs"),
  model = require("./user_management.model");
exports.getAll = async (_req, res) => res.json(await model.getAll());
exports.create = async (req, res) => {
  const { fullName, username, password, role = "Staff" } = req.body,
    allowed =
      req.user.role === "Superadmin"
        ? ["Superadmin", "Administrator", "Staff"]
        : ["Administrator", "Staff"];
  if (
    !fullName?.trim() ||
    !username?.trim() ||
    String(password).length < 8 ||
    !allowed.includes(role)
  )
    return res
      .status(400)
      .json({ message: "Complete all fields; passwords need 8 characters." });
  try {
    const result = await model.create({
      fullName: fullName.trim(),
      username: username.trim(),
      passwordHash: await bcrypt.hash(password, 12),
      role,
    });
    res
      .status(201)
      .json({
        id: result.insertId,
        fullName: fullName.trim(),
        username: username.trim(),
        role,
        isActive: 1,
      });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "That username already exists." });
    throw error;
  }
};
exports.setStatus = async (req, res) => {
  if (Number(req.params.id) === req.user.id && !req.body.isActive)
    return res
      .status(400)
      .json({ message: "You cannot deactivate your account." });
  await model.setStatus(req.params.id, Boolean(req.body.isActive));
  res.status(204).end();
};
