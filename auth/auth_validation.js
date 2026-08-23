const jwt = require("jsonwebtoken");
const pool = require("../db/db");
const secret = () => process.env.JWT_SECRET || "development-only-change-me";
function tokenFrom(req) {
  const header = req.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}
async function checkSession(req, res, next) {
  try {
    const token = tokenFrom(req);
    if (!token)
      return res
        .status(401)
        .json({ success: 0, message: "Please sign in to continue." });
    const decoded = jwt.verify(token, secret(), {
      issuer: "taptrack",
      audience: "taptrack-web",
    });
    const [rows] = await pool.query(
      "SELECT id,full_name fullName,username,role,is_active isActive FROM users WHERE id=? LIMIT 1",
      [decoded.sub],
    );
    const user = rows[0];
    if (!user || !user.isActive)
      return res
        .status(401)
        .json({ success: 0, message: "This account is no longer active." });
    req.user = {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
    };
    next();
  } catch (error) {
    if (
      ["TokenExpiredError", "JsonWebTokenError", "NotBeforeError"].includes(
        error.name,
      )
    )
      return res
        .status(401)
        .json({
          success: 0,
          message: "Your session is invalid or expired. Please sign in again.",
        });
    next(error);
  }
}
function requireAdmin(req, res, next) {
  return ["Superadmin", "Administrator"].includes(req.user?.role)
    ? next()
    : res
        .status(403)
        .json({ success: 0, message: "Administrator access is required." });
}
function requireSuperadmin(req, res, next) {
  return req.user?.role === "Superadmin"
    ? next()
    : res
        .status(403)
        .json({ success: 0, message: "Superadmin access is required." });
}
function createToken(user) {
  return jwt.sign({ sub: String(user.id), type: "session" }, secret(), {
    expiresIn: "8h",
    issuer: "taptrack",
    audience: "taptrack-web",
  });
}
module.exports = { checkSession, requireAdmin, requireSuperadmin, createToken };
