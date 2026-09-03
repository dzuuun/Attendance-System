const model = require("./gate.model");

const CAMPUSES = new Set(["Main Campus", "IBED Campus"]);

function readGate(body = {}) {
  const name = String(body.name || "").trim();
  const campus = String(body.campus || "").trim();
  const isActive = body.isActive !== false;
  if (!name || !CAMPUSES.has(campus)) return null;
  return { name, campus, isActive };
}

exports.getAll = async (_req, res) => res.json(await model.getAll());

exports.create = async (req, res) => {
  const gate = readGate(req.body);
  if (!gate)
    return res.status(400).json({
      message: "Gate name and a valid campus are required.",
    });
  try {
    const result = await model.create(gate);
    req.activityLabel = `${gate.name} — ${gate.campus}`;
    res.status(201).json({ id: result.insertId, ...gate });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res.status(409).json({
        message: "That gate already exists for the selected campus.",
      });
    throw error;
  }
};

exports.update = async (req, res) => {
  const gate = readGate(req.body);
  if (!gate)
    return res.status(400).json({
      message: "Gate name and a valid campus are required.",
    });
  try {
    const result = await model.update(req.params.id, gate);
    if (!result.affectedRows)
      return res.status(404).json({ message: "Gate not found." });
    req.activityLabel = `${gate.name} — ${gate.campus}`;
    res.json({ id: Number(req.params.id), ...gate });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res.status(409).json({
        message: "That gate already exists for the selected campus.",
      });
    throw error;
  }
};

exports.remove = async (req, res) => {
  const gate = await model.getById(req.params.id);
  if (!gate) return res.status(404).json({ message: "Gate not found." });
  const result = await model.remove(req.params.id);
  if (!result.affectedRows)
    return res.status(404).json({ message: "Gate not found." });
  req.activityLabel = `${gate.name} — ${gate.campus}`;
  res.status(204).end();
};
