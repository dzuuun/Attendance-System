const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db/db");
const permissionModel = require("../api/user/permission/permission.model");
const secret = () => {
  const value = String(process.env.JWT_SECRET || "").trim();
  if (value.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  return value;
};
function tokenFrom(req) {
  const header = req.get("authorization") || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  const pair = String(req.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("taptrack_session="));
  return pair
    ? decodeURIComponent(pair.slice("taptrack_session=".length))
    : null;
}
let sessionsReady;
async function ensureSessionSchema() {
  if (!sessionsReady)
    sessionsReady = pool.query(`CREATE TABLE IF NOT EXISTS auth_sessions (
      jti CHAR(36) PRIMARY KEY,user_id INT UNSIGNED NOT NULL,expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,last_seen_at DATETIME NULL,
      INDEX idx_auth_sessions_user (user_id),INDEX idx_auth_sessions_expiry (expires_at),
      CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
  await sessionsReady;
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
    if (decoded.type !== "session" || !decoded.jti)
      throw new Error("Invalid session.");
    await ensureSessionSchema();
    await permissionModel.ensureSchema();
    const [rows] = await pool.query(
      "SELECT u.id,TRIM(CONCAT_WS(' ',u.first_name,NULLIF(u.middle_name,''),u.last_name)) fullName,u.username,p.name role,u.is_active isActive,p.is_active permissionActive,p.overview_access overviewAccess,p.attendance_access attendanceAccess,p.special_events_access specialEventsAccess,p.library_access libraryAccess,p.maintenance_access maintenanceAccess,p.users_access usersAccess FROM auth_sessions a INNER JOIN users u ON u.id=a.user_id INNER JOIN permissions p ON p.id=u.permission_id WHERE a.jti=? AND a.user_id=? AND a.revoked_at IS NULL AND a.expires_at>NOW() LIMIT 1",
      [decoded.jti, decoded.sub],
    );
    const user = rows[0];
    if (!user || !user.isActive || !user.permissionActive)
      return res
        .status(401)
        .json({ success: 0, message: "This account is no longer active." });
    req.user = {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      overviewAccess: Boolean(user.overviewAccess),
      attendanceAccess: Boolean(user.attendanceAccess),
      specialEventsAccess: Boolean(user.specialEventsAccess),
      libraryAccess: Boolean(user.libraryAccess),
      maintenanceAccess: Boolean(user.maintenanceAccess),
      usersAccess: Boolean(user.usersAccess),
    };
    req.sessionId = decoded.jti;
    pool
      .query("UPDATE auth_sessions SET last_seen_at=NOW() WHERE jti=?", [
        decoded.jti,
      ])
      .catch(() => {});
    next();
  } catch (error) {
    if (
      ["TokenExpiredError", "JsonWebTokenError", "NotBeforeError"].includes(
        error.name,
      )
    )
      return res.status(401).json({
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
const requireAccess = (key) => (req, res, next) =>
  req.user?.role === "Superadmin" || req.user?.[key]
    ? next()
    : res.status(403).json({
        success: 0,
        message: "You do not have access to this module.",
      });
const requireAnyAccess =
  (...keys) =>
  (req, res, next) =>
    req.user?.role === "Superadmin" || keys.some((key) => req.user?.[key])
      ? next()
      : res.status(403).json({
          success: 0,
          message: "You do not have access to this module.",
        });
async function createToken(user) {
  await ensureSessionSchema();
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const token = jwt.sign(
    { sub: String(user.id), type: "session", jti },
    secret(),
    {
      expiresIn: "8h",
      issuer: "taptrack",
      audience: "taptrack-web",
    },
  );
  await pool.query(
    "INSERT INTO auth_sessions (jti,user_id,expires_at,last_seen_at) VALUES (?,?,?,NOW())",
    [jti, user.id, expiresAt],
  );
  return token;
}
async function revokeSession(jti) {
  if (!jti) return;
  await ensureSessionSchema();
  await pool.query("UPDATE auth_sessions SET revoked_at=NOW() WHERE jti=?", [
    jti,
  ]);
}
module.exports = {
  checkSession,
  requireAdmin,
  requireSuperadmin,
  requireAccess,
  requireAnyAccess,
  createToken,
  revokeSession,
  ensureSessionSchema,
  getJwtSecret: secret,
};
