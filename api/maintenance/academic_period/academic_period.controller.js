const model = require("./academic_period.model");
const payload = (body) => ({
  schoolYear: String(body.schoolYear || "").trim(),
  term: String(body.term || "").trim(),
  isCurrent: Boolean(body.isCurrent),
});
const valid = (data) =>
  /^\d{4}-\d{4}$/.test(data.schoolYear) &&
  Number(data.schoolYear.slice(5)) ===
    Number(data.schoolYear.slice(0, 4)) + 1 &&
  [
    "First Semester",
    "Second Semester",
    "Summer",
    "First Term",
    "Second Term",
    "Third Term",
  ].includes(data.term);
exports.getAll = async (_req, res) => res.json(await model.getAll());
exports.getCurrent = async (_req, res) => res.json(await model.getCurrent());
exports.create = async (req, res) => {
  const data = payload(req.body);
  if (!valid(data))
    return res
      .status(400)
      .json({ message: "Enter a valid school year and term." });
  try {
    const result = await model.save(null, data);
    req.activityLabel = `${data.schoolYear} — ${data.term}`;
    res.status(201).json({ id: result.insertId, ...data });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({ message: "That school year and term already exists." });
    throw error;
  }
};
exports.update = async (req, res) => {
  const data = payload(req.body);
  if (!valid(data))
    return res
      .status(400)
      .json({ message: "Enter a valid school year and term." });
  try {
    const result = await model.save(req.params.id, data);
    if (!result.affectedRows)
      return res.status(404).json({ message: "Academic period not found." });
    req.activityLabel = `${data.schoolYear} — ${data.term}`;
    res.json({ id: Number(req.params.id), ...data });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({ message: "That school year and term already exists." });
    if (error.code === "CURRENT_REQUIRED")
      return res.status(400).json({ message: error.message });
    throw error;
  }
};
