const model = require("./person_logs.model");
const { hasMaintenanceModule } = require("../../auth/auth_validation");
const sources = new Set(["university", "events", "library", "internet"]);
exports.get = async (req, res) => {
  const type =
    req.params.type === "student"
      ? "Student"
      : req.params.type === "employee"
        ? "Employee"
        : req.params.type === "alumnus"
          ? "Alumnus"
          : null;
  const academicPeriodId = Number(req.query.academicPeriodId) || null;
  const dateFrom = String(req.query.dateFrom || ""),
    dateTo = String(req.query.dateTo || "");
  const validDate = (value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  };
  const validRange =
    validDate(dateFrom) && validDate(dateTo) && dateFrom <= dateTo;
  if (
    !type ||
    !academicPeriodId ||
    !sources.has(req.query.source) ||
    (req.query.source === "university" && !validRange)
  )
    return res.status(400).json({
      message:
        "Choose a valid person, academic period, log type, and date range.",
    });
  const module = { Student: "students", Employee: "employees", Alumnus: "alumni" }[type];
  if (!hasMaintenanceModule(req.user, module))
    return res.status(403).json({ message: "You do not have access to this person's directory." });
  const person = await model.getPerson(type, req.params.id);
  if (!person) return res.status(404).json({ message: `${type} not found.` });
  const academicPeriod = await model.getAcademicPeriod(academicPeriodId);
  if (!academicPeriod)
    return res.status(400).json({ message: "Choose a valid academic period." });
  const dateRange =
    req.query.source === "university" ? { from: dateFrom, to: dateTo } : null;
  res.json({
    person,
    academicPeriod,
    source: req.query.source,
    dateRange,
    records: await model.getLogs(
      type,
      person.id,
      req.query.source,
      academicPeriodId,
      dateRange,
    ),
  });
};
