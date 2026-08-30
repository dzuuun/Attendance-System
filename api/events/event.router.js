const router = require("express").Router(),
  controller = require("./event.controller");
router.get("/", controller.getAll);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.get(
  "/:id/scans",
  require("../attendance/attendance.controller").getEventScans,
);
router.get(
  "/:id/corrections",
  require("../attendance/attendance.controller").getEventCorrections,
);
router.put(
  "/:id/scans/:scanId",
  require("../attendance/attendance.controller").correctEventScan,
);
router.delete(
  "/:id/scans/:scanId",
  require("../attendance/attendance.controller").deleteEventScan,
);
router.post("/:id/scan", (req, res) => {
  req.body.eventId = Number(req.params.id);
  return require("../attendance/attendance.controller").scan(req, res);
});
router.patch("/:id/status", controller.setActive);
module.exports = router;
