const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("event stations accept ID numbers and card numbers without erasing the next scan", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../client/events/scan/script.js"), "utf8");
  const handlers = {};
  const input = { value: "", focus() {}, addEventListener: (event, callback) => { handlers[`input:${event}`] = callback; } };
  const form = { addEventListener: (event, callback) => { handlers[`form:${event}`] = callback; }, requestSubmit() { handlers["form:submit"]({ preventDefault() {} }); } };
  const calls = [], timers = [], finishes = [];
  let action = "Time In";
  const context = vm.createContext({
    $: (selector) => selector === "#eventScanInput" ? input : selector === "#eventScanForm" ? form : { addEventListener() {}, setAttribute() {} },
    document: { querySelector: () => null, querySelectorAll: () => [] },
    eventRecord: { isActive: true }, eventId: 9, bridgeConnected: false,
    selectedAction: () => action, result() {}, renderCurrentAttendee() {}, formatTime: (value) => value,
    loadEventScans: async () => {},
    setTimeout: (callback) => timers.push(callback), Date,
    TapTrackCameraScanner: { open() {} },
    api: async (url, options) => {
      calls.push({ url, ...JSON.parse(options.body) });
      return new Promise((resolve) => finishes.push(() => resolve({ name: "Test", action: "Time In", timestamp: "2026-10-21" })));
    },
  });
  vm.runInContext(source.slice(source.indexOf("async function scan(value"), source.indexOf("const scannerEvents =")), context);
  input.value = "P2023007";
  handlers["input:keydown"]({ key: "Enter", preventDefault() {} });
  input.value = "00aa9876";
  handlers["input:keydown"]({ key: "Enter", preventDefault() {} });
  assert.equal(input.value, "");
  assert.deepEqual(calls.map((call) => call.idNumber), ["P2023007", "00AA9876"]);
  input.value = "NEXT-CARD";
  finishes[0](); finishes[1]();
  await new Promise(setImmediate);
  assert.equal(input.value, "NEXT-CARD");
  context.bridgeConnected = true;
  input.value = "A2010007";
  handlers["input:keydown"]({ key: "Enter", preventDefault() {} });
  action = "Time Out";
  timers.shift()();
  assert.equal(calls.at(-1).idNumber, "A2010007");
  assert.equal(calls.at(-1).action, "Time In", "Delayed keyboard scans must retain the selected action at capture");
  input.value = "00077777";
  handlers["input:keydown"]({ key: "Enter", preventDefault() {} });
  vm.runInContext('recentBridgeScans.set("00077777", Date.now())', context);
  timers.shift()();
  assert.equal(calls.length, 3, "The keyboard echo of a bridge scan must not create another request");
  finishes[2]();
});
