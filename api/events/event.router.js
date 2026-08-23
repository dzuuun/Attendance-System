const router = require("express").Router(),
  controller = require("./event.controller"),
  { requireAdmin } = require("../../auth/auth_validation");
router.get("/", controller.getAll);
router.post("/", requireAdmin, controller.create);
router.patch("/:id/status", requireAdmin, controller.setActive);
module.exports = router;
