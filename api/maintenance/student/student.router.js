const router = require("express").Router(),
  controller = require("./student.controller");
router.get("/", controller.getAll);
router.post("/", controller.create);
router.post("/deactivate-missing", controller.deactivateMissing);
router.put("/:id", controller.update);
router.patch("/:id/status", controller.setStatus);
module.exports = router;
