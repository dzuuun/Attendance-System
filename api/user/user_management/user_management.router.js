const router = require("express").Router(),
  controller = require("./user_management.controller");
router.get("/", controller.getAll);
router.get("/permission-options", controller.getPermissionOptions);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.patch("/:id/status", controller.setStatus);
module.exports = router;
