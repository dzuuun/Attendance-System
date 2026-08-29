const jwt = require("jsonwebtoken");
const pool = require("../db/db");
const permissionModel = require("../api/user/permission/permission.model");
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
    await permissionModel.ensureSchema();
    const [rows] = await pool.query(
      "SELECT u.id,TRIM(CONCAT_WS(' ',u.first_name,NULLIF(u.middle_name,''),u.last_name)) fullName,u.username,p.name role,u.is_active isActive,p.is_active permissionActive,p.overview_access overviewAccess,p.attendance_access attendanceAccess,p.special_events_access specialEventsAccess,p.historical_data_access historicalDataAccess,p.library_access libraryAccess,p.maintenance_access maintenanceAccess,p.users_access usersAccess,p.people_access peopleAccess FROM users u INNER JOIN permissions p ON p.id=u.permission_id WHERE u.id=? LIMIT 1",
      [decoded.sub],
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
      historicalDataAccess: Boolean(user.historicalDataAccess),
      libraryAccess: Boolean(user.libraryAccess),
      maintenanceAccess: Boolean(user.maintenanceAccess),
      usersAccess: Boolean(user.usersAccess),
      peopleAccess: user.peopleAccess || "Both",
    };
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
    : res
        .status(403)
        .json({
          success: 0,
          message: "You do not have access to this module.",
        });
const requireAnyAccess = (...keys) => (req, res, next) =>
  req.user?.role === "Superadmin" || keys.some((key) => req.user?.[key])
    ? next()
    : res.status(403).json({
        success: 0,
        message: "You do not have access to this module.",
      });
const requirePeopleAccess = (type) => (req, res, next) =>
  req.user?.role === "Superadmin" ||
  req.user?.peopleAccess === "Both" ||
  req.user?.peopleAccess === type
    ? next()
    : res
        .status(403)
        .json({
          success: 0,
          message: `Your permission does not include ${type.toLowerCase()}.`,
        });
function createToken(user) {
  return jwt.sign({ sub: String(user.id), type: "session" }, secret(), {
    expiresIn: "8h",
    issuer: "taptrack",
    audience: "taptrack-web",
  });
}
module.exports = {
  checkSession,
  requireAdmin,
  requireSuperadmin,
  requireAccess,
  requireAnyAccess,
  requirePeopleAccess,
  createToken,
};
