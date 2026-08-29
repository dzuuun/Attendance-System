const router = require("express").Router(),
  controller = require("./student.controller"),
  model = require("./student.model"),
  photos = require("../profile-photo").handlers("student", model);
router.get("/", controller.getAll);
router.get("/card-writer/status", controller.cardWriterStatus);
router.post("/card-writer/read", controller.readCard);
router.post("/:id/card-enrollment", controller.enrollCard);
router.post("/", controller.create);
router.post("/import-summary", controller.importSummary);
router.post("/photos/bulk", photos.bulkUpload, photos.bulk);
router.post("/:id/photo", photos.singleUpload, photos.single);
router.post("/deactivate-missing", controller.deactivateMissing);
router.put("/:id", controller.update);
router.patch("/:id/status", controller.setStatus);
module.exports = router;
