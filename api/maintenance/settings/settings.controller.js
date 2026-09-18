const model = require("./settings.model");
const ALLOWED_SETTINGS = new Set(["school_name"]);
exports.getAll = async (_req, res) => res.json(await model.getAll());
exports.update = async (req, res) => {
  const settings = req.body && typeof req.body === "object" ? req.body : {};
  const keys = Object.keys(settings);
  if (
    !keys.length ||
    keys.some((key) => !ALLOWED_SETTINGS.has(key)) ||
    keys.some((key) => String(settings[key]).length > 200)
  )
    return res.status(400).json({ message: "Invalid system setting." });
  await model.update(settings);
  req.activityDescription = "Updated system settings.";
  res.json(settings);
};
