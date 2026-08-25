const periods = require("../maintenance/academic_period/academic_period.model"),
  events = require("../events/event.model"),
  attendance = require("../attendance/attendance.model"),
  { canAccessAudience } = require("../events/event.controller");
const visible = (rows, user) => {
  const scope =
    user.role === "Superadmin" ? "Both" : user.peopleAccess || "Both";
  if (scope === "Both") return rows;
  return rows.filter(
    (row) => row.type === (scope === "Students" ? "Student" : "Employee"),
  );
};
exports.periods = async (_req, res) => res.json(await periods.getAll());
exports.events = async (req, res) => {
  const periodId = Number(req.query.periodId);
  if (!periodId)
    return res.status(400).json({ message: "Select an academic period." });
  res.json(
    (await events.getByPeriod(periodId)).filter((event) =>
      canAccessAudience(req.user, event.targetAudience),
    ),
  );
};
exports.scans = async (req, res) => {
  const event = await events.getByIdAnyPeriod(req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found." });
  if (!canAccessAudience(req.user, event.targetAudience))
    return res
      .status(403)
      .json({
        message: "Your permission does not include this event audience.",
      });
  res.json(visible(await attendance.getByEvent(event.id), req.user));
};
