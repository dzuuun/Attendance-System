const router = require("express").Router(),
  c = require("../academic/academic.controller").forEntity("school");
router.get("/", c.getAll);
router.post("/", c.create);
router.delete("/:id", c.remove);
module.exports = router;
