const router = require("express").Router(),
  controller = require("./history.controller");
router.get("/periods", controller.periods);
router.get("/events", controller.events);
router.get("/events/:id/scans", controller.scans);
router.get("/events/:id/corrections", controller.corrections);
module.exports = router;
