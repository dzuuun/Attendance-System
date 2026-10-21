const router = require("express").Router();
const controller = require("./card-enrollment.controller");

router.get("/people", controller.search);
router.patch("/:type/:id/card", controller.saveFor());

module.exports = router;
