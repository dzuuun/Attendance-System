const router = require("express").Router();
const controller = require("./analytics.controller");

router.get("/summary", controller.summary);

module.exports = router;
