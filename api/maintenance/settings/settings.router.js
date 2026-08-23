const router = require("express").Router(),
  controller = require("./settings.controller");
router.get("/", controller.getAll);
router.put("/", controller.update);
module.exports = router;
