const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../../db/db");
const loginModel = require("../login/login.model");
const activityModel = require("../user/activity_log/activity_log.model");
const { getJwtSecret } = require("../../auth/auth_validation");
const { cookiePath } = require("../../config/public-path");

const COOKIE_NAME = "taptrack_kiosk_session";
const DEVICE_COOKIE_PREFIX = `${COOKIE_NAME}_`;
const validKioskId = (value) =>
  /^[A-Za-z0-9_-]{16,80}$/.test(String(value || ""));

function cookieValue(req, name) {
  const pair = String(req.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : "";
}

function tokenFrom(req) {
  const authorization = String(req.get("authorization") || "");
  if (authorization.startsWith("Kiosk ")) return authorization.slice(6).trim();
  const requestedId = String(
    req.body?.kioskId || req.query?.kioskId || "",
  ).trim();
  return (
    (validKioskId(requestedId)
      ? cookieValue(req, `${DEVICE_COOKIE_PREFIX}${requestedId}`)
      : "") || cookieValue(req, COOKIE_NAME)
  );
}
function kioskIdentityMatches(kioskId, requestedId) {
  return validKioskId(kioskId) && (!requestedId || requestedId === kioskId);
}

let sessionsReady;
async function ensureSessionSchema() {
  if (!sessionsReady)
    sessionsReady = pool.query(`CREATE TABLE IF NOT EXISTS kiosk_sessions (
      jti CHAR(36) PRIMARY KEY,kiosk_id VARCHAR(80) NOT NULL,expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,last_seen_at DATETIME NULL,
      INDEX idx_kiosk_sessions_device (kiosk_id),INDEX idx_kiosk_sessions_expiry (expires_at)
    )`);
  await sessionsReady;
}

async function createKioskToken(kioskId) {
  await ensureSessionSchema();
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const token = signKioskToken(kioskId, jti);
  await pool.query(
    "INSERT INTO kiosk_sessions (jti,kiosk_id,expires_at,last_seen_at) VALUES (?,?,?,NOW())",
    [jti, kioskId, expiresAt],
  );
  return token;
}

function signKioskToken(kioskId, jti) {
  return jwt.sign({ sub: kioskId, type: "kiosk", jti }, getJwtSecret(), {
    expiresIn: "30d",
    issuer: "taptrack",
    audience: "taptrack-kiosk",
  });
}
function setKioskCookie(req, res, token, kioskId) {
  const options = {
    httpOnly: true,
    sameSite: "strict",
    secure: Boolean(req.secure),
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: cookiePath,
  };
  res.cookie(`${DEVICE_COOKIE_PREFIX}${kioskId}`, token, options);
  // Retain one generic cookie for profile images and migration from older builds.
  res.cookie(COOKIE_NAME, token, options);
}
async function requireKioskSession(req, res, next) {
  try {
    const token = tokenFrom(req);
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: "taptrack",
      audience: "taptrack-kiosk",
    });
    if (decoded.type !== "kiosk" || !validKioskId(decoded.sub))
      throw new Error("Invalid kiosk enrollment.");
    const requestedId = String(
      req.body?.kioskId || req.query?.kioskId || "",
    ).trim();
    await ensureSessionSchema();
    if (!kioskIdentityMatches(decoded.sub, requestedId)) {
      return res
        .status(403)
        .json({ message: "This enrollment belongs to another kiosk." });
    }
    if (!decoded.jti) {
      const existing = await require("../kiosk-management/kiosk.model").getById(
        decoded.sub,
      );
      if (existing?.isEnabled === 0)
        throw new Error("Kiosk enrollment is revoked.");
      const migratedToken = await createKioskToken(decoded.sub);
      req.kioskAuthenticated = true;
      req.kioskId = decoded.sub;
      setKioskCookie(req, res, migratedToken, decoded.sub);
      return next();
    }
    const [[session]] = await pool.query(
      "SELECT s.jti,k.is_enabled isEnabled FROM kiosk_sessions s LEFT JOIN kiosks k ON k.id=s.kiosk_id WHERE s.jti=? AND s.kiosk_id=? AND s.revoked_at IS NULL AND s.expires_at>NOW() LIMIT 1",
      [decoded.jti, decoded.sub],
    );
    if (!session || session.isEnabled === 0)
      throw new Error("Kiosk enrollment is revoked.");
    req.kioskAuthenticated = true;
    req.kioskId = decoded.sub;
    const usesHeader = String(req.get("authorization") || "").startsWith(
      "Kiosk ",
    );
    const rollingExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await pool.query(
      "UPDATE kiosk_sessions SET last_seen_at=NOW(),expires_at=? WHERE jti=?",
      [rollingExpiry, decoded.jti],
    );
    if (!usesHeader) {
      const refreshedToken = signKioskToken(decoded.sub, decoded.jti);
      setKioskCookie(req, res, refreshedToken, decoded.sub);
    }
    next();
  } catch (_error) {
    return res
      .status(401)
      .json({ message: "This kiosk must be verified by a Superadmin." });
  }
}

async function pairKiosk(req, res) {
  const kioskId = String(req.body?.kioskId || "").trim();
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!validKioskId(kioskId) || !username || !password)
    return res
      .status(400)
      .json({ message: "Enter the Superadmin username and password." });
  const user = await loginModel.findByUsername(username);
  const authorized =
    user?.role === "Superadmin" &&
    user.isActive &&
    user.permissionActive &&
    (await bcrypt.compare(password, user.passwordHash));
  if (!authorized) {
    await activityModel
      .record({
        userId: user?.id || null,
        actorName: user?.fullName || username || "Unknown user",
        actorUsername: user?.username || username || "unknown",
        action: "KIOSK_VERIFICATION_FAILED",
        module: "Kiosks",
        description: `Rejected verification for kiosk ${kioskId}.`,
        method: req.method,
        path: req.originalUrl,
      })
      .catch(() => {});
    return res
      .status(401)
      .json({ message: "Invalid Superadmin username or password." });
  }

  const existing = await require("../kiosk-management/kiosk.model").getById(
    kioskId,
  );
  if (existing?.isEnabled === 0)
    return res
      .status(403)
      .json({ message: "This kiosk has been disabled by an administrator." });

  const token = await createKioskToken(kioskId);
  setKioskCookie(req, res, token, kioskId);
  await activityModel.record({
    userId: user.id,
    actorName: user.fullName,
    actorUsername: user.username,
    action: "KIOSK_VERIFIED",
    module: "Kiosks",
    description: `Verified kiosk ${kioskId} for this browser.`,
    method: req.method,
    path: req.originalUrl,
  });
  res.json({ verified: true, ...(req.body?.agent === true ? { token } : {}) });
}

module.exports = {
  requireKioskSession,
  pairKiosk,
  createKioskToken,
  validKioskId,
  kioskIdentityMatches,
  ensureSessionSchema,
};
