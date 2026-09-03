const model = require("./analytics.model");
const periodModel = require("../maintenance/academic_period/academic_period.model");

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const localIso = (date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

exports.summary = async (req, res) => {
  const entirePeriod = req.query.scope === "current-period";
  const period = entirePeriod ? await periodModel.getCurrent() : null;
  if (entirePeriod && !period)
    return res
      .status(409)
      .json({ message: "No current academic period is configured." });
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  const from = String(req.query.from || localIso(defaultFrom));
  const to = String(req.query.to || localIso(today));
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (
    !isoDate.test(from) ||
    !isoDate.test(to) ||
    !Number.isFinite(fromTime) ||
    !Number.isFinite(toTime) ||
    from > to
  )
    return res
      .status(400)
      .json({ message: "Select a valid analytics date range." });
  const days = Math.floor((toTime - fromTime) / 86400000) + 1;
  if (days > 366)
    return res
      .status(400)
      .json({ message: "Analytics ranges are limited to 366 days." });
  const superadmin = req.user?.role === "Superadmin";
  const attendanceAccess =
    superadmin ||
    Boolean(req.user?.overviewAccess && req.user?.attendanceAccess);
  const libraryAccess = superadmin || Boolean(req.user?.libraryAccess);
  const view = String(req.query.view || "entrance");
  if (!["entrance", "library"].includes(view))
    return res.status(400).json({ message: "Select a valid analytics view." });
  if (view === "entrance" && !attendanceAccess)
    return res
      .status(403)
      .json({ message: "Overview and Attendance access are required." });
  if (view === "library" && !libraryAccess)
    return res.status(403).json({ message: "Library access is required." });
  const [entrance, library] = await Promise.all([
    view === "entrance" ? model.entrance(from, to, period?.id) : null,
    view === "library" ? model.library(from, to, period?.id) : null,
  ]);
  res.json({
    range: entirePeriod
      ? {
          entirePeriod: true,
          periodId: period?.id || null,
          label: period
            ? `${period.schoolYear} - ${period.term}`
            : "Current academic period",
        }
      : { from, to, entirePeriod: false },
    access: { attendance: attendanceAccess, library: libraryAccess },
    entrance,
    library,
  });
};
