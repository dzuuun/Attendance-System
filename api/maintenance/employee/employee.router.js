const router = require("express").Router(),
  controller = require("./employee.controller"),
  model = require("./employee.model"),
  photos = require("../profile-photo").handlers("employee", model);
const { requireAdmin } = require("../../../auth/auth_validation");
router.get("/", controller.getAll);
router.post("/", controller.create);
router.post("/photos/bulk", photos.bulkUpload, photos.bulk);
router.post("/:id/photo", photos.singleUpload, photos.single);
router.put("/:id", controller.update);
router.patch("/:id/card", controller.setCardId);
router.delete("/:id", controller.remove);
module.exports = router;
