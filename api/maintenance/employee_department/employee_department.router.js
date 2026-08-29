const router = require("express").Router();
const controller = require("../academic/academic.controller").forEntity("employee_department");

router.get("/", controller.getAll);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
