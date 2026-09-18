const router = require("express").Router(),
  controller = require("./attendance.controller");
const { requireAdmin } = require("../../auth/auth_validation");
router.get("/periods", controller.getPeriods);
router.get("/today", controller.getToday);
router.get("/", controller.getAll);
router.post("/scan", controller.scan);
router.delete("/", requireAdmin, controller.clear);
module.exports = router;
