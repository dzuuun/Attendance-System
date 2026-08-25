const router = require("express").Router();
router.get("/", require("./library.controller").getAll);
module.exports = router;
