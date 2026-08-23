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

exports.getAll = async (_req, res) => res.json(await model.getAll());

exports.scan = async (req, res) => {
  const idNumber = String(req.body.idNumber || "")
    .trim()
    .toUpperCase();
  const eventId = req.body.eventId ? Number(req.body.eventId) : null;
  if (!idNumber)
    return res.status(400).json({ message: "Enter an ID number." });

  const person = await model.findPerson(idNumber);
  if (!person)
    return res
      .status(404)
      .json({ message: `ID “${idNumber}” is not registered.` });

  let event = null;
  if (eventId) {
    event = await eventModel.getById(eventId);
    if (!event || !event.isActive)
      return res.status(404).json({ message: "This event is unavailable." });
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
      return res
        .status(403)
        .json({
          message: `${event.name} is for ${event.targetAudience.toLowerCase()} only.`,
        });
  }

  const latest = await model.findLatest(person, eventId);
  // Daily entrance attendance starts a new in/out cycle every calendar day.
  // Keep the timestamp check here as a safeguard against database timezone
  // differences causing yesterday's final Time In to be returned after midnight.
  const previous = !eventId && latest && !isToday(latest.timestamp) ? null : latest;
  const action = previous?.action === "Time In" ? "Time Out" : "Time In";

  if (event) {
    const counts = await model.getActionCounts(person, eventId);
    const limit =
      action === "Time In"
        ? Number(event.maxTimeIns)
        : Number(event.maxTimeOuts);
    const used = action === "Time In" ? counts.timeIns : counts.timeOuts;
    if (used >= limit)
      return res
        .status(409)
        .json({
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
