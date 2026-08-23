const model = require("./event.model");
exports.getAll = async (_req, res) => res.json(await model.getAll());
exports.create = async (req, res) => {
  const {
      name,
      description = "",
      startsAt,
      endsAt,
      targetAudience = "Both",
    } = req.body,
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
    maxTimeOuts < 1 ||
    !["Students", "Employees", "Both"].includes(targetAudience)
  )
    return res
      .status(400)
      .json({
        message:
          "Enter a name, audience, valid duration, and limits of at least one.",
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
  res.status(201).json({ id: result.insertId, ...data, isActive: 1 });
};
exports.setActive = async (req, res) => {
  await model.setActive(req.params.id, Boolean(req.body.isActive));
  res.status(204).end();
};
