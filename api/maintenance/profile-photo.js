const fs = require("fs");
const path = require("path");
const multer = require("multer");

const root = path.join(__dirname, "..", "..", "uploads", "profile-photos");
const staging = path.join(root, ".staging");
fs.mkdirSync(staging, { recursive: true });
const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => done(null, staging),
    filename: (_req, _file, done) =>
      done(null, `${Date.now()}-${Math.random().toString(36).slice(2)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5000 },
  fileFilter: (_req, file, done) =>
    allowedTypes.has(file.mimetype)
      ? done(null, true)
      : done(new Error("Profile photos must be JPEG, PNG, or WebP images.")),
});

const safeId = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");

async function save(type, idNumber, file) {
  const directory = path.join(root, type);
  await fs.promises.mkdir(directory, { recursive: true });
  const filename = `${safeId(idNumber)}${allowedTypes.get(file.mimetype)}`;
  await fs.promises.copyFile(file.path, path.join(directory, filename));
  await fs.promises.unlink(file.path);
  return `/uploads/profile-photos/${type}/${filename}`;
}

function handlers(type, model) {
  return {
    singleUpload: upload.single("photo"),
    bulkUpload: upload.array("photos", 1000),
    single: async (req, res) => {
      if (!req.file)
        return res.status(400).json({ message: "Choose an image file." });
      const person = await model.getById(req.params.id);
      if (!person)
        return res.status(404).json({ message: `${type} record not found.` });
      const photoUrl = await save(type, person.idNumber, req.file);
      await model.updatePhoto(person.id, photoUrl);
      req.activityDescription = `Updated the profile photo for ${person.name}.`;
      res.json({ id: person.id, idNumber: person.idNumber, photoUrl });
    },
    bulk: async (req, res) => {
      if (!req.files?.length)
        return res
          .status(400)
          .json({ message: "Choose one or more image files." });
      const people = await model.getAll();
      const byIdNumber = new Map(
        people.map((person) => [safeId(person.idNumber), person]),
      );
      const updated = [];
      const unmatched = [];
      for (const file of req.files) {
        const filenameId = safeId(path.parse(file.originalname).name);
        const person = byIdNumber.get(filenameId);
        if (!person) {
          unmatched.push(file.originalname);
          await fs.promises.unlink(file.path).catch(() => {});
          continue;
        }
        const photoUrl = await save(type, person.idNumber, file);
        await model.updatePhoto(person.id, photoUrl);
        updated.push({ id: person.id, idNumber: person.idNumber, photoUrl });
      }
      req.activityDescription = `Bulk updated ${updated.length} ${type} profile photo${updated.length === 1 ? "" : "s"}.`;
      res.json({ updated, unmatched });
    },
  };
}

module.exports = { handlers };
