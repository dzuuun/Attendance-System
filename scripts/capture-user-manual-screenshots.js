const fs = require("fs");
const path = require("path");

const baseUrl = process.env.TAPTRACK_MANUAL_URL || "https://localhost:4000";
const username = process.env.TAPTRACK_MANUAL_USERNAME;
const password = process.env.TAPTRACK_MANUAL_PASSWORD;
const debugPort = process.env.TAPTRACK_DEBUG_PORT || "9223";
const outputDir = path.resolve(
  process.env.TAPTRACK_MANUAL_OUTPUT || "docs/user-manual/screenshots",
);
const privacyMode = process.env.TAPTRACK_MANUAL_PRIVACY !== "0";

if (!username || !password) {
  throw new Error(
    "Set TAPTRACK_MANUAL_USERNAME and TAPTRACK_MANUAL_PASSWORD before running this script.",
  );
}

const pages = [
  ["02-overview", "/overview"],
  ["03-university-entrance-logs", "/attendance"],
  ["04-event-management", "/events"],
  ["05-past-events", "/events/past"],
  ["06-library-entrance-logs", "/library/entrance"],
  ["07-internet-section-logs", "/library/internet-section"],
  ["08-students", "/maintenance/student"],
  ["21-alumni", "/maintenance/alumni"],
  ["09-employees", "/maintenance/employee"],
  ["10-schools", "/maintenance/school"],
  ["11-colleges", "/maintenance/college"],
  ["12-departments", "/maintenance/department"],
  ["13-employee-departments", "/maintenance/employee-department"],
  ["14-programs", "/maintenance/program"],
  ["15-academic-periods", "/maintenance/academic-periods"],
  ["16-system-settings", "/maintenance/settings"],
  ["17-activity-log", "/user/activity-log"],
  ["18-permissions", "/user/permissions"],
  ["19-user-management", "/user/user-management"],
  ["20-change-password", "/account/change-password"],
  ["22-kiosks", "/maintenance/kiosks"],
];

let nextId = 0;
const pending = new Map();

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getPageTarget() {
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then(
    (res) => res.json(),
  );
  return targets.find((target) => target.type === "page");
}

function command(socket, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(socket, expression) {
  const response = await command(socket, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.text || "Browser evaluation failed.",
    );
  }
  return response.result?.value;
}

async function waitFor(socket, expression, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(socket, expression)) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function navigate(socket, pathname) {
  await command(socket, "Page.navigate", { url: `${baseUrl}${pathname}` });
  await waitFor(socket, "document.readyState === 'complete'");
  await delay(1800);
}

async function screenshot(socket, name) {
  if (privacyMode) {
    await evaluate(
      socket,
      `(() => {
        document.querySelectorAll('table tbody tr').forEach((row) => row.remove());
        document.querySelectorAll('.dataTables_empty, .dt-empty').forEach((cell) => {
          cell.textContent = 'Records hidden for data privacy';
        });
        return true;
      })()`,
    );
    await delay(100);
  }
  const result = await command(socket, "Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  fs.writeFileSync(path.join(outputDir, `${name}.png`), result.data, "base64");
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const target = await getPageTarget();
  if (!target)
    throw new Error("No browser page is available on the debug port.");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result || {});
  });

  await command(socket, "Page.enable");
  await command(socket, "Runtime.enable");
  await command(socket, "Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await navigate(socket, "/login");
  await screenshot(socket, "01-sign-in");
  await evaluate(
    socket,
    `(async () => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(${JSON.stringify({ username, password })})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Sign-in failed.');
      return true;
    })()`,
  );

  for (const [name, pathname] of pages) {
    await navigate(socket, pathname);
    await screenshot(socket, name);
    process.stdout.write(`Captured ${name}.png\n`);
  }

  socket.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
