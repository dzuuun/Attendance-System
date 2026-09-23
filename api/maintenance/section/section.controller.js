const model = require("./section.model");
const gradeLevels = new Set(
  Array.from({ length: 12 }, (_, index) => `Grade ${index + 1}`),
);

function payload(body) {
  return {
    name: String(body.name || "")
      .trim()
      .replace(/\s+/g, " "),
    yearLevel: String(body.yearLevel || "").trim(),
    isActive: body.isActive !== false,
  };
}
function valid(data) {
  return (
    data.name && data.name.length <= 100 && gradeLevels.has(data.yearLevel)
  );
}
exports.getAll = async (_req, res) => res.json(await model.getAll());
exports.create = async (req, res) => {
  const data = payload(req.body);
  if (!valid(data))
    return res
      .status(400)
      .json({ message: "Enter a section name and Grade 1 to Grade 12 level." });
  try {
    const result = await model.create(data);
    req.activityLabel = `${data.yearLevel} — ${data.name}`;
    res.status(201).json({ id: result.insertId, ...data });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({
          message: "That section already exists for the selected grade.",
        });
    throw error;
  }
};
exports.update = async (req, res) => {
  const data = payload(req.body);
  if (!valid(data))
    return res
      .status(400)
      .json({ message: "Enter a section name and Grade 1 to Grade 12 level." });
  try {
    const existing = await model.getById(req.params.id);
    if (!existing)
      return res.status(404).json({ message: "Section not found." });
    if (
      existing.yearLevel !== data.yearLevel &&
      (await model.studentCount(req.params.id))
    )
      return res.status(409).json({
        message:
          "This section's grade cannot change while it is assigned to students.",
      });
    const result = await model.update(req.params.id, data);
    if (!result.affectedRows)
      return res.status(404).json({ message: "Section not found." });
    req.activityLabel = `${data.yearLevel} — ${data.name}`;
    res.json({ id: Number(req.params.id), ...data });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({
          message: "That section already exists for the selected grade.",
        });
    throw error;
  }
};
exports.remove = async (req, res) => {
  try {
    const result = await model.remove(req.params.id);
    if (!result.affectedRows)
      return res.status(404).json({ message: "Section not found." });
    res.status(204).end();
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2")
      return res
        .status(409)
        .json({
          message:
            "Deactivate this section instead; it is assigned to students.",
        });
    throw error;
  }
};
