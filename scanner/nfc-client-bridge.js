require("dotenv").config();
const http = require("http");
const writer = require("./nfc-writer");

const port = Number(process.env.NFC_BRIDGE_PORT) || 47831;
const allowedOrigins = new Set(
  String(process.env.NFC_BRIDGE_ALLOWED_ORIGINS || "http://localhost:4000")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

function send(res, status, payload, origin) {
  if (origin && allowedOrigins.has(origin))
    res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Content-Type", "application/json");
  res.writeHead(status);
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  if (origin && !allowedOrigins.has(origin))
    return send(res, 403, { message: "This TapTrack origin is not authorized." });
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.writeHead(204);
    return res.end();
  }
  try {
    if (req.method === "GET" && req.url === "/status")
      return send(res, 200, { ...writer.status(), bridge: "client" }, origin);
    if (req.method === "POST" && req.url === "/read")
      return send(res, 200, await writer.readCard(), origin);
    if (req.method === "POST" && req.url === "/write") {
      let body = "";
      for await (const chunk of req) body = (body + chunk).slice(-4096);
      const value = JSON.parse(body || "{}").value;
      await writer.writeAndVerify(value);
      return send(res, 200, { verified: true, value }, origin);
    }
    send(res, 404, { message: "NFC bridge endpoint not found." }, origin);
  } catch (error) {
    send(res, 500, { message: error.message || "NFC operation failed." }, origin);
  }
});

server.listen(port, "127.0.0.1", () =>
  console.log(`TapTrack NFC client bridge listening at http://127.0.0.1:${port}`),
);
