const model = require("./event.model");
const canAccessAudience = (user, audience) =>
  ["Superadmin", "Administrator"].includes(user?.role) ||
  user?.peopleAccess === "Both" ||
  user?.peopleAccess === audience;
const canAccessEvent = (user, event) =>
  Boolean(event) &&
  Number(event.createdBy) === Number(user?.id) &&
  canAccessAudience(user, event.targetAudience);
const canAccessPastEvent = (user, event) =>
  Boolean(event) &&
  (["Superadmin", "Administrator"].includes(user?.role) ||
    Number(event.createdBy) === Number(user?.id)) &&
  canAccessAudience(user, event.targetAudience);
exports.getAll = async (req, res) =>
  res.json(
    (await model.getAll(req.user)).filter((event) =>
      canAccessAudience(req.user, event.targetAudience),
    ),
  );
exports.create = async (req, res) => {
  const { name, description = "", startsAt, endsAt } = req.body,
    targetAudience = String(req.body.targetAudience || "").trim(),
    maxTimeIns = Number(req.body.maxTimeIns),
    maxTimeOuts = Number(req.body.maxTimeOuts);
  if (
    !name?.trim() ||
    !startsAt ||
    !endsAt ||
    new Date(endsAt) <= new Date(startsAt) ||
    !Number.isInteger(maxTimeIns) ||
    maxTimeIns < 1 ||
    !Number.isInteger(maxTimeOuts) ||
    maxTimeOuts < 0 ||
    !["Students", "Employees", "Both"].includes(targetAudience)
  )
    return res.status(400).json({
      message:
        "Enter a name, audience, valid duration, at least one Time In, and zero or more Time Outs.",
    });
  if (!canAccessAudience(req.user, targetAudience))
    return res.status(403).json({
      message: `Your permission does not include ${targetAudience.toLowerCase()} events.`,
    });
  const data = {
    name: name.trim(),
    description: description.trim(),
    startsAt,
    endsAt,
    maxTimeIns,
    maxTimeOuts,
    targetAudience,
    createdBy: req.user.id,
  };
  const result = await model.create(data);
  res.status(201).json(await model.getById(result.insertId));
};
exports.update = async (req, res) => {
  const event = await model.getById(req.params.id);
  if (!event)
    return res.status(404).json({ message: "This event was not found." });
  if (!canAccessEvent(req.user, event))
    return res.status(403).json({
      message: "You can manage only events you created.",
    });
  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim();
  const startsAt = req.body.startsAt;
  const endsAt = req.body.endsAt;
  const targetAudience = String(req.body.targetAudience || "").trim();
  const maxTimeIns = Number(req.body.maxTimeIns);
  const maxTimeOuts = Number(req.body.maxTimeOuts);
  if (
    !name ||
    !startsAt ||
    !endsAt ||
    new Date(endsAt) <= new Date(startsAt) ||
    !Number.isInteger(maxTimeIns) ||
    maxTimeIns < 1 ||
    !Number.isInteger(maxTimeOuts) ||
    maxTimeOuts < 0 ||
    !["Students", "Employees", "Both"].includes(targetAudience)
  )
    return res.status(400).json({
      message:
        "Enter a name, audience, valid duration, at least one Time In, and zero or more Time Outs.",
    });
  if (!canAccessAudience(req.user, targetAudience))
    return res.status(403).json({
      message: `Your permission does not include ${targetAudience.toLowerCase()} events.`,
    });
  const data = {
    name,
    description,
    startsAt,
    endsAt,
    maxTimeIns,
    maxTimeOuts,
    targetAudience,
  };
  req.activityLabel = name;
  await model.update(req.params.id, data);
  res.json(await model.getById(event.id));
};
exports.setActive = async (req, res) => {
  const event = await model.getById(req.params.id);
  if (!event)
    return res.status(404).json({ message: "This event was not found." });
  if (!canAccessEvent(req.user, event))
    return res.status(403).json({
      message: "You can manage only events you created.",
    });
  req.activityLabel = event.name;
  await model.setActive(req.params.id, Boolean(req.body.isActive));
  res.status(204).end();
};

exports.canAccessAudience = canAccessAudience;
exports.canAccessEvent = canAccessEvent;
exports.canAccessPastEvent = canAccessPastEvent;
