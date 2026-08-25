const router = require("express").Router(),
  controller = require("./academic_period.controller");
router.get("/", controller.getAll);
router.get("/current", controller.getCurrent);
router.post("/", controller.create);
router.put("/:id", controller.update);
module.exports = router;
