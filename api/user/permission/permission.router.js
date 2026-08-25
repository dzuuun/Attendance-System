const router = require("express").Router(),
  controller = require("./permission.controller");
router.get("/", controller.getAll);
router.post("/", controller.create);
router.put("/:id", controller.update);
module.exports = router;
