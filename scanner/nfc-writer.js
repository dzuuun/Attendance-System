const { spawn } = require("child_process");

const supportedPlatform = ["win32", "linux"].includes(process.platform);
let writing = false;
let lastReadAt = 0;

function configuration() {
  const command = String(process.env.NFC_WRITER_COMMAND || "").trim();
  let args = [];
  try {
    args = JSON.parse(process.env.NFC_WRITER_ARGS || "[]");
    if (!Array.isArray(args) || args.some((value) => typeof value !== "string"))
      throw new Error("NFC_WRITER_ARGS must be a JSON array of strings.");
  } catch (error) {
    return { command, args: [], error: error.message };
  }
  return { command, args, error: null };
}

function status() {
  const config = configuration();
  return {
    available: supportedPlatform && Boolean(config.command) && !config.error,
    configured: Boolean(config.command),
    busy: writing,
    platform: process.platform,
    message: !supportedPlatform
      ? "NFC card writing is supported on Windows and Raspberry Pi/Linux."
      : config.error
        ? config.error
        : !config.command
          ? "Configure NFC_WRITER_COMMAND before enrolling cards."
          : writing
            ? "The NFC writer is processing another card."
            : "NFC writer ready.",
  };
}

function execute(mode, value = "") {
  const config = configuration();
  if (!supportedPlatform)
    return Promise.reject(
      new Error("NFC card writing requires Windows or Raspberry Pi/Linux."),
    );
  if (config.error) return Promise.reject(new Error(config.error));
  if (!config.command)
    return Promise.reject(
      new Error("The NFC writer has not been configured on this server."),
    );
  if (writing)
    return Promise.reject(new Error("The NFC writer is already in use."));

  writing = true;
  return new Promise((resolve, reject) => {
    const child = spawn(config.command, [...config.args, `--${mode}`], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("NFC operation timed out. Keep the card on the reader."));
    }, 30000);
    const finish = (callback) => {
      clearTimeout(timer);
      writing = false;
      callback();
    };
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-16384);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-4096);
    });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", (code) => {
      finish(() => {
        if (code !== 0)
          return reject(
            new Error(stderr.trim() || `NFC writer stopped with code ${code}.`),
          );
        try {
          const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
          const result = JSON.parse(line || "{}");
          if (mode === "read") {
            if (result.read !== true)
              throw new Error("The NFC helper did not confirm the card read.");
            return resolve({ value: String(result.value || "") });
          }
          if (
            result.readBeforeWrite !== true ||
            result.verified !== true ||
            String(result.value) !== value
          )
            throw new Error("The card could not be verified after writing.");
          resolve({ verified: true });
        } catch (error) {
          reject(new Error(error.message || "Invalid NFC writer response."));
        }
      });
    });
    // Write mode receives only the exact identifier as plain text. Read mode
    // receives no card data from TapTrack.
    child.stdin.end(mode === "write" ? `${value}\n` : "");
  });
}

function readCard() {
  return execute("read").then((result) => {
    lastReadAt = Date.now();
    return result;
  });
}

function writeAndVerify(value) {
  value = String(value || "").trim();
  if (!/^(?:\d{7,8}|\d{12}|P\d{7,8})$/.test(value))
    return Promise.reject(
      new Error(
        "The card identifier must be a student ID, 12-digit LRN, or P-prefixed employee ID.",
      ),
    );
  if (!lastReadAt || Date.now() - lastReadAt > 60000)
    return Promise.reject(
      new Error("Read the NFC card before writing. Card reads expire after one minute."),
    );
  lastReadAt = 0;
  return execute("write", value);
}

module.exports = { status, readCard, writeAndVerify };
