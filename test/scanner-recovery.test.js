const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const http = require("node:http");
const { once, EventEmitter } = require("node:events");
const events = require("../scanner/scanner-events");

function bridgeFixture() {
  const context = { module: { exports: {} }, process: { platform: "darwin" },
    require(name) { return require(name); }, Date };
  vm.runInNewContext(fs.readFileSync(require.resolve("../scanner/scanner-bridge"), "utf8"), context);
  return context.module.exports;
}

test("reader history matches the exact card, excludes earlier taps, and expires", () => {
  const bridge = bridgeFixture();
  bridge.receive(JSON.stringify({ deviceId: "in", value: "000111" }));
  bridge.receive(JSON.stringify({ deviceId: "out", value: "000222" }));
  bridge.receive(JSON.stringify({ deviceId: "in", value: "000111" }));
  const matches = bridge.lookupScan("000111", 1);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].sequence, 3);
  assert.equal(matches[0].deviceId, "in");
  assert.equal(bridge.status().lastScanSequence, 3);
  assert.equal(matches[0].epoch, bridge.status().scanEpoch);
  matches[0].receivedAt = Date.now() - 10001;
  assert.equal(bridge.lookupScan("000111", 1).length, 0);
  for (let index = 0; index < 300; index++) bridge.receive(JSON.stringify({ deviceId: "in", value: String(index) }));
  assert.equal(bridge.recentScans.length, 256);
});

test("recovery requests isolate one card and recover across a server restart", () => {
  const bridge = bridgeFixture();
  bridge.receive(JSON.stringify({ deviceId: "in", value: "00ab" }));
  const res = { setHeader() {}, json(body) { this.body = body; }, status(code) { this.code = code; return this; } };
  events.lookup(bridge, { query: { value: "00AB", after: "99", epoch: "previous-server" } }, res);
  assert.equal(res.body.scans.length, 1);
  assert.equal(res.body.scanEpoch, bridge.scanEpoch);
  events.lookup(bridge, { query: { value: "00AB", after: "0", epoch: "" } }, res);
  assert.equal(res.body.scans.length, 0, "Startup must not reuse a scan from before this page knew the reader cursor");
  for (const query of [{ value: "00AB", after: "-1" }, { value: "", after: "0" }, { value: "00AB", after: "NaN" }]) {
    events.lookup(bridge, { query }, res);
    assert.equal(res.code, 400);
  }
});

test("the real HTTP event stream delivers scanner input and releases listeners on disconnect", async () => {
  const bridge = new EventEmitter();
  bridge.status = () => ({ connected: true, lastScanSequence: 0, scanEpoch: "test" });
  const server = http.createServer((req, res) => events.subscribe(bridge, req, res));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  let request, response;
  try {
    const received = new Promise((resolve, reject) => {
      request = http.get(`http://127.0.0.1:${server.address().port}`, (res) => {
        response = res;
        assert.equal(res.headers["x-accel-buffering"], "no");
        assert.match(res.headers["cache-control"], /no-transform/);
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
          if (text.includes('"idNumber":"000111"')) resolve(text);
        });
        res.on("error", reject);
        bridge.emit("scan", { deviceId: "in", idNumber: "000111", sequence: 1, epoch: "test" });
      });
      request.on("error", reject);
    });
    const text = await received;
    assert.match(text, /event: status/);
    assert.match(text, /event: scan/);
    assert.equal(bridge.listenerCount("scan"), 1);
    response.destroy();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(bridge.listenerCount("scan"), 0);
    assert.equal(bridge.listenerCount("status"), 0);
  } finally {
    request?.destroy();
    response?.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
});

function pageFixture(replies) {
  const source = fs.readFileSync(require.resolve("../client/kiosk/script"), "utf8");
  const calls = [], results = [];
  let attempts = 0;
  const context = {
    localScannerAssignments: { "Time In": [{ deviceId: "in" }], "Time Out": [{ deviceId: "out" }] },
    pendingScannerLookups: new Map(), handledScannerEvents: new Set(),
    lastScannerEpoch: "current", lastScannerSequence: 1, URLSearchParams,
    showResult: (...args) => results.push(args), SoundFX: { error() {} },
    rememberBridgeScan() {}, scan: async (idNumber, action) => calls.push({ idNumber, action }),
    setTimeout: (callback) => { callback(); },
    fetch: async () => ({ ok: true, json: async () => replies[Math.min(attempts++, replies.length - 1)] }),
  };
  vm.runInNewContext(source.slice(source.indexOf("function updateScannerCursor("), source.indexOf("function submitManualScan(")), context);
  return { context, calls, results, get attempts() { return attempts; } };
}

test("a delayed reader is recovered in its assigned lane without an error or an Auto request", async () => {
  const event = { deviceId: "in", idNumber: "000111", sequence: 2, epoch: "current" };
  const page = pageFixture([
    { scans: [], scanEpoch: "current", lastScanSequence: 1 },
    { scans: [event], scanEpoch: "current", lastScanSequence: 2 },
  ]);
  await page.context.recoverScannerDirection("000111", { sequence: 1, epoch: "current" });
  assert.equal(page.attempts, 2);
  assert.deepEqual(page.calls, [{ idNumber: "000111", action: "Time In" }]);
  assert.ok(page.results.every(([type]) => type !== "error"));
  assert.equal(page.context.consumeScannerEvent(event), false, "The eventual SSE event must not record attendance again");
});

test("recovery preserves Time Out and does not reuse event sequences from an older server", async () => {
  const event = { deviceId: "out", idNumber: "000222", sequence: 1, epoch: "restarted" };
  const page = pageFixture([{ scans: [event], scanEpoch: "restarted", lastScanSequence: 1 }]);
  page.context.handledScannerEvents.add("current:1");
  await page.context.recoverScannerDirection("000222", { sequence: 9, epoch: "current" });
  assert.deepEqual(page.calls, [{ idNumber: "000222", action: "Time Out" }]);
});

test("unknown and conflicting reader events never select a direction or use Auto", async () => {
  for (const scans of [[], [{ deviceId: "unknown", sequence: 2, epoch: "current" }], [
    { deviceId: "in", sequence: 2, epoch: "current" }, { deviceId: "out", sequence: 3, epoch: "current" },
  ]]) {
    const page = pageFixture([{ scans, scanEpoch: "current", lastScanSequence: 3 }]);
    await page.context.recoverScannerDirection("000111", { sequence: 1, epoch: "current" });
    assert.equal(page.calls.length, 0);
    assert.equal(page.results.at(-1)[0], "error");
    assert.equal(page.context.pendingScannerLookups.size, 0);
  }
});
