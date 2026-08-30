const model = require("./attendance.model");
const eventModel = require("../events/event.model");
const periodModel = require("../maintenance/academic_period/academic_period.model");

const isToday = (timestamp, now = new Date()) => {
  const date = new Date(timestamp);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};

const visible = (rows, user) => {
  const scope = ["Superadmin", "Administrator"].includes(user?.role)
    ? "Both"
    : user?.peopleAccess || "Both";
  if (scope === "Both") return rows;
  const type = scope === "Students" ? "Student" : "Employee";
  return rows.filter((row) => row.type === type);
};

exports.getAll = async (req, res) => {
  const periodId = req.query.periodId ? Number(req.query.periodId) : null;
  if (req.query.periodId && (!Number.isInteger(periodId) || periodId < 1))
    return res.status(400).json({ message: "Select a valid academic period." });
  res.json(visible(await model.getAll(periodId), req.user));
};

exports.getPeriods = async (_req, res) => res.json(await periodModel.getAll());

exports.getToday = async (req, res) =>
  res.json(visible(await model.getToday(), req.user));

exports.getEventScans = async (req, res) => {
  const event = await eventModel.getById(req.params.id);
  if (!event)
    return res.status(404).json({ message: "This event was not found." });
  if (Number(event.createdBy) !== Number(req.user?.id))
    return res
      .status(403)
      .json({ message: "You can view only events you created." });
  const scope = ["Superadmin", "Administrator"].includes(req.user?.role)
    ? "Both"
    : req.user?.peopleAccess || "Both";
  if (
    scope !== "Both" &&
    event.targetAudience !== "Both" &&
    event.targetAudience !== scope
  )
    return res.status(403).json({
      message: "Your permission does not include this event audience.",
    });
  res.json(visible(await model.getByEvent(req.params.id), req.user));
};

const canCorrectEvent = (user, event) =>
  ["Superadmin", "Administrator"].includes(user?.role) ||
  Number(event?.createdBy) === Number(user?.id);

exports.getEventCorrections = async (req, res) => {
  const event = await eventModel.getById(req.params.id);
  if (!event)
    return res.status(404).json({ message: "This event was not found." });
  if (!canCorrectEvent(req.user, event))
    return res.status(403).json({
      message: "You can view corrections only for events you manage.",
    });
  res.json(await model.getEventCorrections(event.id));
};

exports.correctEventScan = async (req, res) => {
  const event = await eventModel.getById(req.params.id);
  if (!event)
    return res.status(404).json({ message: "This event was not found." });
  if (!canCorrectEvent(req.user, event))
    return res.status(403).json({
      message: "You can correct scans only for events you manage.",
    });
  const action = String(req.body.action || "").trim();
  const reason = String(req.body.reason || "").trim();
  const submittedTimestamp = String(req.body.timestamp || "").trim();
  const timestamp = submittedTimestamp.replace("T", " ");
  const parsedTimestamp = new Date(submittedTimestamp);
  if (
    !["Time In", "Time Out"].includes(action) ||
    !reason ||
    reason.length > 500 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(submittedTimestamp) ||
    Number.isNaN(parsedTimestamp.getTime())
  )
    return res.status(400).json({
      message: "Select an action and time, then provide a correction reason.",
    });
  if (action === "Time Out" && Number(event.maxTimeOuts) === 0)
    return res.status(400).json({
      message: "This event records Time In only.",
    });
  if (
    parsedTimestamp < new Date(event.startsAt) ||
    parsedTimestamp > new Date(event.endsAt)
  )
    return res.status(400).json({
      message: "The corrected time must be within the event schedule.",
    });
  const corrected = await model.correctEventScan(
    event.id,
    req.params.scanId,
    { action, timestamp, reason },
    req.user,
  );
  if (!corrected)
    return res.status(404).json({ message: "This scan was not found." });
  req.activityLabel = event.name;
  req.activityDescription = `Corrected an attendance scan for ${event.name}. Reason: ${reason}`;
  res.json({ message: "Attendance scan corrected." });
};

exports.deleteEventScan = async (req, res) => {
  const event = await eventModel.getById(req.params.id);
  if (!event)
    return res.status(404).json({ message: "This event was not found." });
  if (!canCorrectEvent(req.user, event))
    return res.status(403).json({
      message: "You can delete scans only for events you manage.",
    });
  const reason = String(req.body.reason || "").trim();
  if (!reason || reason.length > 500)
    return res.status(400).json({
      message: "Provide a reason for deleting this attendance scan.",
    });
  const deleted = await model.deleteEventScan(
    event.id,
    req.params.scanId,
    reason,
    req.user,
  );
  if (!deleted)
    return res.status(404).json({ message: "This scan was not found." });
  req.activityLabel = event.name;
  req.activityDescription = `Deleted an attendance scan from ${event.name}. Reason: ${reason}`;
  res.status(204).end();
};

exports.scan = async (req, res) => {
  const idNumber = String(req.body.idNumber || "")
    .trim()
    .toUpperCase();
  const eventId = req.body.eventId ? Number(req.body.eventId) : null;
  let action = String(req.body.action || "").trim();
  const location =
    String(req.body.location || "Main Entrance")
      .trim()
      .slice(0, 120) || "Main Entrance";
  if (!idNumber)
    return res.status(400).json({ message: "Enter an ID number." });
  if (!["Time In", "Time Out", "Auto"].includes(action))
    return res.status(400).json({
      message: "Choose whether this device records Time In or Time Out.",
    });

  let event = null;
  if (eventId) {
    if (action === "Auto")
      return res.status(400).json({
        message: "Choose Time In or Time Out for event attendance.",
      });
    event = await eventModel.getById(eventId);
    if (!event)
      return res.status(404).json({ message: "This event was not found." });
    if (req.user && Number(event.createdBy) !== Number(req.user.id))
      return res
        .status(403)
        .json({
          message: "You can scan attendance only for events you created.",
        });
    if (!event.isActive)
      return res.status(409).json({
        message:
          "This event is disabled and is no longer accepting attendance.",
      });
    if (action === "Time Out" && Number(event.maxTimeOuts) === 0)
      return res.status(409).json({
        message: `${event.name} records Time In only.`,
      });
  }

  let lookupAudience = event?.targetAudience || "Both";
  if (
    event &&
    req.user &&
    !["Superadmin", "Administrator"].includes(req.user.role) &&
    req.user.peopleAccess !== "Both"
  ) {
    if (
      event.targetAudience !== "Both" &&
      event.targetAudience !== req.user.peopleAccess
    )
      return res.status(403).json({
        message: `Your permission does not include ${event.targetAudience.toLowerCase()}.`,
      });
    lookupAudience = req.user.peopleAccess;
  }
  const person = await model.findPerson(idNumber, lookupAudience);
  if (!person) {
    const inactiveStudent = await model.findInactiveStudent(idNumber);
    if (inactiveStudent)
      return res.status(403).json({
        message: `${inactiveStudent.name}'s student account is inactive. Please visit the MIS Office for reactivation.`,
      });
    return res.status(404).json({
      message:
        event && event.targetAudience !== "Both"
          ? `ID “${idNumber}” is not registered as an active ${event.targetAudience === "Students" ? "student" : "employee"}.`
          : `ID “${idNumber}” is not registered.`,
    });
  }

  if (event) {
    const now = new Date();
    if (now < new Date(event.startsAt))
      return res
        .status(409)
        .json({ message: `${event.name} has not started yet.` });
    if (now > new Date(event.endsAt))
      return res
        .status(409)
        .json({ message: `${event.name} has already ended.` });
    const allowed =
      event.targetAudience === "Both" ||
      (event.targetAudience === "Students" && person.type === "Student") ||
      (event.targetAudience === "Employees" && person.type === "Employee");
    if (!allowed)
      return res.status(403).json({
        message: `${event.name} is for ${event.targetAudience.toLowerCase()} only.`,
      });
  }

  const latest = await model.findLatest(person, eventId);
  // Daily entrance attendance starts a new in/out cycle every calendar day.
  // Keep the timestamp check here as a safeguard against database timezone
  // differences causing yesterday's final Time In to be returned after midnight.
  const previous =
    !eventId && latest && !isToday(latest.timestamp) ? null : latest;

  // The university entrance kiosk has one manual/camera input. Alternate the
  // action from today's latest record while dedicated scanner lanes continue
  // to submit their explicitly assigned action.
  if (action === "Auto")
    action = previous?.action === "Time In" ? "Time Out" : "Time In";

  if (!previous && action === "Time Out")
    return res.status(409).json({
      message: `${person.name} must record Time In before Time Out.`,
    });
  if (previous?.action === action)
    return res.status(409).json({
      message: `${person.name} already has a ${action} record.`,
    });

  if (event) {
    const counts = await model.getActionCounts(person, eventId);
    const limit =
      action === "Time In"
        ? Number(event.maxTimeIns)
        : Number(event.maxTimeOuts);
    const used = action === "Time In" ? counts.timeIns : counts.timeOuts;
    if (used >= limit)
      return res.status(409).json({
        message: `${person.name} has reached the ${action} limit for this event.`,
      });
  }

  const result = await model.record(person, action, eventId, location);
  res.status(201).json({
    id: result.insertId,
    personId: person.id,
    idNumber: person.idNumber,
    name: person.name,
    type: person.type,
    program: person.type === "Student" ? person.program : null,
    college: person.type === "Student" ? person.college : null,
    yearLevel: person.type === "Student" ? person.yearLevel : null,
    department: person.type === "Employee" ? person.department : null,
    photoUrl: person.photoUrl || null,
    eventId,
    eventName: event?.name || null,
    action,
    timestamp: new Date().toISOString(),
    location: eventId ? null : location,
    previousAction: previous?.action || null,
    previousTimestamp: previous?.timestamp || null,
  });
};

exports.clear = async (_req, res) => {
  await model.clear();
  res.status(204).end();
};
