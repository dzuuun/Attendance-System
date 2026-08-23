const { EventEmitter } = require("events");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

class ScannerBridge extends EventEmitter {
  constructor() {
    super();
    this.configFile = path.join(__dirname, "scanner-devices.json");
    this.assignments = this.load();
    this.pendingAction = null;
    this.available = process.platform === "win32" || process.platform === "linux";
    this.connected = false;
    this.start();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.configFile, "utf8"));
    } catch (_error) {
      return {};
    }
  }

  save() {
    fs.writeFileSync(this.configFile, JSON.stringify(this.assignments, null, 2));
  }

  start() {
    if (!this.available) return;
    const helper =
      process.platform === "win32"
        ? ["powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "windows-reader.ps1")]]
        : ["python3", [path.join(__dirname, "linux-reader.py")]];
    this.child = spawn(helper[0], helper[1], { stdio: ["ignore", "pipe", "pipe"] });
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
    if (this.pendingAction) {
      for (const [action, device] of Object.entries(this.assignments)) {
        if (device.deviceId === scan.deviceId) delete this.assignments[action];
      }
      this.assignments[this.pendingAction] = {
        deviceId: scan.deviceId,
        name: scan.name || "USB scanner",
      };
      const action = this.pendingAction;
      this.pendingAction = null;
      this.save();
      this.emit("assigned", { action, device: this.assignments[action] });
      return;
    }
    const match = Object.entries(this.assignments).find(
      ([, device]) => device.deviceId === scan.deviceId,
    );
    if (match) this.emit("scan", { idNumber: scan.value, action: match[0] });
    else this.emit("unassigned", { name: scan.name || "USB scanner" });
  }

  status() {
    return {
      available: this.available,
      connected: this.connected,
      platform: process.platform,
      pendingAction: this.pendingAction,
      assignments: this.assignments,
    };
  }

  pair(action) {
    if (!["Time In", "Time Out"].includes(action)) throw new Error("Invalid scanner action.");
    this.pendingAction = action;
    this.emit("status");
  }
}

module.exports = new ScannerBridge();
