/*
 * Run this on a managed Windows/Linux kiosk to allow central restart, reboot,
 * and shutdown commands. Configure KIOSK_SERVER, KIOSK_ID, KIOSK_TYPE and
 * KIOSK_LOCATION before starting it; KIOSK_ID must be the browser kiosk ID.
 */
const os = require("os");
const { execFile } = require("child_process");

const server = String(process.env.KIOSK_SERVER || "").replace(/\/$/, "");
const kioskId = String(process.env.KIOSK_ID || "").trim();
const kioskType = String(process.env.KIOSK_TYPE || "entrance").trim();
const kioskLocation = String(process.env.KIOSK_LOCATION || "").trim();
const browserPath = String(process.env.KIOSK_BROWSER_PATH || "").trim();
if (!server || !kioskId || !kioskLocation) {
  console.error("Set KIOSK_SERVER, KIOSK_ID, and KIOSK_LOCATION before starting the kiosk control agent.");
  process.exit(1);
}

const primaryNetwork = Object.values(os.networkInterfaces()).flat().find((item) => item && !item.internal && item.address && item.mac && item.mac !== "00:00:00:00:00:00");
const macAddress = primaryNetwork?.mac || "";
const ipAddress = primaryNetwork?.address || "";
const post = async (path, body) => {
  const response = await fetch(`${server}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || `Server returned ${response.status}.`);
  return response.status === 204 ? null : response.json();
};
const run = (file, args) =>
  new Promise((resolve, reject) =>
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) =>
      error ? reject(new Error(stderr || error.message)) : resolve(stdout),
    ),
  );

async function heartbeat() {
  await post("/api/kiosk/heartbeat", {
    kioskId, type: kioskType, location: kioskLocation, name: os.hostname(), hostname: os.hostname(),
    uptimeSeconds: Math.floor(os.uptime()), macAddress, ipAddress, agent: true,
    operatingSystem: `${os.type()} ${os.release()}`,
  });
}
async function execute(command) {
  if (command.command === "screenshot") {
    if (process.platform !== "win32") throw new Error("Screenshot capture is currently supported by the Windows kiosk agent only.");
    const script = "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $b=[Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object Drawing.Bitmap $b.Width,$b.Height; $g=[Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[Drawing.Point]::Empty,$b.Size); $m=New-Object IO.MemoryStream; $bmp.Save($m,[Drawing.Imaging.ImageFormat]::Jpeg); [Convert]::ToBase64String($m.ToArray())";
    const base64 = (await run("powershell.exe", ["-NoProfile", "-Command", script])).trim();
    await post("/api/kiosk/screenshots", { kioskId, commandId: command.id, imageData: `data:image/jpeg;base64,${base64}` });
    return { handled: true, result: "Screenshot captured." };
  }
  if (command.command === "restart-browser") {
    if (process.platform === "win32") {
      await run("taskkill", ["/F", "/IM", "msedge.exe"]);
      await run("cmd.exe", ["/c", "start", "", browserPath || "msedge", `${server}/kiosk/entrance`]);
    } else await run("sh", ["-lc", `${browserPath || "xdg-open"} '${server}/kiosk/entrance'`]);
    return { result: "Kiosk browser restarted." };
  }
  if (command.command === "reboot") {
    if (process.platform === "win32") await run("shutdown", ["/r", "/t", "0"]);
    else await run("shutdown", ["-r", "now"]);
    return { result: "Reboot requested." };
  }
  if (command.command === "shutdown") {
    if (process.platform === "win32") await run("shutdown", ["/s", "/t", "0"]);
    else await run("shutdown", ["-h", "now"]);
    return { result: "Shutdown requested." };
  }
  throw new Error("This control agent does not support that command.");
}
async function poll() {
  try {
    const result = await post("/api/kiosk/commands/poll", { kioskId, channel: "agent" });
    for (const command of result.commands || []) {
      try {
        const outcome = await execute(command);
        if (!outcome.handled) await post("/api/kiosk/commands/complete", { kioskId, commandId: command.id, status: "Completed", resultText: outcome.result });
      }
      catch (error) { await post("/api/kiosk/commands/complete", { kioskId, commandId: command.id, status: "Failed", resultText: error.message }); }
    }
  } catch (error) { console.error(`Kiosk control poll failed: ${error.message}`); }
}
(async () => { await heartbeat().catch((error) => console.error(error.message)); await poll(); setInterval(() => heartbeat().catch(() => {}), 90_000); setInterval(poll, 5_000); })();
