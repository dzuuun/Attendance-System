const model = require("./card-enrollment.model");

exports.search = async (req, res) => {
  const search = String(req.query.search || "").trim();
  const type = String(req.query.type || "all");
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  if (!Number.isSafeInteger(page) || page < 1)
    return res.status(400).json({ message: "Choose a valid page." });
  if (type !== "all" && !Object.hasOwn(model.TYPES, type))
    return res.status(400).json({ message: "Choose students, employees, alumni, or all people." });
  if (search.length > 128)
    return res.status(400).json({ message: "Search using up to 128 characters." });
  if (req.query.mode === "table") {
    const draw = Number(req.query.draw);
    const start = Number(req.query.start);
    const length = Number(req.query.length);
    const orderBy = String(req.query.orderBy || "name");
    const direction = String(req.query.direction || "asc");
    if (!Number.isSafeInteger(draw) || draw < 0 || !Number.isSafeInteger(start) || start < 0
      || ![10, 25, 50, 100].includes(length))
      return res.status(400).json({ message: "Choose valid table pagination." });
    if (!["idNumber", "name", "type", "cardId"].includes(orderBy) || !["asc", "desc"].includes(direction))
      return res.status(400).json({ message: "Choose a valid table order." });
    const result = await model.directory({ search, type, start, length, orderBy, direction });
    return res.json({ draw, ...result });
  }
  const rows = await model.search(search, type, page);
  res.json({ people: rows.slice(0, 50), page, pageSize: 50, hasMore: rows.length > 50 });
};
exports.saveFor = (fixedType) => async (req, res) => {
  const type = fixedType || req.params.type;
  const id = Number(req.params.id);
  if (!Object.hasOwn(model.TYPES, type) || !Number.isSafeInteger(id) || id < 1)
    return res.status(400).json({ message: "Choose a valid person to enroll." });
  const cardId = String(req.body.cardId || "").trim().toUpperCase();
  if (!cardId || cardId.length > 128)
    return res.status(400).json({ message: "Scan or enter a card ID of up to 128 characters." });
  const result = await model.save(type, id, cardId);
  const errors = {
    missing: [404, "Person not found."],
    inactive: [400, "Activate the person's record before enrolling a card."],
    conflict: [409, "That card ID is already assigned or matches another person's ID number."],
    busy: [503, "Another card is being enrolled. Please try again."],
    invalid: [400, "Choose a valid person to enroll."],
  };
  if (errors[result.status]) {
    const [status, message] = errors[result.status];
    return res.status(status).json({ message });
  }
  req.activityAction = "CARD_ENROLLED";
  req.activityDescription = `Enrolled a card for ${type} ${result.person.idNumber} - ${result.person.name}.`;
  res.json({ cardId });
};
