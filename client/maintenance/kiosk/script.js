const { $, api, escapeHtml, emptyRow, formatDate, formatTime, init, toast } =
  TapTrack;
let kiosks = [],
  selectedId = null,
  loading = false,
  lastLoadedAt = null;
const typeName = (type) =>
  ({
    entrance: "University entrance",
    library: "Library",
    internet: "Internet Section",
  })[type] || type;
const isOnline = (kiosk) => Boolean(kiosk.isOnline);
const relativeTime = (value) => {
  if (!value) return "Never seen";
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value)) / 1000),
  );
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
const stateFor = (kiosk) =>
  !kiosk.isEnabled
    ? { label: "Disabled", className: "disabled" }
    : isOnline(kiosk)
      ? { label: "Online", className: "online" }
      : { label: "Offline", className: "offline" };
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
      .map((kiosk) => {
        const state = stateFor(kiosk);
        return `<tr class="${kiosk.id === selectedId ? "selected" : ""}" data-id="${escapeHtml(kiosk.id)}" tabindex="0" aria-selected="${String(kiosk.id === selectedId)}"><td><strong>${escapeHtml(kiosk.location)}</strong><small class="kiosk-row-type">${escapeHtml(typeName(kiosk.kioskType))}</small></td><td><span class="kiosk-device-name">${escapeHtml(kiosk.displayName || kiosk.id.slice(0, 12).toUpperCase())}</span><small class="kiosk-row-seen">${escapeHtml(relativeTime(kiosk.lastSeenAt))}</small></td><td><span class="kiosk-status ${state.className}"><span class="kiosk-dot ${state.className}"></span>${state.label}</span></td></tr>`;
      })
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
  const state = stateFor(kiosk);
  const lastSeen = kiosk.lastSeenAt
    ? `${formatDate(kiosk.lastSeenAt)} ${formatTime(kiosk.lastSeenAt)}`
    : "Never";
  const field = (title, value) =>
    `<dt>${title}</dt><dd>${escapeHtml(value || "Not reported")}</dd>`;
  const command = (action, icon, label, enabled, hint) =>
    `<button class="secondary-button device-action" data-action="${action}" ${enabled ? "" : "disabled"} title="${escapeHtml(enabled ? label : hint)}"><span class="material-symbols-rounded" aria-hidden="true">${icon}</span><span>${label}</span></button>`;
  const browserOnline = isOnline(kiosk) && kiosk.isEnabled;
  const agentOnline = Boolean(kiosk.agentOnline) && kiosk.isEnabled;
  const hasMac = /^[A-F0-9]{12}$/i.test(
    String(kiosk.macAddress || "").replace(/[^A-F0-9]/gi, ""),
  );
  $("#kioskDetail").innerHTML =
    `<div class="detail-head"><div><span class="section-kicker">${escapeHtml(typeName(kiosk.kioskType))}</span><h2>${escapeHtml(kiosk.location)}</h2><p class="detail-device-id">${escapeHtml(name)}</p></div><span class="status-pill ${state.className}">${state.label}</span></div><div class="detail-body"><section class="detail-section"><h3>Live status</h3><dl class="detail-grid">${field("CONNECTION", state.label)}${field("LAST ACTIVITY", `${relativeTime(kiosk.lastSeenAt)} · ${lastSeen}`)}${field("CURRENT PAGE", kiosk.currentPage)}${field("BROWSER", browserName(kiosk.userAgent, kiosk.browserStatus))}${field("UPTIME", uptime(kiosk.uptimeSeconds))}</dl></section><section class="detail-section"><h3>Device information</h3><dl class="detail-grid">${field("IP ADDRESS", kiosk.ipAddress)}${field("HOSTNAME", kiosk.hostname)}${field("MAC ADDRESS", kiosk.macAddress)}${field("OPERATING SYSTEM", kiosk.operatingSystem)}${field("CONTROL AGENT", agentOnline ? "Online" : "Not connected")}</dl></section><section class="detail-section command-section"><div class="section-heading"><h3>Remote controls</h3><small>Unavailable actions are disabled automatically.</small></div><div class="detail-controls">${command("reloadAttendance", "refresh", "Reload page", browserOnline, "The kiosk browser is offline.")}${command("restartBrowser", "restart_alt", "Restart browser", agentOnline, "The kiosk control agent is offline.")}${command("screenshot", "screenshot_monitor", "Screenshot", agentOnline, "The kiosk control agent is offline.")}${command("reboot", "restart_alt", "Reboot device", agentOnline, "The kiosk control agent is offline.")}${command("shutdown", "power_settings_new", "Shut down", agentOnline, "The kiosk control agent is offline.")}${command("wake", "power", "Wake device", !browserOnline && hasMac, browserOnline ? "The kiosk is already online." : "No MAC address is registered.")}</div></section></div><div class="detail-foot"><button class="secondary-button kiosk-logs"><span class="material-symbols-rounded" aria-hidden="true">history</span>Command history</button><button class="secondary-button kiosk-toggle ${kiosk.isEnabled ? "danger" : ""}" data-enabled="${Boolean(kiosk.isEnabled)}">${kiosk.isEnabled ? "Disable kiosk" : "Enable kiosk"}</button></div>`;
}
function render() {
  renderDirectory();
  renderDetail();
}
async function load() {
  if (loading) return;
  loading = true;
  const button = $("#refreshBtn");
  button.disabled = true;
  button.classList.add("loading");
  $("#refreshStatus").textContent = "Updating live statusâ€¦";
  try {
    kiosks = await api("/api/kiosks");
    if (!kiosks.some((kiosk) => kiosk.id === selectedId))
      selectedId = kiosks[0]?.id || null;
    lastLoadedAt = new Date();
    render();
    $("#refreshStatus").textContent = `Updated ${formatTime(lastLoadedAt)}`;
  } finally {
    loading = false;
    button.disabled = false;
    button.classList.remove("loading");
  }
}
async function action(name) {
  const kiosk = kiosks.find((item) => item.id === selectedId);
  if (
    !kiosk ||
    !confirm(`Run this action on ${kiosk.displayName || kiosk.location}?`)
  )
    return;
  const pressed = document.querySelector(
    `.device-action[data-action="${name}"]`,
  );
  try {
    if (pressed) pressed.disabled = true;
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
  } finally {
    if (pressed?.isConnected) pressed.disabled = false;
  }
}
$("#search").addEventListener("input", renderDirectory);
$("#refreshBtn").addEventListener("click", () =>
  load().catch((error) => toast(error.message, "error")),
);
function selectRow(row) {
  if (!row) return;
  selectedId = row.dataset.id;
  render();
}
$("#body").addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  event.preventDefault();
  selectRow(row);
});
const logsDialog = $("#kioskLogsDialog");
const closeLogs = () => logsDialog.close();
$("#closeKioskLogs").addEventListener("click", closeLogs);
$("#doneKioskLogs").addEventListener("click", closeLogs);
document.addEventListener("click", async (event) => {
  const row = event.target.closest("#body tr[data-id]");
  if (row) {
    selectRow(row);
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
      const kiosk = kiosks.find((item) => item.id === selectedId);
      const logs = await api(
        `/api/kiosks/${encodeURIComponent(selectedId)}/logs`,
      );
      $("#kioskLogsTitle").textContent =
        kiosk?.displayName || kiosk?.location || "Kiosk activity";
      $("#kioskLogsSummary").textContent = logs.length
        ? `${logs.length} recent command${logs.length === 1 ? "" : "s"}`
        : "No command activity yet";
      $("#kioskLogList").innerHTML = logs.length
        ? logs
            .map(
              (log) =>
                `<article class="kiosk-log-item"><span class="command-status ${escapeHtml(String(log.status || "").toLowerCase())}">${escapeHtml(log.status)}</span><div><strong>${escapeHtml(String(log.command || "").replaceAll("-", " "))}</strong><small>${escapeHtml(formatDate(log.createdAt))} at ${escapeHtml(formatTime(log.createdAt))} · ${escapeHtml(log.channel)}</small>${log.resultText ? `<p>${escapeHtml(log.resultText)}</p>` : ""}</div></article>`,
            )
            .join("")
        : '<div class="kiosk-log-empty"><span class="material-symbols-rounded">history</span><p>No commands have been sent to this kiosk.</p></div>';
      logsDialog.showModal();
    } catch (error) {
      toast(error.message, "error");
    }
});
(async () => {
  await init("kiosks");
  await load();
  setInterval(() => {
    if (!document.hidden) load().catch(() => {});
  }, 15_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) load().catch(() => {});
  });
})();
