const periods = require("../maintenance/academic_period/academic_period.model"),
  events = require("../events/event.model"),
  attendance = require("../attendance/attendance.model"),
  {
    canAccessAudience,
    canAccessPastEvent,
  } = require("../events/event.controller");
const visible = (rows, user) => {
  const scope = ["Superadmin", "Administrator"].includes(user.role)
    ? "Both"
    : user.peopleAccess || "Both";
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
    (await events.getByPeriod(periodId, req.user)).filter((event) =>
      canAccessAudience(req.user, event.targetAudience),
    ),
  );
};
exports.scans = async (req, res) => {
  const event = await events.getByIdAnyPeriod(req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found." });
  if (new Date(event.endsAt) >= new Date())
    return res.status(409).json({ message: "This event has not ended yet." });
  if (!canAccessPastEvent(req.user, event))
    return res.status(403).json({
      message: "You can view only past events you created.",
    });
  res.json(visible(await attendance.getByEvent(event.id), req.user));
};
exports.corrections = async (req, res) => {
  const event = await events.getByIdAnyPeriod(req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found." });
  if (!canAccessPastEvent(req.user, event))
    return res.status(403).json({
      message: "You can view only corrections for past events you can access.",
    });
  res.json(await attendance.getEventCorrections(event.id));
};
