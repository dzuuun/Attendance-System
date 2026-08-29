const model = require("../user/activity_log/activity_log.model");

const labels = {
  attendance: "Attendance",
  events: "Events",
  student: "Students",
  employee: "Employees",
  people: "People",
  settings: "System settings",
  school: "Schools",
  college: "Colleges",
  department: "Departments",
  program: "Programs",
  user: "User management",
  permissions: "Permissions",
};

function activityLog(req, res, next) {
  const method = req.method.toUpperCase();
  const path = req.originalUrl.split("?")[0];
  const excluded =
    /\/scan$/.test(path) ||
    path === "/api/attendance/scan" ||
    path.startsWith("/api/kiosk/") ||
    path.startsWith("/api/activity-log") ||
    path.startsWith("/api/users") ||
    (req.get("X-Bulk-Import") === "student" &&
      path.startsWith("/api/student"));
  if (
    !req.user ||
    !["POST", "PUT", "PATCH", "DELETE"].includes(method) ||
    excluded
  )
    return next();

  res.once("finish", () => {
    if (res.statusCode >= 400) return;
    const parts = path.split("/").filter(Boolean);
    const key = parts[1] || "system";
    const module = labels[key] || key.replaceAll("-", " ");
    const targetId = parts.find(
      (part, index) => index > 1 && /^\d+$/.test(part),
    );
    const target = targetId && !req.activityLabel ? ` #${targetId}` : "";
    const action =
      req.activityAction ||
      (path.endsWith("/status")
        ? "STATUS_CHANGED"
        : method === "POST"
          ? "CREATED"
          : method === "DELETE"
            ? "DELETED"
            : "UPDATED");
    const verb =
      action === "STATUS_CHANGED" && typeof req.body?.isActive === "boolean"
        ? req.body.isActive
          ? "Enabled"
          : "Disabled"
        : {
            CREATED: "Created",
            UPDATED: "Updated",
            DELETED: "Deleted",
            STATUS_CHANGED: "Changed the status of",
          }[action];
    const label = String(
      req.activityLabel ||
        req.body?.name ||
        req.body?.username ||
        req.body?.code ||
        "",
    ).trim();
    const description =
      req.activityDescription ||
      `${verb} ${module.toLowerCase()}${target}${label ? ` (${label})` : ""}.`;
    model
      .record({
        userId: req.user.id,
        actorName: req.user.fullName,
        actorUsername: req.user.username,
        action,
        module,
        description,
        method,
        path,
      })
      .catch((error) =>
        console.error("Unable to write activity log:", error.message),
      );
  });
  next();
}

module.exports = activityLog;
