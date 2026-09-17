const router = require("express").Router(),
  controller = require("./student.controller"),
  model = require("./student.model"),
  photos = require("../profile-photo").handlers("student", model);
const { requireAdmin } = require("../../../auth/auth_validation");
router.get("/", controller.getAll);
router.get("/mssql-import/preview", requireAdmin, require("./mssql-import.controller").preview);
router.post("/mssql-import", requireAdmin, require("./mssql-import.controller").import);
router.get("/card-writer/status", requireAdmin, controller.cardWriterStatus);
router.post("/card-writer/read", requireAdmin, controller.readCard);
router.post("/:id/card-enrollment", requireAdmin, controller.enrollCard);
router.post("/", controller.create);
router.post("/photos/bulk", photos.bulkUpload, photos.bulk);
router.post("/:id/photo", photos.singleUpload, photos.single);
router.post("/deactivate-missing", controller.deactivateMissing);
router.put("/:id", controller.update);
router.patch("/:id/status", controller.setStatus);
module.exports = router;
