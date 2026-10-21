const { EventEmitter } = require("events");
const { spawn } = require("child_process");
const path = require("path");

class ScannerBridge extends EventEmitter {
  constructor() {
    super();
    this.available =
      process.platform === "win32" || process.platform === "linux";
    this.connected = false;
    this.scanSequence = 0;
    this.scanEpoch = require("crypto").randomUUID();
    this.recentScans = [];
    this.start();
  }

  start() {
    if (!this.available) return;
    const helper =
      process.platform === "win32"
        ? [
            "powershell.exe",
            [
              "-NoProfile",
              "-ExecutionPolicy",
              "Bypass",
              "-File",
              path.join(__dirname, "windows-reader.ps1"),
            ],
          ]
        : ["python3", [path.join(__dirname, "linux-reader.py")]];
    this.child = spawn(helper[0], helper[1], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let buffer = "";
    this.child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      lines.forEach((line) => this.receive(line));
    });
    this.child.stderr.on("data", (chunk) =>
      console.error(`Scanner helper: ${String(chunk).trim()}`),
    );
    this.child.once("error", (error) => {
      this.connected = false;
      this.emit("status");
      console.error(`Scanner helper could not start: ${error.message}`);
    });
    this.child.once("spawn", () => {
      this.connected = true;
      this.emit("status");
    });
    this.child.once("exit", (code) => {
      this.connected = false;
      this.emit("status");
      console.error(`Scanner helper stopped (code ${code}).`);
    });
    process.once("exit", () => this.child?.kill());
  }

  receive(line) {
    let scan;
    try {
      scan = JSON.parse(line);
    } catch (_error) {
      return;
    }
    if (!scan.deviceId || !scan.value) return;
    const recorded = {
      idNumber: scan.value,
      deviceId: scan.deviceId,
      name: scan.name || "USB scanner",
      sequence: ++this.scanSequence,
      epoch: this.scanEpoch,
      receivedAt: Date.now(),
    };
    this.recentScans.push(recorded);
    this.recentScans = this.recentScans.filter((item) => recorded.receivedAt - item.receivedAt < 10000).slice(-256);
    this.emit("scan", recorded);
  }

  lookupScan(value, afterSequence) {
    const now = Date.now();
    return this.recentScans.filter((scan) => scan.sequence > afterSequence
      && now - scan.receivedAt < 10000
      && String(scan.idNumber).trim().toUpperCase() === value);
  }

  status() {
    return {
      available: this.available,
      connected: this.connected,
      platform: process.platform,
      assignmentStorage: "terminal-local",
      lastScanSequence: this.scanSequence,
      scanEpoch: this.scanEpoch,
    };
  }
}

module.exports = new ScannerBridge();
