const router = require("express").Router(),
  controller = require("./attendance.controller"),
  { requireAdmin } = require("../../auth/auth_validation");
router.get("/", controller.getAll);
router.post("/scan", controller.scan);
router.delete("/", requireAdmin, controller.clear);
module.exports = router;
