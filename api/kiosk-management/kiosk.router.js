const router = require("express").Router();
const controller = require("./kiosk.controller");
router.get("/", controller.getAll);
router.patch("/:id/enabled", controller.setEnabled);
router.get("/:id/logs", controller.getLogs);
router.post("/actions", controller.queueAction);
module.exports = router;
