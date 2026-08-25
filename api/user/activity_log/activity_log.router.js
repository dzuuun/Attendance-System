const router = require("express").Router();
router.get("/", require("./activity_log.controller").getAll);
module.exports = router;
