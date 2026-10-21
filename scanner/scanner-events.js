exports.lookup = (bridge, req, res) => {
  const value = String(req.query.value || "").trim().toUpperCase();
  const after = Number(req.query.after);
  if (!value || value.length > 128 || !Number.isSafeInteger(after) || after < 0)
    return res.status(400).json({ message: "Provide the scanned value and a valid scanner sequence." });
  res.setHeader("Cache-Control", "no-store");
  const cursor = !req.query.epoch ? bridge.scanSequence
    : req.query.epoch === bridge.scanEpoch ? after : 0;
  res.json({ scans: bridge.lookupScan(value, cursor), lastScanSequence: bridge.scanSequence, scanEpoch: bridge.scanEpoch });
};

exports.subscribe = (bridge, _req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const send = (event, value) => {
    if (!res.destroyed && !res.writableEnded)
      res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
  };
  const listeners = {
    status: () => send("status", bridge.status()),
    scan: (value) => send("scan", value),
  };
  for (const [event, listener] of Object.entries(listeners)) bridge.on(event, listener);
  listeners.status();
  // Keep the stream moving through proxies even when no card is being scanned.
  const heartbeat = setInterval(listeners.status, 15000);
  heartbeat.unref?.();
  res.once("close", () => {
    clearInterval(heartbeat);
    for (const [event, listener] of Object.entries(listeners)) bridge.off(event, listener);
  });
};
