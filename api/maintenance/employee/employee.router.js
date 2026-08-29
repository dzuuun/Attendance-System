const router = require("express").Router(),
  controller = require("./employee.controller"),
  model = require("./employee.model"),
  photos = require("../profile-photo").handlers("employee", model);
router.get("/", controller.getAll);
router.post("/", controller.create);
router.post("/photos/bulk", photos.bulkUpload, photos.bulk);
router.post("/:id/photo", photos.singleUpload, photos.single);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);
module.exports = router;
