const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const root = path.join(__dirname, "..", "..", "uploads", "profile-photos");
const staging = path.join(root, ".staging");
fs.mkdirSync(staging, { recursive: true });
const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const QUEUE_BATCH_SIZE = 25;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => done(null, staging),
    filename: (_req, _file, done) =>
      done(null, `${Date.now()}-${Math.random().toString(36).slice(2)}`),
  }),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: QUEUE_BATCH_SIZE,
    parts: QUEUE_BATCH_SIZE + 5,
  },
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

function photoType(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return { mimeType: "image/jpeg", extension: ".jpg" };
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { mimeType: "image/png", extension: ".png" };
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP"
  )
    return { mimeType: "image/webp", extension: ".webp" };
  return null;
}

function photoMetadata(buffer) {
  const detected = photoType(buffer);
  if (!detected) return null;
  return {
    mimeType: detected.mimeType,
    size: buffer.length,
    fingerprint: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

function samePhoto(left, right) {
  return Boolean(
    left &&
    right &&
    left.mimeType === right.mimeType &&
    left.size === right.size &&
    left.fingerprint === right.fingerprint,
  );
}

async function storedPhotoMetadata(photoUrl) {
  if (!photoUrl) return null;
  let pathname;
  try {
    pathname = new URL(String(photoUrl), "http://taptrack.local").pathname;
  } catch (_error) {
    return null;
  }
  const prefix = "/uploads/profile-photos/";
  if (!pathname.startsWith(prefix)) return null;
  const candidate = path.resolve(
    root,
    decodeURIComponent(pathname.slice(prefix.length)),
  );
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    return null;
  try {
    return photoMetadata(await fs.promises.readFile(candidate));
  } catch (_error) {
    return null;
  }
}

async function saveBuffer(type, idNumber, buffer, options = {}) {
  const detected = photoType(buffer);
  if (!detected)
    throw new Error(
      "Profile photos must contain valid JPEG, PNG, or WebP image data.",
    );
  const identifier = safeId(idNumber);
  if (!identifier)
    throw new Error("A valid ID number is required for a photo.");
  const directory = path.join(root, type);
  await fs.promises.mkdir(directory, { recursive: true });
  const version = options.versioned
    ? `-${crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12)}`
    : "";
  const filename = `${identifier}${version}${detected.extension}`;
  const destination = path.join(directory, filename);
  const temporary = path.join(
    directory,
    `.import-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await fs.promises.writeFile(temporary, buffer);
  try {
    await fs.promises.copyFile(
      temporary,
      destination,
      options.versioned ? fs.constants.COPYFILE_EXCL : 0,
    );
  } catch (error) {
    if (!(options.versioned && error.code === "EEXIST")) throw error;
  } finally {
    await fs.promises.unlink(temporary).catch(() => {});
  }
  return `/uploads/profile-photos/${type}/${filename}`;
}

async function save(type, idNumber, file) {
  const buffer = await fs.promises.readFile(file.path);
  const detected = photoType(buffer);
  if (!detected || detected.mimeType !== file.mimetype) {
    await fs.promises.unlink(file.path).catch(() => {});
    throw new Error(
      "Profile photos must contain valid JPEG, PNG, or WebP image data.",
    );
  }
  try {
    return await saveBuffer(type, idNumber, buffer);
  } finally {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}

function handlers(type, model) {
  return {
    singleUpload: upload.single("photo"),
    bulkUpload: upload.array("photos", QUEUE_BATCH_SIZE),
    single: async (req, res) => {
      if (!req.file)
        return res.status(400).json({ message: "Choose an image file." });
      const person = await model.getById(req.params.id);
      if (!person) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(404).json({ message: `${type} record not found.` });
      }
      const photoUrl = await save(type, person.idNumber, req.file);
      await model.updatePhoto(person.id, photoUrl);
      req.activityDescription = `Updated the profile photo for ${person.idNumber} — ${person.name}.`;
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
      const unchanged = [];
      const unmatched = [];
      try {
        for (const file of req.files) {
          const filenameId = safeId(path.parse(file.originalname).name);
          const person = byIdNumber.get(filenameId);
          if (!person) {
            unmatched.push(file.originalname);
            await fs.promises.unlink(file.path).catch(() => {});
            continue;
          }
          const [incomingMetadata, currentMetadata] = await Promise.all([
            fs.promises.readFile(file.path).then(photoMetadata),
            storedPhotoMetadata(person.photoUrl),
          ]);
          if (samePhoto(incomingMetadata, currentMetadata)) {
            unchanged.push({
              id: person.id,
              idNumber: person.idNumber,
              name: person.name,
              photoUrl: person.photoUrl,
            });
            await fs.promises.unlink(file.path).catch(() => {});
            continue;
          }
          const photoUrl = await save(type, person.idNumber, file);
          await model.updatePhoto(person.id, photoUrl);
          updated.push({
            id: person.id,
            idNumber: person.idNumber,
            name: person.name,
            photoUrl,
          });
        }
      } finally {
        await Promise.all(
          req.files.map((file) =>
            fs.promises.unlink(file.path).catch(() => {}),
          ),
        );
      }
      req.activityDescription = `Bulk processed ${updated.length + unchanged.length} ${type} profile photo${updated.length + unchanged.length === 1 ? "" : "s"}: ${updated.length} updated, ${unchanged.length} unchanged.`;
      res.json({ updated, unchanged, unmatched });
    },
  };
}

module.exports = {
  handlers,
  photoType,
  photoMetadata,
  samePhoto,
  storedPhotoMetadata,
  saveBuffer,
};
