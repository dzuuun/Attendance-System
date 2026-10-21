const bcrypt = require("bcryptjs"),
  model = require("./user_management.model"),
  permissionModel = require("../permission/permission.model");
const { revokeUserSessions } = require("../../../auth/auth_validation");
const validInstitutionalEmail = (email) => {
  if (!/^\S+@\S+\.\S+$/.test(email)) return false;
  const domain = String(process.env.GOOGLE_WORKSPACE_DOMAIN || "")
    .trim()
    .toLowerCase();
  return !domain || email.endsWith(`@${domain}`);
};
const protectedRole = (role) => ["Superadmin", "Administrator"].includes(role);
const mayManageRole = (actor, role) =>
  actor?.role === "Superadmin" || !protectedRole(role);
exports.getAll = async (_req, res) => res.json(await model.getAll());
exports.getPermissionOptions = async (req, res) => res.json(
  (await permissionModel.getAll())
    .filter((permission) => mayManageRole(req.user, permission.name))
    .map(({ id, name, isActive }) => ({ id, name, isActive })),
);
exports.create = async (req, res) => {
  const firstName = String(req.body.firstName || "").trim(),
    middleName = String(req.body.middleName || "").trim(),
    lastName = String(req.body.lastName || "").trim(),
    fullName = [firstName, middleName, lastName].filter(Boolean).join(" "),
    { username, password } = req.body,
    institutionalEmail = String(req.body.institutionalEmail || "")
      .trim()
      .toLowerCase(),
    permission = await permissionModel.findById(req.body.permissionId),
    role = permission?.name || "";
  if (
    !firstName ||
    !lastName ||
    !username?.trim() ||
    (institutionalEmail && !validInstitutionalEmail(institutionalEmail)) ||
    String(password).length < 8 ||
    !permission?.isActive ||
    !mayManageRole(req.user, role)
  )
    return res.status(400).json({
      message: "Complete all required fields; passwords need 8 characters.",
    });
  try {
    const result = await model.create({
      fullName: fullName.trim(),
      firstName,
      middleName,
      lastName,
      username: username.trim(),
      institutionalEmail: institutionalEmail || null,
      passwordHash: await bcrypt.hash(password, 12),
      role,
      permissionId: permission.id,
      isActive: Boolean(req.body.isActive ?? true),
    });
    req.activityDescription = `Created user ${username.trim()} — ${fullName.trim()}.`;
    res.status(201).json({
      id: result.insertId,
      fullName: fullName.trim(),
      firstName,
      middleName,
      lastName,
      username: username.trim(),
      institutionalEmail: institutionalEmail || null,
      role,
      permissionId: permission.id,
      isActive: 1,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res.status(409).json({
        message: "That username or institutional email already exists.",
      });
    throw error;
  }
};
exports.setStatus = async (req, res) => {
  if (Number(req.params.id) === req.user.id && !req.body.isActive)
    return res
      .status(400)
      .json({ message: "You cannot deactivate your account." });
  const user = await model.getById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found." });
  if (!mayManageRole(req.user, user.role))
    return res.status(403).json({
      message: "Only a superadmin can change an administrator account.",
    });
  const isActive = Boolean(req.body.isActive);
  await model.setStatus(req.params.id, isActive);
  req.activityDescription = `${isActive ? "Enabled" : "Disabled"} user ${user.username} — ${user.fullName}.`;
  res.status(204).end();
};
exports.update = async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isSafeInteger(userId) || userId < 1)
    return res.status(400).json({ message: "Choose a valid user." });
  const existing = await model.getById(userId);
  if (!existing) return res.status(404).json({ message: "User not found." });
  if (!mayManageRole(req.user, existing.role))
    return res.status(403).json({
      message: "Only a superadmin can change an administrator account.",
    });
  const firstName = String(req.body.firstName || "").trim(),
    middleName = String(req.body.middleName || "").trim(),
    lastName = String(req.body.lastName || "").trim(),
    fullName = [firstName, middleName, lastName].filter(Boolean).join(" "),
    username = String(req.body.username || "").trim(),
    institutionalEmail = String(req.body.institutionalEmail || "")
      .trim()
      .toLowerCase(),
    password = String(req.body.password || ""),
    permission = await permissionModel.findById(req.body.permissionId),
    role = permission?.name || "",
    isActive = Boolean(req.body.isActive),
    canAssign = permission?.isActive && mayManageRole(req.user, role);
  if (
    !firstName ||
    !lastName ||
    !username ||
    (institutionalEmail && !validInstitutionalEmail(institutionalEmail)) ||
    !canAssign ||
    (password && password.length < 8)
  )
    return res.status(400).json({
      message:
        "Complete all required fields; a new password needs 8 characters.",
    });
  if (Number(req.params.id) === req.user.id && !isActive)
    return res
      .status(400)
      .json({ message: "You cannot deactivate your account." });
  try {
    const result = await model.update(userId, {
      fullName,
      firstName,
      middleName,
      lastName,
      username,
      institutionalEmail: institutionalEmail || null,
      role,
      permissionId: permission.id,
      isActive,
      passwordHash: password ? await bcrypt.hash(password, 12) : null,
    });
    if (!result.affectedRows)
      return res.status(404).json({ message: "User not found." });
    if (password) await revokeUserSessions(userId);
    req.activityDescription = `Updated user ${username} — ${fullName}.`;
    res.json({
      id: userId,
      fullName,
      firstName,
      middleName,
      lastName,
      username,
      institutionalEmail: institutionalEmail || null,
      permissionId: permission.id,
      role,
      isActive,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res.status(409).json({
        message: "That username or institutional email already exists.",
      });
    throw error;
  }
};
