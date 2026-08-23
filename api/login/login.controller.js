const bcrypt = require("bcryptjs");
const model = require("./login.model");
const { createToken } = require("../../auth/auth_validation");

exports.login = async (req, res) => {
  const user = await model.findByUsername(
    String(req.body.username || "").trim(),
  );
  if (
    !user ||
    !user.isActive ||
    !(await bcrypt.compare(String(req.body.password || ""), user.passwordHash))
  )
    return res
      .status(401)
      .json({ success: 0, message: "Invalid username or password." });
  const session = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
  };
  res.json({ ...session, token: createToken(session) });
};
exports.me = (req, res) => res.json(req.user);
exports.logout = (_req, res) => res.status(204).end();
exports.setupStatus = async (_req, res) =>
  res.json({ required: (await model.countUsers()) === 0 });
exports.setup = async (req, res) => {
  if (await model.countUsers())
    return res.status(403).json({ message: "Initial setup is complete." });
  const { fullName, username, password } = req.body;
  if (!fullName?.trim() || !username?.trim() || String(password).length < 8)
    return res
      .status(400)
      .json({
        message: "Complete all fields; use at least 8 password characters.",
      });
  const result = await model.createSuperadmin({
    fullName: fullName.trim(),
    username: username.trim(),
    passwordHash: await bcrypt.hash(password, 12),
  });
  const session = {
    id: result.insertId,
    fullName: fullName.trim(),
    username: username.trim(),
    role: "Superadmin",
  };
  res.status(201).json({ ...session, token: createToken(session) });
};
