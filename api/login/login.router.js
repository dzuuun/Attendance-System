const router = require('express').Router();
const controller = require('./login.controller');
router.get('/setup-status', controller.setupStatus);
router.post('/setup', controller.setup);
router.post('/login', controller.login);
router.get('/me', controller.me);
router.post('/logout', controller.logout);
module.exports = router;
