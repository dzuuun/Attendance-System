const router = require("express").Router();
router.get("/:type/:id", require("./person_logs.controller").get);
module.exports = router;
