const router = require("express").Router(),
  controller = require("./settings.controller");
const { requireAdmin } = require("../../../auth/auth_validation");
router.get("/", controller.getAll);
router.put("/", requireAdmin, controller.update);
module.exports = router;
