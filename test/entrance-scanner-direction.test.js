const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const source = fs.readFileSync(require.resolve("../client/kiosk/script.js"), "utf8");

function inputFixture(assignments, connected = false) {
  const calls = [], timers = [], errors = [], recoveries = [], handled = new Set();
  const context = {
    localScannerAssignments: assignments, bridgeConnected: connected,
    pendingScannerAction: null, input: { value: "previous card" },
    scannerAssignmentReview: false,
    lastScannerSequence: 0, lastScannerEpoch: "test-server",
    pendingManualScans: new Set(),
    wasJustHandledByBridge: (value) => handled.has(value),
    scan: (idNumber, action) => calls.push({ idNumber, action }),
    setTimeout: (operation) => timers.push(operation),
    SoundFX: { error() {} }, showResult: (...args) => errors.push(args),
  };
  vm.runInNewContext(source.slice(source.indexOf("function configuredScannerAction()"), source.indexOf("// --- Main Scan Request Handler ---")), context);
  context.recoverScannerDirection = (idNumber, cursor) => recoveries.push({ idNumber, cursor });
  return { context, calls, errors, recoveries, handled, finishTimers: () => timers.splice(0).forEach((operation) => operation()) };
}

for (const action of ["Time In", "Time Out"]) {
  for (const connected of [true, false]) {
    test(`${action}-only entrance keeps its direction with bridge ${connected ? "late" : "offline"}`, () => {
      const f = inputFixture({ [action]: [{ deviceId: "reader-1" }] }, connected);
      f.context.submitManualScan("000111");
      assert.equal(f.context.input.value, "");
      f.finishTimers();
      assert.deepEqual(f.calls, [{ idNumber: "000111", action }]);
      f.context.submitManualScan("000222", true);
      f.finishTimers();
      assert.equal(f.calls[1].action, action, "Record must also respect a single assigned direction");
    });
  }
}

test("a delayed keyboard fallback retains its action even if assignments change", () => {
  const f = inputFixture({ "Time In": [{ deviceId: "reader-1" }] }, true);
  f.context.submitManualScan("000111");
  f.context.localScannerAssignments = { "Time Out": [{ deviceId: "reader-1" }] };
  f.finishTimers();
  assert.equal(f.calls[0].action, "Time In");
});

test("a bridge scan consumes its keyboard echo and pairing input never submits", () => {
  const f = inputFixture({ "Time In": [{ deviceId: "reader-1" }] }, true);
  f.context.submitManualScan("000111");
  f.handled.add("000111");
  f.finishTimers();
  assert.equal(f.calls.length, 0);
  f.context.pendingScannerAction = "Time Out";
  f.context.submitManualScan("PAIR");
  f.finishTimers();
  assert.equal(f.calls.length, 0);
});

for (const connected of [true, false]) {
  test(`two directional lanes never use Auto for unidentified scanner Enter (${connected ? "late bridge" : "offline"})`, () => {
    const f = inputFixture({ "Time In": [{ deviceId: "in" }], "Time Out": [{ deviceId: "out" }] }, connected);
    f.context.submitManualScan("000111");
    f.finishTimers();
    assert.equal(f.calls.length, 0);
    assert.equal(f.errors.length, 0, "A delayed reader must not cause an immediate error");
    assert.equal(f.recoveries.length, 1);
    f.context.submitManualScan("000222", true);
    f.finishTimers();
    assert.deepEqual(f.calls, [{ idNumber: "000222", action: "Auto" }], "A deliberate Record click remains available for manual entry");
  });
}

test("an entrance with no directional assignments retains manual automatic entry", () => {
  const f = inputFixture({ "Time In": [], "Time Out": [] });
  f.context.submitManualScan("000111");
  assert.deepEqual(f.calls, [{ idNumber: "000111", action: "Auto" }]);
});

test("a queued scan captures the action before settings can change", async () => {
  const operations = [], calls = [];
  const context = {
    localScannerAssignments: { "Time In": [{ deviceId: "in" }] },
    pendingScannerLookups: new Map(),
    pendingScans: 0, updatePendingScans() {}, SoundFX: { beep() {} },
    clearTimeout() {}, resetTimer: null,
    scanQueue: { add(_id, operation) { operations.push(operation); return Promise.resolve(); } },
    performScan: (idNumber, action) => calls.push({ idNumber, action }),
  };
  vm.runInNewContext(source.slice(source.indexOf("function configuredScannerAction()"), source.indexOf("function submitManualScan("))
    + source.slice(source.indexOf("function scan(raw,"), source.indexOf("async function performScan(")), context);
  await context.scan("000111");
  context.localScannerAssignments = { "Time Out": [{ deviceId: "out" }] };
  operations[0]();
  assert.deepEqual(calls, [{ idNumber: "000111", action: "Time In" }]);
});

for (const action of ["Time In", "Time Out"]) {
  test(`the API rejects a repeated explicit ${action} instead of alternating`, async () => {
    const writes = [];
    const model = {
      findPerson: async () => ({ id: 1, type: "Student", idNumber: "2023001", name: "Test" }),
      acquireScanLock: async () => Object.assign(async () => {}, { connection: {} }),
      findLatest: async () => ({ action, secondsAgo: 30, timestamp: new Date().toISOString() }),
      record: async (_person, recordedAction) => { writes.push(recordedAction); return { insertId: 1 }; },
    };
    const context = { exports: {}, URL, require: (name) => {
      if (name === "./attendance.model") return model;
      if (["../events/event.model", "../maintenance/academic_period/academic_period.model", "../../config/public-path"].includes(name)) return {};
      throw Error(name);
    } };
    vm.runInNewContext(fs.readFileSync(require.resolve("../api/attendance/attendance.controller"), "utf8"), context);
    const res = new EventEmitter();
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; res.emit("finish"); return res; };
    await context.exports.scan({ body: { idNumber: "2023001", action } }, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, new RegExp(`already has a ${action}`));
    assert.deepEqual(writes, []);
  });
}
