const model = require("./attendance.model");
const eventModel = require("../events/event.model");

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
  const scope =
    user?.role === "Superadmin" ? "Both" : user?.peopleAccess || "Both";
  if (scope === "Both") return rows;
  const type = scope === "Students" ? "Student" : "Employee";
  return rows.filter((row) => row.type === type);
};

exports.getAll = async (req, res) =>
  res.json(visible(await model.getAll(), req.user));

exports.getEventScans = async (req, res) => {
  const event = await eventModel.getById(req.params.id);
  if (!event)
    return res.status(404).json({ message: "This event was not found." });
  const scope =
    req.user?.role === "Superadmin" ? "Both" : req.user?.peopleAccess || "Both";
  if (
    scope !== "Both" &&
    event.targetAudience !== "Both" &&
    event.targetAudience !== scope
  )
    return res
      .status(403)
      .json({
        message: "Your permission does not include this event audience.",
      });
  res.json(visible(await model.getByEvent(req.params.id), req.user));
};

exports.scan = async (req, res) => {
  const idNumber = String(req.body.idNumber || "")
    .trim()
    .toUpperCase();
  const eventId = req.body.eventId ? Number(req.body.eventId) : null;
  const action = String(req.body.action || "").trim();
  if (!idNumber)
    return res.status(400).json({ message: "Enter an ID number." });
  if (!["Time In", "Time Out"].includes(action))
    return res.status(400).json({
      message: "Choose whether this device records Time In or Time Out.",
    });

  let event = null;
  if (eventId) {
    event = await eventModel.getById(eventId);
    if (!event)
      return res.status(404).json({ message: "This event was not found." });
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
    req.user.role !== "Superadmin" &&
    req.user.peopleAccess !== "Both"
  ) {
    if (
      event.targetAudience !== "Both" &&
      event.targetAudience !== req.user.peopleAccess
    )
      return res
        .status(403)
        .json({
          message: `Your permission does not include ${event.targetAudience.toLowerCase()}.`,
        });
    lookupAudience = req.user.peopleAccess;
  }
  const person = await model.findPerson(idNumber, lookupAudience);
  if (!person)
    return res.status(404).json({
      message:
        event && event.targetAudience !== "Both"
          ? `ID “${idNumber}” is not registered as an active ${event.targetAudience === "Students" ? "student" : "employee"}.`
          : `ID “${idNumber}” is not registered.`,
    });

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

  const result = await model.record(person, action, eventId);
  res.status(201).json({
    id: result.insertId,
    personId: person.id,
    idNumber: person.idNumber,
    name: person.name,
    type: person.type,
    program: person.type === "Student" ? person.program : null,
    yearLevel: person.type === "Student" ? person.yearLevel : null,
    department: person.type === "Employee" ? person.department : null,
    eventId,
    eventName: event?.name || null,
    action,
    timestamp: new Date().toISOString(),
    previousAction: previous?.action || null,
    previousTimestamp: previous?.timestamp || null,
  });
};

exports.clear = async (_req, res) => {
  await model.clear();
  res.status(204).end();
};
