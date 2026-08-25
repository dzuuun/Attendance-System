const router = require("express").Router(),
  controller = require("./attendance.controller");
router.get("/", controller.getAll);
router.post("/scan", controller.scan);
router.delete("/", controller.clear);
module.exports = router;
