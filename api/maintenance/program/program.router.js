const router = require("express").Router(),
  c = require("../academic/academic.controller").forEntity("program");
router.get("/", c.getAll);
router.post("/", c.create);
router.put("/:id", c.update);
router.delete("/:id", c.remove);
module.exports = router;
