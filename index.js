require("dotenv").config();
const express = require("express"),
  fs = require("fs"),
  https = require("https"),
  path = require("path");
const { basePath, publicPath } = require("./config/public-path");
const {
  checkSession,
  checkPageSession,
  requireAdmin,
  requireSuperadmin,
  requireAccess,
  requireMaintenance,
  requireAnyMaintenance,
  hasMaintenanceModule,
  requirePeopleRead,
  visiblePeopleModules,
  getJwtSecret,
} = require("./auth/auth_validation");
const {
  asyncHandler,
  apiNotFound,
  apiErrorHandler,
} = require("./api/middleware/api_standards");

const morgan = require("morgan");

morgan.token("manila-date", () => {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return `${get("day")}/${get("month")}/${get("year")}:${get("hour")}:${get("minute")}:${get("second")} +0800`;
});

morgan.token("client-ip", (req) => {
  let ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "";

  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }

  if (ip === "::1") {
    ip = "127.0.0.1";
  }

  return ip;
});

const app = express(),
  port = Number(process.env.PORT) || 4000,
  httpsPort = Number(process.env.HTTPS_PORT) || 4443,
  client = path.join(__dirname, "client");
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use((req, _res, next) => {
  if (basePath && (req.url === basePath || req.url.startsWith(`${basePath}/`)))
    req.url = req.url.slice(basePath.length) || "/";
  next();
});
function secureWebServer() {
  const pfxPath = String(process.env.HTTPS_PFX_PATH || "").trim();
  const certPath = String(process.env.HTTPS_CERT_PATH || "").trim();
  const keyPath = String(process.env.HTTPS_KEY_PATH || "").trim();
  if (pfxPath) {
    const options = {
      pfx: fs.readFileSync(path.resolve(pfxPath)),
      passphrase: String(process.env.HTTPS_PFX_PASSPHRASE || ""),
    };
    return https.createServer(options, app);
  }
  if (Boolean(certPath) !== Boolean(keyPath))
    throw new Error("Configure both HTTPS_CERT_PATH and HTTPS_KEY_PATH.");
  if (!certPath) return null;
  const options = {
    cert: fs.readFileSync(path.resolve(certPath)),
    key: fs.readFileSync(path.resolve(keyPath)),
  };
  const caPath = String(process.env.HTTPS_CA_PATH || "").trim();
  if (caPath) options.ca = fs.readFileSync(path.resolve(caPath));
  return https.createServer(options, app);
}
const scannerBridge = require("./scanner/scanner-bridge");
const {
  requireKioskSession,
  pairKiosk,
} = require("./api/middleware/kiosk_auth");
const rateLimit = require("./api/middleware/rate_limit");
app.use(
  morgan(
    ':client-ip - :remote-user [:manila-date] ":method :url HTTP/:http-version" :status :res[content-length]',
  ),
);
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_INSECURE_HTTP === "true" ||
    req.secure
  )
    return next();
  if (["GET", "HEAD"].includes(req.method))
    return res.redirect(
      308,
      `https://${req.hostname}${httpsPort === 443 ? "" : `:${httpsPort}`}${req.originalUrl}`,
    );
  return res.status(426).json({ message: "HTTPS is required." });
});
app.use(express.json({ limit: "10mb" }));
app.use((_req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    const prefixUrls = (value) => {
      if (typeof value === "string")
        return /^\/(?:uploads|client)\//.test(value)
          ? publicPath(value)
          : value;
      if (Array.isArray(value)) return value.map(prefixUrls);
      if (
        value &&
        typeof value === "object" &&
        Object.getPrototypeOf(value) === Object.prototype
      )
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, prefixUrls(item)]),
        );
      return value;
    };
    return json(prefixUrls(body));
  };
  next();
});
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), geolocation=(), microphone=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
  if (req.secure)
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  next();
});

const loginRouter = require("./api/login/login.router");
const attendanceRouter = require("./api/attendance/attendance.router");
const studentRouter = require("./api/maintenance/student/student.router");
const alumniRouter = require("./api/maintenance/alumni/alumni.router");
const employeeRouter = require("./api/maintenance/employee/employee.router");
const settingsRouter = require("./api/maintenance/settings/settings.router");
const userRouter = require("./api/user/user_management/user_management.router");
const permissionRouter = require("./api/user/permission/permission.router");
const eventRouter = require("./api/events/event.router");
const schoolRouter = require("./api/maintenance/school/school.router");
const collegeRouter = require("./api/maintenance/college/college.router");
const departmentRouter = require("./api/maintenance/department/department.router");
const employeeDepartmentRouter = require("./api/maintenance/employee_department/employee_department.router");
const gateRouter = require("./api/maintenance/gate/gate.router");
const programRouter = require("./api/maintenance/program/program.router");
const sectionRouter = require("./api/maintenance/section/section.router");
const activityLogRouter = require("./api/user/activity_log/activity_log.router");
const academicPeriodRouter = require("./api/maintenance/academic_period/academic_period.router");
const historyRouter = require("./api/history/history.router");
const libraryRouter = require("./api/library/library.router");
const personLogsRouter = require("./api/person_logs/person_logs.router");
const analyticsRouter = require("./api/analytics/analytics.router");
const kioskManagementRouter = require("./api/kiosk-management/kiosk.router");
const kioskManagement = require("./api/kiosk-management/kiosk.controller");
app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: "Too many sign-in attempts. Try again later.",
  }),
);
app.use("/api/auth/setup", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 }));
app.use("/api/auth", asyncHandler(loginRouter));
app.post(
  "/api/kiosk/pair",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: "Too many verification attempts. Try again later.",
  }),
  asyncHandler(pairKiosk),
);
app.use(
  ["/api/kiosk", "/api/library-kiosk"],
  asyncHandler(requireKioskSession),
);
app.use(
  ["/api/kiosk/scan", "/api/library-kiosk"],
  rateLimit({ windowMs: 60 * 1000, limit: 120 }),
);
app.use(
  "/api/kiosk/screenshots",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    message: "Too many screenshot uploads. Try again later.",
  }),
);
app.post("/api/kiosk/heartbeat", asyncHandler(kioskManagement.heartbeat));
app.get("/api/kiosk/config", asyncHandler(kioskManagement.config));
app.post(
  "/api/kiosk/commands/poll",
  asyncHandler(kioskManagement.pollCommands),
);
app.post(
  "/api/kiosk/commands/complete",
  asyncHandler(kioskManagement.completeCommand),
);
app.post(
  "/api/kiosk/screenshots",
  asyncHandler(kioskManagement.saveScreenshot),
);
app.post(
  "/api/kiosk/scan",
  asyncHandler((req, res) => {
    req.body.eventId = null;
    return require("./api/attendance/attendance.controller").scan(req, res);
  }),
);
app.get(
  "/api/kiosk/scans",
  asyncHandler(require("./api/attendance/attendance.controller").kioskRecent),
);
app.get("/api/kiosk/scanners", (_req, res) => res.json(scannerBridge.status()));
app.get(
  "/api/kiosk/gates",
  asyncHandler(async (_req, res) =>
    res.json(
      await require("./api/maintenance/gate/gate.model").getAll({
        activeOnly: true,
      }),
    ),
  ),
);
app.post(
  "/api/library-kiosk/:location/scan",
  asyncHandler(require("./api/library/library.controller").scan),
);
app.get(
  "/api/library-kiosk/:location/scans",
  asyncHandler(require("./api/library/library.controller").recent),
);
app.get("/api/kiosk/scanners/events", (req, res) =>
  require("./scanner/scanner-events").subscribe(scannerBridge, req, res),
);
app.get("/api/kiosk/scanners/lookup", (req, res) =>
  require("./scanner/scanner-events").lookup(scannerBridge, req, res),
);
app.use("/api", checkSession);
app.use("/api", require("./api/middleware/activity_log"));
app.post(
  "/api/bulk-import-summary",
  (req, res, next) => {
    const module = {
      student: "students",
      alumni: "alumni",
      employee: "employees",
      school: "schools",
      college: "colleges",
      department: "departments",
      program: "programs",
      section: "sections",
    }[String(req.body.type || "").toLowerCase()];
    return module && hasMaintenanceModule(req.user, module)
      ? next()
      : res.status(403).json({
          success: 0,
          message: "You do not have access to this maintenance area.",
        });
  },
  asyncHandler(require("./api/maintenance/import-summary.controller").create),
);
app.get(
  "/api/current-academic-period",
  asyncHandler(async (_req, res) =>
    res.json(
      await require("./api/maintenance/academic_period/academic_period.model").getCurrent(),
    ),
  ),
);
app.use(
  "/api/attendance",
  requireAccess("attendanceAccess"),
  wrapRouter(attendanceRouter),
);
app.use(
  "/api/events",
  requireAccess("specialEventsAccess"),
  wrapRouter(eventRouter),
);
app.use(
  "/api/history",
  requireAccess("specialEventsAccess"),
  wrapRouter(historyRouter),
);
app.use(
  "/api/library",
  requireAccess("libraryAccess"),
  wrapRouter(libraryRouter),
);
app.use(
  "/api/person-logs",
  requireAnyMaintenance("students", "alumni", "employees"),
  wrapRouter(personLogsRouter),
);
app.use(
  "/api/card-enrollment",
  requireMaintenance("cardEnrollment"),
  wrapRouter(require("./api/maintenance/student/card-enrollment.router")),
);
app.use(
  "/api/student",
  requireMaintenance("students"),
  wrapRouter(studentRouter),
);
app.use("/api/alumni", requireMaintenance("alumni"), wrapRouter(alumniRouter));
app.use(
  "/api/employee",
  requireMaintenance("employees"),
  wrapRouter(employeeRouter),
);
app.use(
  "/api/settings",
  requireMaintenance("settings"),
  wrapRouter(settingsRouter),
);
app.use(
  "/api/school",
  requireMaintenance("schools", { readFor: ["colleges"] }),
  wrapRouter(schoolRouter),
);
app.use(
  "/api/college",
  requireMaintenance("colleges", { readFor: ["departments"] }),
  wrapRouter(collegeRouter),
);
app.use(
  "/api/department",
  requireMaintenance("departments", { readFor: ["programs"] }),
  wrapRouter(departmentRouter),
);
app.get(
  "/api/employee_department",
  requireAnyMaintenance("employeeDepartments", "employees"),
  asyncHandler(async (_req, res) =>
    res.json(
      await require("./api/maintenance/academic/academic.model").getAll(
        "employee_department",
      ),
    ),
  ),
);
app.use(
  "/api/employee_department",
  requireMaintenance("employeeDepartments", { readFor: ["employees"] }),
  wrapRouter(employeeDepartmentRouter),
);
app.use(
  "/api/analytics",
  (req, res, next) => {
    if (
      req.user?.role === "Superadmin" ||
      (req.user?.overviewAccess && req.user?.attendanceAccess) ||
      req.user?.libraryAccess
    )
      return next();
    return res.status(403).json({
      success: 0,
      message:
        "Analytics requires Overview and Attendance access, or Library access.",
    });
  },
  wrapRouter(analyticsRouter),
);
app.use(
  "/api/gate",
  requireMaintenance("gates", { readFor: ["kiosks"] }),
  wrapRouter(gateRouter),
);
app.use(
  "/api/kiosks",
  requireMaintenance("kiosks"),
  wrapRouter(kioskManagementRouter),
);
app.use(
  "/api/program",
  requireMaintenance("programs"),
  wrapRouter(programRouter),
);
app.use(
  "/api/section",
  requireMaintenance("sections"),
  wrapRouter(sectionRouter),
);
app.use(
  "/api/academic-periods",
  requireMaintenance("academicPeriods"),
  wrapRouter(academicPeriodRouter),
);
app.get(
  "/api/program-options",
  requireAnyMaintenance("programs", "students", "alumni"),
  asyncHandler(async (_req, res) =>
    res.json(
      await require("./api/maintenance/academic/academic.model").getAll(
        "program",
      ),
    ),
  ),
);
app.get(
  "/api/section-options",
  requireAnyMaintenance("sections", "students", "alumni"),
  asyncHandler(async (_req, res) =>
    res.json(await require("./api/maintenance/section/section.model").getAll()),
  ),
);
app.use("/api/user", requireAccess("usersAccess"), wrapRouter(userRouter));
app.use("/api/permissions", requireSuperadmin, wrapRouter(permissionRouter));
app.use(
  "/api/activity-log",
  requireAccess("usersAccess"),
  wrapRouter(activityLogRouter),
);
app.get(
  "/api/people",
  requirePeopleRead,
  asyncHandler(async (req, res) => {
    const loaders = [];
    const visibleModules = visiblePeopleModules(req.user);
    if (visibleModules.includes("students"))
      loaders.push(require("./api/maintenance/student/student.model").getAll());
    if (visibleModules.includes("alumni"))
      loaders.push(require("./api/maintenance/alumni/alumni.model").getAll());
    if (visibleModules.includes("employees"))
      loaders.push(
        require("./api/maintenance/employee/employee.model").getAll(),
      );
    res.json((await Promise.all(loaders)).flat());
  }),
);
app.post(
  "/api/people",
  (req, res, next) => {
    const module = {
      Student: "students",
      Alumnus: "alumni",
      Employee: "employees",
    }[req.body.type];
    return module
      ? requireMaintenance(module)(req, res, next)
      : res.status(400).json({ message: "Choose a valid person type." });
  },
  asyncHandler((req, res) => {
    if (req.body.type === "Student")
      return require("./api/maintenance/student/student.controller").create(
        req,
        res,
      );
    if (req.body.type === "Alumnus")
      return require("./api/maintenance/alumni/alumni.controller").create(
        req,
        res,
      );
    return require("./api/maintenance/employee/employee.controller").create(
      req,
      res,
    );
  }),
);
app.delete(
  "/api/people/:type/:id",
  (req, res, next) => {
    const module =
      req.params.type === "Student"
        ? "students"
        : req.params.type === "Alumnus"
          ? "alumni"
          : req.params.type === "Employee"
            ? "employees"
            : null;
    return module
      ? requireMaintenance(module)(req, res, next)
      : res.status(400).json({ message: "Choose a valid person type." });
  },
  asyncHandler((req, res) => {
    return ["Student", "Alumnus"].includes(req.params.type)
      ? res.status(405).json({
          message:
            "Student and alumni records cannot be deleted. Deactivate the record instead.",
        })
      : require("./api/maintenance/employee/employee.controller").remove(
          req,
          res,
        );
  }),
);
app.get("/api/users", (req, res) => res.redirect(307, publicPath("/api/user")));
app.post("/api/users", (req, res) =>
  res.redirect(307, publicPath("/api/user")),
);
app.put("/api/users/:id", (req, res) =>
  res.redirect(307, publicPath(`/api/user/${req.params.id}`)),
);
app.patch("/api/users/:id/status", (req, res) =>
  res.redirect(307, publicPath(`/api/user/${req.params.id}/status`)),
);
app.use("/api", apiNotFound);

app.use(
  "/client",
  (req, res, next) =>
    req.path.endsWith(".html") ? res.status(404).end() : next(),
  express.static(client),
);
app.use(
  "/uploads/profile-photos",
  (req, res, next) =>
    String(req.get("cookie") || "").includes("taptrack_kiosk_session=") ||
    String(req.get("authorization") || "").startsWith("Kiosk ")
      ? requireKioskSession(req, res, next)
      : checkSession(req, res, next),
  express.static(path.join(__dirname, "uploads", "profile-photos"), {
    fallthrough: false,
    maxAge: "1h",
  }),
);
app.use(
  "/uploads/kiosk-screenshots",
  checkSession,
  express.static(path.join(__dirname, "uploads", "kiosk-screenshots"), {
    fallthrough: false,
    maxAge: "1h",
  }),
);
app.use(
  "/vendor/datatables",
  express.static(path.join(__dirname, "node_modules", "datatables.net")),
  express.static(path.join(__dirname, "node_modules", "datatables.net-dt")),
);
app.use(
  "/vendor/datatables-responsive",
  express.static(
    path.join(__dirname, "node_modules", "datatables.net-responsive-dt"),
  ),
);
app.use(
  "/vendor/xlsx",
  express.static(path.join(__dirname, "node_modules", "xlsx", "dist")),
);
app.use(
  "/vendor/zxing",
  express.static(
    path.join(__dirname, "node_modules", "@zxing", "browser", "umd"),
  ),
);
app.use(
  "/vendor/material-symbols",
  express.static(path.join(__dirname, "node_modules", "material-symbols")),
);
const pageCache = new Map();
const sendPage =
  (file, { sidebar = false } = {}) =>
  async (_req, res, next) => {
    try {
      const filename = path.join(client, file);
      const cacheKey = `${filename}:${sidebar}`;
      let html = pageCache.get(cacheKey);
      if (!html || process.env.NODE_ENV !== "production") {
        html = await fs.promises.readFile(filename, "utf8");
        if (sidebar) {
          const navigation = await fs.promises.readFile(
            path.join(client, "sidebar.html"),
            "utf8",
          );
          html = html.replace(
            /<div\s+id="sidebarMount"\s*><\/div>/i,
            `<div id="sidebarMount">${navigation}</div>`,
          );
        }
        html = html
          .replace(
            /\/client\/page-shell\.css"/g,
            '/client/page-shell.css?v=20260925-5"',
          )
          .replace(
            /\/client\/shared-ui\.js"/g,
            '/client/shared-ui.js?v=20260925-4"',
          )
          .replace(
            /\b(href|src|action)="\/(?!\/)/gi,
            (_match, attribute) => `${attribute}="${basePath}/`,
          )
          .replace(
            /<head(\s[^>]*)?>/i,
            (head) =>
              `${head}<script src="${publicPath("/client/base-path.js")}"></script>`,
          );
        if (process.env.NODE_ENV === "production")
          pageCache.set(cacheKey, html);
      }
      res.type("html").send(html);
    } catch (error) {
      next(error);
    }
  };
app.get("/", sendPage("index.html"));
app.get("/login", sendPage("login/index.html"));
app.get("/setup", sendPage("login/setup.html"));
app.get("/kiosk", (_req, res) =>
  res.redirect(302, publicPath("/kiosk/entrance")),
);
app.get("/kiosk/entrance", sendPage("kiosk/index.html"));
app.get("/kiosk/library", sendPage("library-kiosk/index.html"));
app.get("/kiosk/internet-section", sendPage("library-kiosk/index.html"));
app.get("/sidebar.html", checkSession, sendPage("sidebar.html"));
const protectedPage = (file) => [
  checkPageSession,
  sendPage(file, { sidebar: true }),
];
const adminPage = protectedPage;
const maintenancePage = (module, file) => [
  checkPageSession,
  (req, res, next) => {
    if (hasMaintenanceModule(req.user, module)) return next();
    const maintenanceRoutes = {
        cardEnrollment: "/maintenance/card-enrollment",
        students: "/maintenance/student",
        alumni: "/maintenance/alumni",
        employees: "/maintenance/employee",
        schools: "/maintenance/school",
        colleges: "/maintenance/college",
        departments: "/maintenance/department",
        employeeDepartments: "/maintenance/employee-department",
        programs: "/maintenance/program",
        sections: "/maintenance/sections",
        gates: "/maintenance/gates",
        kiosks: "/maintenance/kiosks",
        academicPeriods: "/maintenance/academic-periods",
        settings: "/maintenance/settings",
      },
      maintenanceFallback = (req.user.maintenanceModules || [])
        .map((item) => maintenanceRoutes[item])
        .find(Boolean),
      fallback = req.user.overviewAccess
        ? "/overview"
        : req.user.attendanceAccess
          ? "/attendance"
          : req.user.specialEventsAccess
            ? "/events"
            : req.user.libraryAccess
              ? "/library/entrance"
              : maintenanceFallback ||
                (req.user.usersAccess ? "/user/user-management" : "/login");
    return res.redirect(303, publicPath(fallback));
  },
  sendPage(file, { sidebar: true }),
];
app.get("/overview", protectedPage("dashboard/index.html"));
app.get("/analytics", protectedPage("analytics/index.html"));
app.get("/library/analytics", protectedPage("analytics/index.html"));
app.get(
  "/account/change-password",
  protectedPage("account/change-password/index.html"),
);
app.get("/attendance", protectedPage("attendance/index.html"));
app.get(
  "/maintenance/card-enrollment",
  maintenancePage("cardEnrollment", "maintenance/card-enrollment/index.html"),
);
app.get(
  "/maintenance/student",
  maintenancePage("students", "maintenance/student/index.html"),
);
app.get(
  "/maintenance/alumni",
  maintenancePage("alumni", "maintenance/alumni/index.html"),
);
app.get(
  "/maintenance/employee",
  maintenancePage("employees", "maintenance/employee/index.html"),
);
app.get("/events", adminPage("events/index.html"));
app.get("/events/:id/scan", adminPage("events/scan/index.html"));
app.get("/history", (_req, res) =>
  res.redirect(302, publicPath("/events/past")),
);
app.get("/events/past", adminPage("history/index.html"));
app.get("/library", (_req, res) =>
  res.redirect(publicPath("/library/entrance")),
);
app.get("/library/entrance", adminPage("library/index.html"));
app.get("/library/internet-section", adminPage("library/index.html"));
app.get(
  "/maintenance/settings",
  maintenancePage("settings", "maintenance/settings/index.html"),
);
app.get(
  "/maintenance/school",
  maintenancePage("schools", "maintenance/school/index.html"),
);
app.get(
  "/maintenance/college",
  maintenancePage("colleges", "maintenance/college/index.html"),
);
app.get(
  "/maintenance/department",
  maintenancePage("departments", "maintenance/department/index.html"),
);
app.get(
  "/maintenance/employee-department",
  maintenancePage(
    "employeeDepartments",
    "maintenance/employee_department/index.html",
  ),
);
app.get(
  "/maintenance/gates",
  maintenancePage("gates", "maintenance/gate/index.html"),
);
app.get(
  "/maintenance/kiosks",
  maintenancePage("kiosks", "maintenance/kiosk/index.html"),
);
app.get(
  "/maintenance/program",
  maintenancePage("programs", "maintenance/program/index.html"),
);
app.get(
  "/maintenance/sections",
  maintenancePage("sections", "maintenance/section/index.html"),
);
app.get(
  "/maintenance/academic-periods",
  maintenancePage("academicPeriods", "maintenance/academic_period/index.html"),
);
app.get("/user/user-management", adminPage("user/user_management/index.html"));
app.get("/user/permissions", adminPage("user/permission/index.html"));
app.get("/user/activity-log", adminPage("user/activity_log/index.html"));
app.get("/portal.css", (_req, res) =>
  res.sendFile(path.join(client, "login", "style.css")),
);
app.get("/auth.js", (_req, res) =>
  res.sendFile(path.join(client, "login", "script.js")),
);
app.use(apiErrorHandler);
const runtimeServers = [];
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  // Let in-flight enrollment writes finish before closing the Python worker.
  const deadline = setTimeout(() => process.exit(1), 20000);
  Promise.all(runtimeServers.map((server) => new Promise((resolve) => {
    server.close(resolve);
    server.closeIdleConnections?.();
  }))).then(() => require("./db/db").end()).then(() => {
    clearTimeout(deadline);
    process.exit(0);
  }).catch((error) => {
    console.error("Shutdown failed:", error.message);
    process.exit(1);
  });
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.on("message", (message) => { if (message === "shutdown") shutdown(); });
require("./api/maintenance/employee/employee.model")
  .ensureSchema()
  .then(() => require("./api/maintenance/alumni/alumni.model").ensureSchema())
  .then(() => require("./db/indexes").ensureIndexes())
  .then(() => {
    getJwtSecret();
    runtimeServers.push(app.listen(port, () =>
      console.log(`TapTrack HTTP running at http://localhost:${port}`),
    ));
    const secureServer = secureWebServer();
    if (secureServer) {
      if (httpsPort === port)
        throw new Error("HTTPS_PORT must be different from PORT.");
      runtimeServers.push(secureServer.listen(httpsPort, () =>
        console.log(`TapTrack HTTPS running at https://localhost:${httpsPort}`),
      ));
    }
  })
  .catch((error) => {
    const details =
      error?.message ||
      error?.code ||
      error?.errors
        ?.map((item) => item.message)
        .filter(Boolean)
        .join("; ") ||
      String(error);
    console.error("Database initialization failed:", details);
    process.exitCode = 1;
  });
function wrapRouter(router) {
  router.stack.forEach((layer) => {
    if (layer.route)
      layer.route.stack.forEach((handler) => {
        handler.handle = asyncHandler(handler.handle);
      });
  });
  return router;
}
