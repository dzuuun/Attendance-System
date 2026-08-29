require("dotenv").config();
const express = require("express"),
  path = require("path");
const {
  checkSession,
  requireAdmin,
  requireAccess,
  requirePeopleAccess,
} = require("./auth/auth_validation");
const {
  asyncHandler,
  apiNotFound,
  apiErrorHandler,
} = require("./api/middleware/api_standards");
const morgan = require("morgan");
const app = express(),
  port = Number(process.env.PORT) || 3000,
  client = path.join(__dirname, "client");
const scannerBridge = require("./scanner/scanner-bridge");
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

const loginRouter = require("./api/login/login.router");
const attendanceRouter = require("./api/attendance/attendance.router");
const studentRouter = require("./api/maintenance/student/student.router");
const employeeRouter = require("./api/maintenance/employee/employee.router");
const settingsRouter = require("./api/maintenance/settings/settings.router");
const userRouter = require("./api/user/user_management/user_management.router");
const permissionRouter = require("./api/user/permission/permission.router");
const eventRouter = require("./api/events/event.router");
const schoolRouter = require("./api/maintenance/school/school.router");
const collegeRouter = require("./api/maintenance/college/college.router");
const departmentRouter = require("./api/maintenance/department/department.router");
const employeeDepartmentRouter = require("./api/maintenance/employee_department/employee_department.router");
const programRouter = require("./api/maintenance/program/program.router");
const activityLogRouter = require("./api/user/activity_log/activity_log.router");
const academicPeriodRouter = require("./api/maintenance/academic_period/academic_period.router");
const historyRouter = require("./api/history/history.router");
const libraryRouter = require("./api/library/library.router");
const personLogsRouter = require("./api/person_logs/person_logs.router");
app.use("/api/auth", asyncHandler(loginRouter));
// Public kiosk access is intentionally limited to daily entrance scans.
app.post(
  "/api/kiosk/scan",
  asyncHandler((req, res) => {
    req.body.eventId = null;
    return require("./api/attendance/attendance.controller").scan(req, res);
  }),
);
app.get("/api/kiosk/scanners", (_req, res) => res.json(scannerBridge.status()));
app.post(
  "/api/library-kiosk/:location/scan",
  asyncHandler(require("./api/library/library.controller").scan),
);
app.post("/api/kiosk/scanners/pair", (req, res) => {
  res.status(410).json({
    message: "Scanner assignments are configured locally on each kiosk terminal.",
  });
});
app.get("/api/kiosk/scanners/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (event, value) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
  const status = () => send("status", scannerBridge.status());
  const scan = (value) => send("scan", value);
  const assigned = (value) => send("assigned", value);
  const unassigned = (value) => send("unassigned", value);
  scannerBridge.on("status", status);
  scannerBridge.on("scan", scan);
  scannerBridge.on("assigned", assigned);
  scannerBridge.on("unassigned", unassigned);
  status();
  req.on("close", () => {
    scannerBridge.off("status", status);
    scannerBridge.off("scan", scan);
    scannerBridge.off("assigned", assigned);
    scannerBridge.off("unassigned", unassigned);
  });
});
app.use("/api", checkSession);
app.use("/api", require("./api/middleware/activity_log"));
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
  (req, res, next) => {
    if (req.user?.role === "Superadmin" || req.user?.maintenanceAccess)
      return next();
    const type = req.path.split("/").filter(Boolean)[0];
    return requirePeopleAccess(type === "employee" ? "Employees" : "Students")(
      req,
      res,
      next,
    );
  },
  wrapRouter(personLogsRouter),
);
app.use(
  "/api/student",
  requirePeopleAccess("Students"),
  wrapRouter(studentRouter),
);
app.use(
  "/api/employee",
  requirePeopleAccess("Employees"),
  wrapRouter(employeeRouter),
);
app.use(
  "/api/settings",
  requireAccess("maintenanceAccess"),
  wrapRouter(settingsRouter),
);
app.use(
  "/api/school",
  requireAccess("maintenanceAccess"),
  wrapRouter(schoolRouter),
);
app.use(
  "/api/college",
  requireAccess("maintenanceAccess"),
  wrapRouter(collegeRouter),
);
app.use(
  "/api/department",
  requireAccess("maintenanceAccess"),
  wrapRouter(departmentRouter),
);
app.get(
  "/api/employee_department",
  requirePeopleAccess("Employees"),
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
  requireAccess("maintenanceAccess"),
  requirePeopleAccess("Employees"),
  wrapRouter(employeeDepartmentRouter),
);
app.use(
  "/api/program",
  requireAccess("maintenanceAccess"),
  wrapRouter(programRouter),
);
app.use(
  "/api/academic-periods",
  requireAccess("maintenanceAccess"),
  wrapRouter(academicPeriodRouter),
);
app.get(
  "/api/program-options",
  requirePeopleAccess("Students"),
  asyncHandler(async (_req, res) =>
    res.json(
      await require("./api/maintenance/academic/academic.model").getAll(
        "program",
      ),
    ),
  ),
);
app.use("/api/user", requireAccess("usersAccess"), wrapRouter(userRouter));
app.use(
  "/api/permissions",
  requireAccess("usersAccess"),
  wrapRouter(permissionRouter),
);
app.use(
  "/api/activity-log",
  requireAccess("usersAccess"),
  wrapRouter(activityLogRouter),
);
app.get(
  "/api/people",
  requireAccess("maintenanceAccess"),
  asyncHandler(async (req, res) => {
    const scope =
      req.user.role === "Superadmin" ? "Both" : req.user.peopleAccess;
    if (scope === "Students")
      return res.json(
        await require("./api/maintenance/student/student.model").getAll(),
      );
    if (scope === "Employees")
      return res.json(
        await require("./api/maintenance/employee/employee.model").getAll(),
      );
    const [students, employees] = await Promise.all([
      require("./api/maintenance/student/student.model").getAll(),
      require("./api/maintenance/employee/employee.model").getAll(),
    ]);
    res.json([...students, ...employees]);
  }),
);
app.post(
  "/api/people",
  requireAccess("maintenanceAccess"),
  asyncHandler((req, res) => {
    const type = req.body.type === "Student" ? "Students" : "Employees";
    if (
      req.user.role !== "Superadmin" &&
      req.user.peopleAccess !== "Both" &&
      req.user.peopleAccess !== type
    )
      return res
        .status(403)
        .json({
          message: `Your permission does not include ${type.toLowerCase()}.`,
        });
    return req.body.type === "Student"
      ? require("./api/maintenance/student/student.controller").create(req, res)
      : require("./api/maintenance/employee/employee.controller").create(
          req,
          res,
        );
  }),
);
app.delete(
  "/api/people/:type/:id",
  requireAccess("maintenanceAccess"),
  asyncHandler((req, res) => {
    const type = req.params.type === "Student" ? "Students" : "Employees";
    if (
      req.user.role !== "Superadmin" &&
      req.user.peopleAccess !== "Both" &&
      req.user.peopleAccess !== type
    )
      return res
        .status(403)
        .json({
          message: `Your permission does not include ${type.toLowerCase()}.`,
        });
    return req.params.type === "Student"
      ? res.status(405).json({
          message:
            "Student records cannot be deleted. Deactivate the record instead.",
        })
      : require("./api/maintenance/employee/employee.controller").remove(
          req,
          res,
        );
  }),
);
app.get("/api/users", (req, res) => res.redirect(307, "/api/user"));
app.post("/api/users", (req, res) => res.redirect(307, "/api/user"));
app.put("/api/users/:id", (req, res) =>
  res.redirect(307, `/api/user/${req.params.id}`),
);
app.patch("/api/users/:id/status", (req, res) =>
  res.redirect(307, `/api/user/${req.params.id}/status`),
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
  express.static(path.join(__dirname, "uploads", "profile-photos"), {
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
app.get("/", (_req, res) => res.sendFile(path.join(client, "index.html")));
app.get("/login", (_req, res) =>
  res.sendFile(path.join(client, "login", "index.html")),
);
app.get("/setup", (_req, res) =>
  res.sendFile(path.join(client, "login", "setup.html")),
);
app.get("/kiosk", (_req, res) => res.redirect(302, "/kiosk/entrance"));
app.get("/kiosk/entrance", (_req, res) =>
  res.sendFile(path.join(client, "kiosk", "index.html")),
);
app.get("/kiosk/library", (_req, res) =>
  res.sendFile(path.join(client, "library-kiosk", "index.html")),
);
app.get("/kiosk/internet-section", (_req, res) =>
  res.sendFile(path.join(client, "library-kiosk", "index.html")),
);
app.get("/sidebar.html", checkSession, (_req, res) =>
  res.sendFile(path.join(client, "sidebar.html")),
);
const protectedPage = (file) => (_req, res) =>
  res.sendFile(path.join(client, file));
const adminPage = protectedPage;
app.get("/app", protectedPage("dashboard/index.html"));
app.get(
  "/account/change-password",
  protectedPage("account/change-password/index.html"),
);
app.get("/attendance", protectedPage("attendance/index.html"));
app.get(
  "/maintenance/student",
  protectedPage("maintenance/student/index.html"),
);
app.get(
  "/maintenance/employee",
  protectedPage("maintenance/employee/index.html"),
);
app.get("/events", adminPage("events/index.html"));
app.get("/events/:id/scan", adminPage("events/scan/index.html"));
app.get("/history", adminPage("history/index.html"));
app.get("/library", (_req, res) => res.redirect("/library/entrance"));
app.get("/library/entrance", adminPage("library/index.html"));
app.get("/library/internet-section", adminPage("library/index.html"));
app.get("/maintenance/settings", adminPage("maintenance/settings/index.html"));
app.get("/maintenance/school", adminPage("maintenance/school/index.html"));
app.get("/maintenance/college", adminPage("maintenance/college/index.html"));
app.get(
  "/maintenance/department",
  adminPage("maintenance/department/index.html"),
);
app.get(
  "/maintenance/employee-department",
  adminPage("maintenance/employee_department/index.html"),
);
app.get("/maintenance/program", adminPage("maintenance/program/index.html"));
app.get(
  "/maintenance/academic-periods",
  adminPage("maintenance/academic_period/index.html"),
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
require("./api/maintenance/employee/employee.model")
  .ensureSchema()
  .then(() => require("./db/indexes").ensureIndexes())
  .catch((error) =>
    console.error("Database index setup failed:", error.message),
  )
  .finally(() =>
    app.listen(port, () =>
      console.log(`TapTrack running at http://localhost:${port}`),
    ),
  );
function wrapRouter(router) {
  router.stack.forEach((layer) => {
    if (layer.route)
      layer.route.stack.forEach((handler) => {
        handler.handle = asyncHandler(handler.handle);
      });
  });
  return router;
}
