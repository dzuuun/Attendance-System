const { $, api, escapeHtml, emptyRow, formatDate, formatTime, init, toast } =
  TapTrack;
let kiosks = [],
  selectedId = null;
const typeName = (type) =>
  ({
    entrance: "University entrance",
    library: "Library",
    internet: "Internet Section",
  })[type] || type;
const isOnline = (kiosk) => Boolean(kiosk.isOnline);
const uptime = (value) => {
  const seconds = Number(value || 0);
  return seconds
    ? `${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m`
    : "Not reported";
};
const browserName = (userAgent, fallback) => {
  const value = String(userAgent || "");
  const match = value.match(/(Edg|Chrome|Firefox|Version)\/([\d.]+)/);
  if (!match) return fallback || "Browser kiosk";
  return `${match[1] === "Edg" ? "Microsoft Edge" : match[1]} ${match[2]}`;
};

function renderDirectory() {
  const query = $("#search").value.trim().toLowerCase();
  const rows = kiosks.filter((kiosk) =>
    [kiosk.location, kiosk.displayName, kiosk.id, kiosk.hostname]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
  $("#deviceCount").textContent = kiosks.length;
  $("#onlineCount").textContent = kiosks.filter(isOnline).length;
  $("#offlineCount").textContent = kiosks.filter(
    (kiosk) => !isOnline(kiosk),
  ).length;
  $("#body").innerHTML =
    rows
      .map(
        (kiosk) =>
          `<tr class="${kiosk.id === selectedId ? "selected" : ""}" data-id="${escapeHtml(kiosk.id)}"><td><strong>${escapeHtml(kiosk.location)}</strong></td><td><span class="kiosk-device-name">${escapeHtml(kiosk.displayName || kiosk.id.slice(0, 12).toUpperCase())}</span><br><small>${escapeHtml(typeName(kiosk.kioskType))}</small></td><td><span class="kiosk-dot ${isOnline(kiosk) ? "online" : ""}"></span>${isOnline(kiosk) ? "Online" : "Offline"}</td></tr>`,
      )
      .join("") || emptyRow(3, "No kiosks have checked in yet.");
}
function renderDetail() {
  const kiosk = kiosks.find((item) => item.id === selectedId);
  if (!kiosk) {
    $("#kioskDetail").innerHTML =
      '<div class="detail-empty"><span class="material-symbols-rounded">desktop_windows</span><h2>Select a kiosk</h2><p>Choose a device to view status and controls.</p></div>';
    return;
  }
  const name = kiosk.displayName || kiosk.id.slice(0, 12).toUpperCase();
  const lastSeen = kiosk.lastSeenAt
    ? `${formatDate(kiosk.lastSeenAt)} ${formatTime(kiosk.lastSeenAt)}`
    : "Never";
  const field = (title, value) =>
    `<dt>${title}</dt><dd>${escapeHtml(value || "Not reported")}</dd>`;
  $("#kioskDetail").innerHTML =
    `<div class="detail-head"><div><span class="section-kicker">${escapeHtml(kiosk.location)}</span><h2>${escapeHtml(name)}</h2></div><span class="status-pill ${isOnline(kiosk) ? "" : "time-out"}">${isOnline(kiosk) ? "Online" : "Offline"}</span></div><dl class="detail-grid">${field("STATUS", isOnline(kiosk) ? kiosk.browserStatus || "Running" : "Offline")}${field("IP ADDRESS", kiosk.ipAddress)}${field("HOSTNAME", kiosk.hostname)}${field("MAC ADDRESS", kiosk.macAddress)}${field("OPERATING SYSTEM", kiosk.operatingSystem)}${field("UPTIME", uptime(kiosk.uptimeSeconds))}${field("BROWSER", browserName(kiosk.userAgent, kiosk.browserStatus))}${field("CURRENT PAGE", kiosk.currentPage)}${field("LAST SEEN", lastSeen)}</dl><div class="detail-controls"><button class="secondary-button device-action" data-action="reloadAttendance">Reload attendance</button><button class="secondary-button device-action" data-action="restartBrowser">Restart browser</button><button class="secondary-button device-action" data-action="screenshot">Request screenshot</button><button class="secondary-button danger device-action" data-action="reboot">Reboot</button><button class="secondary-button danger device-action" data-action="shutdown">Shut down</button><button class="secondary-button device-action" data-action="wake">Wake device</button><button class="secondary-button kiosk-toggle" data-enabled="${Boolean(kiosk.isEnabled)}">${kiosk.isEnabled ? "Disable" : "Enable"}</button></div><div class="detail-foot">Command history <button class="secondary-button kiosk-logs">View logs</button></div>`;
}
function render() {
  renderDirectory();
  renderDetail();
}
async function load() {
  kiosks = await api("/api/kiosks");
  if (!kiosks.some((kiosk) => kiosk.id === selectedId))
    selectedId = kiosks[0]?.id || null;
  render();
}
async function action(name) {
  const kiosk = kiosks.find((item) => item.id === selectedId);
  if (
    !kiosk ||
    !confirm(`Run this action on ${kiosk.displayName || kiosk.location}?`)
  )
    return;
  try {
    toast(
      (
        await api("/api/kiosks/actions", {
          method: "POST",
          body: JSON.stringify({ action: name, kioskIds: [kiosk.id] }),
        })
      ).message,
    );
    await load();
  } catch (error) {
    toast(error.message, "error");
  }
}
$("#search").addEventListener("input", renderDirectory);
$("#refreshBtn").addEventListener("click", () =>
  load().catch((error) => toast(error.message, "error")),
);
document.addEventListener("click", async (event) => {
  const row = event.target.closest("#body tr[data-id]");
  if (row) {
    selectedId = row.dataset.id;
    render();
    return;
  }
  const command = event.target.closest(".device-action")?.dataset.action;
  if (command) return action(command);
  const toggle = event.target.closest(".kiosk-toggle");
  if (toggle) {
    const kiosk = kiosks.find((item) => item.id === selectedId),
      enabled = !["true", "1"].includes(String(toggle.dataset.enabled));
    if (
      !kiosk ||
      !confirm(
        `${enabled ? "Enable" : "Disable"} ${kiosk.displayName || kiosk.location}?`,
      )
    )
      return;
    try {
      await api(`/api/kiosks/${encodeURIComponent(kiosk.id)}/enabled`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: enabled }),
      });
      toast(`Kiosk ${enabled ? "enabled" : "disabled"}.`);
      await load();
    } catch (error) {
      toast(error.message, "error");
    }
    return;
  }
  if (event.target.closest(".kiosk-logs"))
    try {
      const logs = await api(
        `/api/kiosks/${encodeURIComponent(selectedId)}/logs`,
      );
      alert(
        logs.length
          ? logs
              .map(
                (log) =>
                  `${log.createdAt}: ${log.command} — ${log.status}${log.resultText ? ` (${log.resultText})` : ""}`,
              )
              .join("\n")
          : "No kiosk commands logged yet.",
      );
    } catch (error) {
      toast(error.message, "error");
    }
});
(async () => {
  await init("kiosks");
  await load();
  setInterval(() => load().catch(() => {}), 30_000);
})();
