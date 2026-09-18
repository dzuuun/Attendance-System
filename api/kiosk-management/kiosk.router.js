const router = require("express").Router();
const controller = require("./kiosk.controller");
const { requireAdmin } = require("../../auth/auth_validation");
router.get("/", controller.getAll);
router.patch("/:id/enabled", requireAdmin, controller.setEnabled);
router.get("/:id/logs", controller.getLogs);
router.post("/actions", requireAdmin, controller.queueAction);
module.exports = router;
