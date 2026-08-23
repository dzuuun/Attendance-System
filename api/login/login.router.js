const router = require("express").Router();
const controller = require("./login.controller");
const { checkSession } = require("../../auth/auth_validation");
router.get("/setup-status", controller.setupStatus);
router.post("/setup", controller.setup);
router.post("/login", controller.login);
router.get("/me", checkSession, controller.me);
router.post("/logout", checkSession, controller.logout);
module.exports = router;
