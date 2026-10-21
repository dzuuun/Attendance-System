const router = require("express").Router();
const controller = require("./alumni.controller");
const { requireAdmin } = require("../../../auth/auth_validation");

router.get("/", controller.getAll);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.patch("/:id/card", controller.setCardId);
router.post("/:id/reenroll", requireAdmin, controller.reenroll);
router.patch("/:id/status", requireAdmin, controller.setStatus);
module.exports = router;
