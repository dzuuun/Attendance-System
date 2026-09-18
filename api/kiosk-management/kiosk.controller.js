const model = require("./kiosk.model");
const dgram = require("dgram");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const TYPES = new Set(["entrance", "library", "internet"]);

const serverLanIp = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .find(
      (network) =>
        network &&
        network.family === "IPv4" &&
        !network.internal &&
        !network.address.startsWith("169.254."),
    )?.address || null;

function readIdentity(body = {}) {
  const id = String(body.kioskId || "").trim();
  const type = String(body.type || "")
    .trim()
    .toLowerCase();
  const location = String(body.location || "")
    .trim()
    .slice(0, 120);
  const name = String(body.name || "")
    .trim()
    .slice(0, 120);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(id) || !TYPES.has(type) || !location)
    return null;
  return { id, type, location, name };
}

exports.heartbeat = async (req, res) => {
  const kiosk = readIdentity(req.body);
  if (!kiosk)
    return res.status(400).json({ message: "Invalid kiosk identity." });
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const agentIp = String(req.body.ipAddress || "").trim();
  const isAgent = req.body.agent === true;
  const observedIp =
    isAgent && /^(?:\d{1,3}\.){3}\d{1,3}$|^[a-f\d:]+$/i.test(agentIp)
      ? agentIp
      : forwarded || req.socket.remoteAddress?.replace(/^::ffff:/, "") || null;
  // A kiosk served from localhost shares the same machine as TapTrack. Show
  // that machine's usable LAN address instead of the meaningless ::1 value.
  const ipAddress = ["::1", "127.0.0.1", "localhost"].includes(observedIp)
    ? serverLanIp() || observedIp
    : observedIp;
  const saved = await model.heartbeat({
    ...kiosk,
    userAgent: req.get("user-agent"),
    ipAddress,
    hostname: String(req.body.hostname || "")
      .trim()
      .slice(0, 255),
    uptimeSeconds: Number.isFinite(Number(req.body.uptimeSeconds))
      ? Math.max(0, Math.floor(Number(req.body.uptimeSeconds)))
      : null,
    browserStatus: String(req.body.browserStatus || "")
      .trim()
      .slice(0, 40),
    currentPage: String(req.body.currentPage || "")
      .trim()
      .slice(0, 500),
    macAddress: String(req.body.macAddress || "")
      .trim()
      .slice(0, 32),
    operatingSystem: String(req.body.operatingSystem || "")
      .trim()
      .slice(0, 160),
    agent: isAgent,
  });
  res.json({
    kioskId: saved.id,
    enabled: Boolean(saved.isEnabled),
    location: saved.location,
  });
};

exports.config = async (req, res) => {
  const kioskId = String(req.query.kioskId || "").trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(kioskId))
    return res.status(400).json({ message: "Invalid kiosk identity." });
  const kiosk = await model.getById(kioskId);
  if (!kiosk)
    return res.status(404).json({ message: "Kiosk is not registered." });
  res.json({
    enabled: Boolean(kiosk.isEnabled),
    location: kiosk.location,
    kioskType: kiosk.kioskType,
  });
};

exports.getAll = async (_req, res) => res.json(await model.getAll());
exports.getLogs = async (req, res) =>
  res.json(await model.getRecentCommands(req.params.id));

const COMMANDS = {
  restartBrowser: { channel: "agent", command: "restart-browser" },
  reloadAttendance: { channel: "browser", command: "reload" },
  reboot: { channel: "agent", command: "reboot" },
  shutdown: { channel: "agent", command: "shutdown" },
  screenshot: { channel: "agent", command: "screenshot" },
  showEntrance: {
    channel: "browser",
    command: "navigate",
    payload: { path: "/kiosk/entrance" },
  },
  showLibrary: {
    channel: "browser",
    command: "navigate",
    payload: { path: "/kiosk/library" },
  },
  showInternet: {
    channel: "browser",
    command: "navigate",
    payload: { path: "/kiosk/internet-section" },
  },
};

function wake(macAddress) {
  const hex = String(macAddress || "").replace(/[^a-f0-9]/gi, "");
  if (!/^[a-f0-9]{12}$/i.test(hex))
    throw new Error(
      "No valid Wake-on-LAN MAC address is registered for this kiosk.",
    );
  const mac = Buffer.from(hex, "hex");
  const packet = Buffer.concat([
    Buffer.alloc(6, 0xff),
    ...Array.from({ length: 16 }, () => mac),
  ]);
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    socket.once("error", reject);
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 9, "255.255.255.255", (error) => {
        socket.close();
        error ? reject(error) : resolve();
      });
    });
  });
}

exports.queueAction = async (req, res) => {
  const definition = COMMANDS[String(req.body?.action || "")];
  const ids = Array.isArray(req.body?.kioskIds)
    ? req.body.kioskIds
        .map(String)
        .filter((id) => /^[A-Za-z0-9_-]{16,80}$/.test(id))
    : [];
  if (!ids.length)
    return res.status(400).json({ message: "Select at least one kiosk." });
  if (req.body?.action === "wake") {
    const kiosks = await Promise.all(ids.map((id) => model.getById(id)));
    const results = await Promise.allSettled(
      kiosks.filter(Boolean).map((kiosk) => wake(kiosk.macAddress)),
    );
    const queued = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    if (!queued)
      return res.status(400).json({
        message: "Selected kiosks do not have a valid Wake-on-LAN MAC address.",
      });
    req.activityLabel = `Wake-on-LAN (${queued} kiosks)`;
    return res.status(202).json({
      queued,
      message: `Wake signal sent to ${queued} kiosk${queued === 1 ? "" : "s"}.`,
    });
  }
  if (!definition)
    return res.status(400).json({ message: "Select a valid kiosk action." });
  const queued = await model.queueCommands(
    ids,
    definition.command,
    definition.channel,
    definition.payload,
  );
  req.activityLabel = `${definition.command} (${queued} kiosk${queued === 1 ? "" : "s"})`;
  req.activityDescription = `Queued central kiosk action for ${queued} kiosk(s).`;
  res.status(202).json({
    queued,
    message: `Action queued for ${queued} kiosk${queued === 1 ? "" : "s"}.`,
  });
};

exports.pollCommands = async (req, res) => {
  const kioskId = String(req.body?.kioskId || "").trim();
  const channel = req.body?.channel === "agent" ? "agent" : "browser";
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(kioskId))
    return res.status(400).json({ message: "Invalid kiosk identity." });
  res.json({ commands: await model.takeCommands(kioskId, channel) });
};

exports.completeCommand = async (req, res) => {
  const kioskId = String(req.body?.kioskId || "").trim();
  const commandId = Number(req.body?.commandId);
  const status = ["Completed", "Failed", "Unsupported"].includes(
    req.body?.status,
  )
    ? req.body.status
    : null;
  if (
    !/^[A-Za-z0-9_-]{16,80}$/.test(kioskId) ||
    !Number.isInteger(commandId) ||
    !status
  )
    return res.status(400).json({ message: "Invalid command result." });
  const saved = await model.completeCommand(
    kioskId,
    commandId,
    status,
    req.body?.resultText,
  );
  if (!saved) return res.status(404).json({ message: "Command not found." });
  res.status(204).end();
};

exports.saveScreenshot = async (req, res) => {
  const kioskId = String(req.body?.kioskId || "").trim();
  const commandId = Number(req.body?.commandId);
  const imageData = String(req.body?.imageData || "");
  const match = imageData.match(
    /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (
    !/^[A-Za-z0-9_-]{16,80}$/.test(kioskId) ||
    !Number.isInteger(commandId) ||
    !match
  )
    return res.status(400).json({ message: "Invalid screenshot." });
  const image = Buffer.from(match[2], "base64");
  if (!image.length || image.length > 8 * 1024 * 1024)
    return res
      .status(413)
      .json({ message: "Screenshot must be smaller than 8 MB." });
  const extension = match[1] === "jpeg" ? "jpg" : "png";
  const filename = `${kioskId}-${commandId}-${Date.now()}.${extension}`;
  const folder = path.join(__dirname, "../../uploads/kiosk-screenshots");
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, filename), image);
  const url = `/uploads/kiosk-screenshots/${filename}`;
  const saved = await model.completeCommand(
    kioskId,
    commandId,
    "Completed",
    `Screenshot captured: ${url}`,
  );
  if (!saved)
    return res.status(404).json({ message: "Screenshot command not found." });
  res.status(201).json({ url });
};

exports.setEnabled = async (req, res) => {
  const isEnabled = req.body?.isEnabled === true;
  if (typeof req.body?.isEnabled !== "boolean")
    return res
      .status(400)
      .json({ message: "Choose whether the kiosk is enabled." });
  const kiosk = await model.setEnabled(req.params.id, isEnabled);
  if (!kiosk) return res.status(404).json({ message: "Kiosk not found." });
  req.activityLabel = kiosk.displayName || `${kiosk.location} kiosk`;
  req.activityDescription = `${isEnabled ? "Enabled" : "Disabled"} kiosk ${kiosk.id}.`;
  res.json(kiosk);
};
