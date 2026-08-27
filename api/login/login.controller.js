const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const model = require("./login.model");
const activityModel = require("../user/activity_log/activity_log.model");
const { createToken } = require("../../auth/auth_validation");
const googleConfig = (req) => ({
  clientId: String(process.env.GOOGLE_CLIENT_ID || "").trim(),
  clientSecret: String(process.env.GOOGLE_CLIENT_SECRET || "").trim(),
  domain: String(process.env.GOOGLE_WORKSPACE_DOMAIN || "")
    .trim()
    .toLowerCase(),
  redirectUri: String(
    process.env.GOOGLE_REDIRECT_URI ||
      `${req.protocol}://${req.get("host")}/api/auth/google/callback`,
  ).trim(),
});
const googleEnabled = (config) =>
  Boolean(config.clientId && config.clientSecret && config.domain);
const cookieValue = (req, name) =>
  String(req.get("cookie") || "")
    .split(";")
    .map((value) => value.trim().split("="))
    .find(([key]) => key === name)
    ?.slice(1)
    .join("=") || "";
const sessionFor = (user) => ({
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
});
const logAuth = async (req, user, action, description) => {
  try {
    await activityModel.record({
      userId: user?.id,
      actorName: user?.fullName || String(req.body?.username || "Unknown user"),
      actorUsername: user?.username || String(req.body?.username || "unknown"),
      action,
      module: "Authentication",
      description,
      method: req.method,
      path: req.originalUrl,
    });
  } catch (error) {
    console.error("Unable to write authentication log:", error.message);
  }
};

exports.login = async (req, res) => {
  const user = await model.findByUsername(
    String(req.body.username || "").trim(),
  );
  if (
    !user ||
    !user.isActive ||
    !user.permissionActive ||
    !(await bcrypt.compare(String(req.body.password || ""), user.passwordHash))
  ) {
    await logAuth(req, user, "LOGIN_FAILED", "Failed to sign in.");
    return res
      .status(401)
      .json({ success: 0, message: "Invalid username or password." });
  }
  const session = {
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
  await logAuth(req, user, "LOGGED_IN", "Signed in to the system.");
  res.json({ ...session, token: createToken(session) });
};
exports.googleStatus = (req, res) =>
  res.json({ enabled: googleEnabled(googleConfig(req)) });
exports.googleStart = (req, res) => {
  const config = googleConfig(req);
  if (!googleEnabled(config))
    return res
      .status(503)
      .json({ message: "Google sign-in is not configured." });
  const nonce = crypto.randomBytes(24).toString("hex"),
    state = jwt.sign(
      { nonce, type: "google-oauth" },
      process.env.JWT_SECRET || "development-only-change-me",
      {
        expiresIn: "10m",
        issuer: "taptrack",
        audience: "taptrack-google-oauth",
      },
    ),
    secure = req.secure || process.env.NODE_ENV === "production";
  res.cookie("taptrack_google_state", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 600000,
    path: "/api/auth/google",
  });
  const client = new OAuth2Client(
    config.clientId,
    config.clientSecret,
    config.redirectUri,
  );
  res.redirect(
    client.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
      hd: config.domain,
      prompt: "select_account",
    }),
  );
};
exports.googleCallback = async (req, res) => {
  const config = googleConfig(req),
    fail = (message) =>
      res.redirect(`/login?google_error=${encodeURIComponent(message)}`);
  if (!googleEnabled(config)) return fail("Google sign-in is not configured.");
  try {
    const state = jwt.verify(
      String(req.query.state || ""),
      process.env.JWT_SECRET || "development-only-change-me",
      { issuer: "taptrack", audience: "taptrack-google-oauth" },
    );
    if (
      !state.nonce ||
      state.nonce !== cookieValue(req, "taptrack_google_state")
    )
      return fail("Google sign-in request expired. Please try again.");
    res.clearCookie("taptrack_google_state", { path: "/api/auth/google" });
    const client = new OAuth2Client(
        config.clientId,
        config.clientSecret,
        config.redirectUri,
      ),
      { tokens } = await client.getToken(String(req.query.code || "")),
      ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.clientId,
      }),
      payload = ticket.getPayload(),
      email = String(payload?.email || "").toLowerCase(),
      hostedDomain = String(payload?.hd || "").toLowerCase();
    if (!payload?.email_verified || hostedDomain !== config.domain)
      return fail("Use an authorized institutional Google account.");
    const user = await model.findByInstitutionalEmail(email);
    if (!user || !user.isActive || !user.permissionActive) {
      await logAuth(
        req,
        user || { fullName: email, username: email },
        "GOOGLE_LOGIN_FAILED",
        "Google sign-in was rejected because no active local account matched.",
      );
      return fail(
        "No active TapTrack account is linked to this institutional email.",
      );
    }
    const session = sessionFor(user);
    await logAuth(
      req,
      user,
      "GOOGLE_LOGIN",
      "Signed in with Google Workspace.",
    );
    res.redirect(
      `/login#sso_token=${encodeURIComponent(createToken(session))}`,
    );
  } catch (error) {
    console.error("Google sign-in failed:", error.message);
    return fail("Google sign-in could not be completed. Please try again.");
  }
};
exports.me = (req, res) => res.json(req.user);
exports.logout = async (req, res) => {
  await logAuth(req, req.user, "LOGGED_OUT", "Signed out of the system.");
  res.status(204).end();
};
exports.setupStatus = async (_req, res) =>
  res.json({ required: (await model.countUsers()) === 0 });
exports.setup = async (req, res) => {
  if (await model.countUsers())
    return res.status(403).json({ message: "Initial setup is complete." });
  const { fullName, username, password } = req.body;
  if (!fullName?.trim() || !username?.trim() || String(password).length < 8)
    return res.status(400).json({
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
  await logAuth(
    req,
    session,
    "ACCOUNT_SETUP",
    "Created the initial system account.",
  );
  res.status(201).json({ ...session, token: createToken(session) });
};
