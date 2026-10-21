const test = require("node:test");
const assert = require("node:assert/strict");
const { createScanQueue } = require("../client/kiosk/scan-queue");
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("a slow attendee does not block another attendee, while the same person's taps stay ordered", async () => {
  const queue = createScanQueue(4);
  const started = [];
  let finish;
  const first = queue.add("A", () => { started.push("A1"); return new Promise((resolve) => { finish = resolve; }); });
  const nextA = queue.add("A", () => { started.push("A2"); });
  const b = queue.add("B", () => { started.push("B"); });
  await b;
  assert.deepEqual(started, ["A1", "B"]);
  finish();
  await Promise.all([first, nextA]);
  assert.deepEqual(started, ["A1", "B", "A2"]);
});

test("burst traffic is bounded to four simultaneous saves and failed saves release their slot", async () => {
  const queue = createScanQueue(4);
  const releases = [];
  let active = 0;
  let peak = 0;
  const requests = Array.from({ length: 12 }, (_, key) => queue.add(key, async () => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => releases.push(resolve));
    active--;
    if (key === 0) throw new Error("Save failed");
  }));
  const completion = Promise.allSettled(requests);
  await settle();
  assert.equal(releases.length, 4);
  for (let i = 0; i < 12; i++) { releases[i](); await settle(); }
  assert.equal(peak, 4);
  assert.equal((await completion).filter((result) => result.status === "rejected").length, 1);
});
