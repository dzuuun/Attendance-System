const model = require("./library.model");

exports.scan = async (req, res) => {
  const idNumber = String(req.body.idNumber || "")
    .trim()
    .toUpperCase();
  if (!idNumber)
    return res.status(400).json({ message: "Enter an ID number." });
  const kioskId = String(req.body.kioskId || "").trim();
  if (req.kioskAuthenticated && !kioskId)
    return res
      .status(400)
      .json({ message: "This kiosk has no device identity." });
  if (kioskId) {
    const enabled =
      await require("../kiosk-management/kiosk.model").assertEnabled(kioskId);
    if (!enabled)
      return res.status(403).json({
        message: "This kiosk has been disabled by central management.",
      });
  }
  try {
    const record = await model.scan(req.params.location, idNumber);
    if (!record)
      return res.status(404).json({
        message: `ID “${idNumber}” is not registered as an active student or employee.`,
      });
    res.status(201).json(record);
  } catch (error) {
    if (error.code === "INVALID_LOCATION")
      return res.status(400).json({ message: error.message });
    if (error.code === "INACTIVE_STUDENT")
      return res.status(403).json({ message: error.message });
    if (error.code === "DUPLICATE_SCAN")
      return res.status(409).json({ message: error.message, duplicate: true });
    throw error;
  }
};

exports.getAll = async (req, res) => {
  try {
    res.json(await model.getAll(req.query.location, req.query.periodId));
  } catch (error) {
    if (error.code === "INVALID_LOCATION")
      return res.status(400).json({ message: error.message });
    throw error;
  }
};

exports.recent = async (req, res) => {
  try {
    res.json(await model.getToday(req.params.location, 10));
  } catch (error) {
    if (error.code === "INVALID_LOCATION")
      return res.status(400).json({ message: error.message });
    throw error;
  }
};
