require("dotenv").config();
const express = require("express"),
  path = require("path");
const { checkSession, requireAdmin } = require("./auth/auth_validation");
const {
  asyncHandler,
  apiNotFound,
  apiErrorHandler,
} = require("./api/middleware/api_standards");
const app = express(),
  port = Number(process.env.PORT) || 3000,
  client = path.join(__dirname, "client");
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
const eventRouter = require("./api/events/event.router");
const schoolRouter = require("./api/maintenance/school/school.router");
const collegeRouter = require("./api/maintenance/college/college.router");
const departmentRouter = require("./api/maintenance/department/department.router");
const programRouter = require("./api/maintenance/program/program.router");
app.use("/api/auth", asyncHandler(loginRouter));
// Public kiosk access is intentionally limited to daily entrance scans.
app.post(
  "/api/kiosk/scan",
  asyncHandler((req, res) => {
    req.body.eventId = null;
    return require("./api/attendance/attendance.controller").scan(req, res);
  }),
);
app.use("/api", checkSession);
app.use("/api/attendance", wrapRouter(attendanceRouter));
app.use("/api/events", wrapRouter(eventRouter));
app.use("/api/student", wrapRouter(studentRouter));
app.use("/api/employee", wrapRouter(employeeRouter));
app.use("/api/settings", requireAdmin, wrapRouter(settingsRouter));
app.use("/api/school", requireAdmin, wrapRouter(schoolRouter));
app.use("/api/college", requireAdmin, wrapRouter(collegeRouter));
app.use("/api/department", requireAdmin, wrapRouter(departmentRouter));
app.use("/api/program", requireAdmin, wrapRouter(programRouter));
app.get(
  "/api/program-options",
  asyncHandler(async (_req, res) =>
    res.json(
      await require("./api/maintenance/academic/academic.model").getAll(
        "program",
      ),
    ),
  ),
);
app.use("/api/user", requireAdmin, wrapRouter(userRouter));
app.get(
  "/api/people",
  asyncHandler(async (_req, res) => {
    const [students, employees] = await Promise.all([
      require("./api/maintenance/student/student.model").getAll(),
      require("./api/maintenance/employee/employee.model").getAll(),
    ]);
    res.json([...students, ...employees]);
  }),
);
app.post(
  "/api/people",
  asyncHandler((req, res) =>
    req.body.type === "Student"
      ? require("./api/maintenance/student/student.controller").create(req, res)
      : require("./api/maintenance/employee/employee.controller").create(
          req,
          res,
        ),
  ),
);
app.delete(
  "/api/people/:type/:id",
  asyncHandler((req, res) =>
    req.params.type === "Student"
      ? res
          .status(405)
          .json({
            message:
              "Student records cannot be deleted. Deactivate the record instead.",
          })
      : require("./api/maintenance/employee/employee.controller").remove(
          req,
          res,
        ),
  ),
);
app.get("/api/users", (req, res) => res.redirect(307, "/api/user"));
app.post("/api/users", (req, res) => res.redirect(307, "/api/user"));
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
app.get("/", (_req, res) => res.sendFile(path.join(client, "index.html")));
app.get("/login", (_req, res) =>
  res.sendFile(path.join(client, "login", "index.html")),
);
app.get("/setup", (_req, res) =>
  res.sendFile(path.join(client, "login", "setup.html")),
);
app.get("/kiosk", (_req, res) =>
  res.sendFile(path.join(client, "kiosk", "index.html")),
);
app.get("/sidebar.html", checkSession, (_req, res) =>
  res.sendFile(path.join(client, "sidebar.html")),
);
const protectedPage = (file) => (_req, res) =>
  res.sendFile(path.join(client, file));
const adminPage = protectedPage;
app.get("/app", protectedPage("dashboard/index.html"));
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
app.get("/maintenance/settings", adminPage("maintenance/settings/index.html"));
app.get("/maintenance/school", adminPage("maintenance/school/index.html"));
app.get("/maintenance/college", adminPage("maintenance/college/index.html"));
app.get(
  "/maintenance/department",
  adminPage("maintenance/department/index.html"),
);
app.get("/maintenance/program", adminPage("maintenance/program/index.html"));
app.get("/user/user-management", adminPage("user/user_management/index.html"));
app.get("/portal.css", (_req, res) =>
  res.sendFile(path.join(client, "login", "style.css")),
);
app.get("/auth.js", (_req, res) =>
  res.sendFile(path.join(client, "login", "script.js")),
);
app.use(apiErrorHandler);
app.listen(port, () =>
  console.log(`TapTrack running at http://localhost:${port}`),
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
