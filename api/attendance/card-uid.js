// Android sends the raw UID. Resolve its decimal HID representations against
// enrolled card IDs only; never interpret one of these candidates as an official ID.
function cardNumberCandidates(uid) {
  if (typeof uid !== "string" || !/^(?:[0-9a-f]{2}){1,32}$/i.test(uid))
    throw Object.assign(new Error("The scanned card UID is invalid. Tap the card again."), { status: 400 });
  const bytes = Buffer.from(uid, "hex");
  const parts = [bytes];
  if (bytes.length > 4) parts.push(bytes.subarray(0, 4), bytes.subarray(-4));
  const candidates = new Set();
  for (const part of parts) {
    for (const ordered of [part, Buffer.from(part).reverse()]) {
      const decimal = BigInt(`0x${ordered.toString("hex")}`).toString(10);
      // Card IDs allow 128 characters. Include padding without converting stored
      // IDs to numbers, so indexed string comparisons preserve their exact value.
      for (let width = decimal.length; width <= 128; width++)
        candidates.add(decimal.padStart(width, "0"));
    }
  }
  return [...candidates];
}

module.exports = { cardNumberCandidates };
