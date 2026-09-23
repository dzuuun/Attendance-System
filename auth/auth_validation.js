const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db/db");
const permissionModel = require("../api/user/permission/permission.model");
const { cookiePath, publicPath } = require("../config/public-path");
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
function authenticationError(message) {
  const error = new Error(message);
  error.code = "AUTH_REQUIRED";
  return error;
}
const isAuthenticationError = (error) =>
  error?.code === "AUTH_REQUIRED" ||
  ["TokenExpiredError", "JsonWebTokenError", "NotBeforeError"].includes(
    error?.name,
  );
async function authenticateRequest(req) {
  const token = tokenFrom(req);
  if (!token) throw authenticationError("Please sign in to continue.");
  const decoded = jwt.verify(token, secret(), {
    issuer: "taptrack",
    audience: "taptrack-web",
  });
  if (decoded.type !== "session" || !decoded.jti)
    throw authenticationError(
      "Your session is invalid or expired. Please sign in again.",
    );
  await ensureSessionSchema();
  await permissionModel.ensureSchema();
  const [rows] = await pool.query(
    "SELECT u.id,TRIM(CONCAT_WS(' ',u.first_name,NULLIF(u.middle_name,''),u.last_name)) fullName,u.username,p.name role,u.is_active isActive,p.is_active permissionActive,p.overview_access overviewAccess,p.attendance_access attendanceAccess,p.special_events_access specialEventsAccess,p.library_access libraryAccess,p.maintenance_access maintenanceAccess,p.maintenance_modules maintenanceModules,p.users_access usersAccess FROM auth_sessions a INNER JOIN users u ON u.id=a.user_id INNER JOIN permissions p ON p.id=u.permission_id WHERE a.jti=? AND a.user_id=? AND a.revoked_at IS NULL AND a.expires_at>NOW() LIMIT 1",
    [decoded.jti, decoded.sub],
  );
  const user = rows[0];
  if (!user || !user.isActive || !user.permissionActive)
    throw authenticationError("This account is no longer active.");
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
    maintenanceModules: permissionModel.normalizeMaintenanceModules(
      user.maintenanceModules,
      Boolean(user.maintenanceAccess),
    ),
    usersAccess: Boolean(user.usersAccess),
  };
  req.sessionId = decoded.jti;
  pool
    .query("UPDATE auth_sessions SET last_seen_at=NOW() WHERE jti=?", [
      decoded.jti,
    ])
    .catch(() => {});
}
async function checkSession(req, res, next) {
  try {
    await authenticateRequest(req);
    next();
  } catch (error) {
    if (isAuthenticationError(error))
      return res.status(401).json({
        success: 0,
        message:
          error.code === "AUTH_REQUIRED"
            ? error.message
            : "Your session is invalid or expired. Please sign in again.",
      });
    next(error);
  }
}
async function checkPageSession(req, res, next) {
  try {
    await authenticateRequest(req);
    next();
  } catch (error) {
    if (!isAuthenticationError(error)) return next(error);
    res.clearCookie("taptrack_session", { path: cookiePath });
    const returnTo = encodeURIComponent(req.originalUrl || "/overview");
    return res.redirect(303, publicPath(`/login?returnTo=${returnTo}`));
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
const hasMaintenanceModule = (user, module) =>
  user?.role === "Superadmin" ||
  (user?.maintenanceAccess && user.maintenanceModules?.includes(module));
const requireMaintenance =
  (module, { readFor = [] } = {}) =>
  (req, res, next) => {
    const allowedModules = [
      module,
      ...(["GET", "HEAD"].includes(req.method) ? readFor : []),
    ];
    return allowedModules.some((candidate) =>
      hasMaintenanceModule(req.user, candidate),
    )
      ? next()
      : res.status(403).json({
          success: 0,
          message: "You do not have access to this maintenance area.",
        });
  };
const requireAnyMaintenance =
  (...modules) =>
  (req, res, next) =>
    modules.some((module) => hasMaintenanceModule(req.user, module))
      ? next()
      : res.status(403).json({
          success: 0,
          message: "You do not have access to this maintenance area.",
        });
const PEOPLE_MODULES = ["students", "alumni", "employees"];
const canReadPeople = (user) =>
  user?.role === "Superadmin" ||
  Boolean(user?.attendanceAccess) ||
  PEOPLE_MODULES.some((module) => hasMaintenanceModule(user, module));
const visiblePeopleModules = (user) =>
  user?.role === "Superadmin" || user?.attendanceAccess
    ? [...PEOPLE_MODULES]
    : PEOPLE_MODULES.filter((module) => hasMaintenanceModule(user, module));
const requirePeopleRead = (req, res, next) =>
  canReadPeople(req.user)
    ? next()
    : res.status(403).json({
        success: 0,
        message: "You do not have access to attendance or people records.",
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
async function revokeUserSessions(userId) {
  if (!userId) return;
  await ensureSessionSchema();
  await pool.query(
    "UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=? AND revoked_at IS NULL",
    [userId],
  );
}
module.exports = {
  checkSession,
  checkPageSession,
  requireAdmin,
  requireSuperadmin,
  requireAccess,
  requireAnyAccess,
  requireMaintenance,
  requireAnyMaintenance,
  hasMaintenanceModule,
  canReadPeople,
  visiblePeopleModules,
  requirePeopleRead,
  createToken,
  revokeSession,
  revokeUserSessions,
  ensureSessionSchema,
  getJwtSecret: secret,
};
