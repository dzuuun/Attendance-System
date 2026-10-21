const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

for (const kiosk of ["kiosk", "library-kiosk"]) {
  test(`${kiosk} heartbeats cannot reload the page after an idle period or during a scan`, async () => {
    const source = fs.readFileSync(path.join(__dirname, `../client/${kiosk}/script.js`), "utf8");
    const start = kiosk === "kiosk" ? source.lastIndexOf("\ncheckInKiosk();") : source.indexOf("\nidle();\nupdateClock();");
    assert.ok(start > 0);
    const timers = [], completeHeartbeats = [];
    let now = 0, reloads = 0, heartbeats = 0;
    const context = vm.createContext({
      setInterval: (operation, delay) => timers.push({ operation, delay }),
      document: { addEventListener() {}, visibilityState: "visible" },
      window: { addEventListener() {} },
      location: { reload() { reloads++; } },
      Date: { now: () => now }, lastKioskActivity: 0,
      input: { focus() {} }, doneScannerModal: null, scannerModalBackdrop: null,
      renderIdleState() {}, idle() {}, updateClock() {}, loadGateOptions() {}, loadRecentScans() {},
      fetch: async () => ({ json: async () => ({ connected: false }) }), renderScannerStatus() {},
      reviewScannerAssignmentLink() {},
      promptKioskHealthCheck() {}, pollKioskCommands() {},
      checkInKiosk() {
        heartbeats++;
        return new Promise((resolve) => completeHeartbeats.push(resolve));
      },
    });
    vm.runInContext(source.slice(start), context);
    now = 15 * 60 * 1000;
    for (const timer of timers) timer.operation();
    // A new scan starts while a heartbeat from the idle period is still pending.
    context.lastKioskActivity = now;
    completeHeartbeats.forEach((finish) => finish());
    await new Promise(setImmediate);
    assert.ok(heartbeats >= 2, "Background health checks must remain active");
    assert.equal(reloads, 0);
  });
}

test("the startup guard blocks native kiosk form navigation before scan handlers load", () => {
  const handlers = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../client/kiosk-pairing.js"), "utf8"), {
    document: { addEventListener: (...args) => handlers.push(args) },
    window: { fetch: async () => ({ status: 200 }) },
    location: { pathname: "/kiosk/library" },
    localStorage: { getItem: () => "library-device-12345678", setItem() {} },
  });
  const submitGuard = handlers.find(([name]) => name === "submit");
  assert.equal(submitGuard[2], true, "The guard must run before form submit handlers");
  let navigationsBlocked = 0;
  submitGuard[1]({ target: { id: "kioskForm" }, preventDefault() { navigationsBlocked++; } });
  submitGuard[1]({ target: { id: "otherForm" }, preventDefault() { navigationsBlocked++; } });
  assert.equal(navigationsBlocked, 1);
});
