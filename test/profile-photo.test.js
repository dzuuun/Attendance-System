const test = require("node:test");
const assert = require("node:assert/strict");
const {
  photoType,
  photoMetadata,
  samePhoto,
} = require("../api/maintenance/profile-photo");

test("SQL Server profile-photo binaries are identified by image signature", () => {
  assert.deepEqual(photoType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), {
    mimeType: "image/jpeg",
    extension: ".jpg",
  });
  assert.deepEqual(
    photoType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    { mimeType: "image/png", extension: ".png" },
  );
  assert.deepEqual(photoType(Buffer.from("RIFF0000WEBP")), {
    mimeType: "image/webp",
    extension: ".webp",
  });
  assert.equal(photoType(Buffer.from("not an image")), null);
});

test("profile photos are changed only when metadata or content differs", () => {
  const original = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
  const identical = Buffer.from(original);
  const sameSizeDifferentContent = Buffer.from([0xff, 0xd8, 0xff, 0x02]);
  const differentSize = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]);

  assert.equal(
    samePhoto(photoMetadata(original), photoMetadata(identical)),
    true,
  );
  assert.equal(
    samePhoto(photoMetadata(original), photoMetadata(sameSizeDifferentContent)),
    false,
  );
  assert.equal(
    samePhoto(photoMetadata(original), photoMetadata(differentSize)),
    false,
  );
});
