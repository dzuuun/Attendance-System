const input = document.querySelector("#kioskInput"),
  form = document.querySelector("#kioskForm"),
  result = document.querySelector("#kioskResult");
let bridgeConnected = false;
const time = (value) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
const escapeHtml = (value) => {
  const node = document.createElement("div");
  node.textContent = value || "";
  return node.innerHTML;
};
function updateClock() {
  const now = new Date();
  document.querySelector("#clock").textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  document.querySelector("#date").textContent = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function attendeeDetails(data) {
  if (!data) return "";
  return data.type === "Student"
    ? `<div class="identity-grid"><div><span>ATTENDEE</span><b>Student</b></div><div><span>PROGRAM</span><b>${escapeHtml(data.program || "Not specified")}</b></div><div><span>YEAR LEVEL</span><b>${escapeHtml(data.yearLevel || "Not specified")}</b></div></div>`
    : `<div class="identity-grid employee-details"><div><span>ATTENDEE</span><b>Employee</b></div><div><span>DEPARTMENT</span><b>${escapeHtml(data.department || "Not specified")}</b></div></div>`;
}
function show(type, title, detail, previous = "", data = null) {
  result.className = `result ${type}`;
  result.innerHTML = `<span class="result-icon">${type === "error" ? "!" : type === "out" ? "↗" : "✓"}</span><div class="result-content"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small>${attendeeDetails(data)}${previous ? `<small class="previous-log">${escapeHtml(previous)}</small>` : ""}</div>`;
}
async function scan(raw, action) {
  const idNumber = raw.trim().toUpperCase();
  if (!idNumber) return;
  show("", "Processing scan...", "Please keep your card near the reader.");
  try {
    const response = await fetch("/api/kiosk/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idNumber, action }),
      }),
      data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "Unable to record attendance.");
    const out = data.action === "Time Out",
      previous = data.previousAction
        ? `Previous: ${data.previousAction} at ${time(data.previousTimestamp)}`
        : "Previous: No earlier entrance log today";
    show(
      out ? "out" : "success",
      `${data.name} · ${data.action}`,
      `Recorded successfully at ${time(data.timestamp)}.`,
      previous,
      data,
    );
  } catch (error) {
    show("error", "Scan not recorded", error.message);
  } finally {
    input.value = "";
    input.focus();
  }
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  scan(input.value, document.querySelector("#manualAction").value);
});
function renderScannerStatus(status) {
  bridgeConnected = status.connected;
  input.readOnly = bridgeConnected;
  input.placeholder = bridgeConnected
    ? "Physical scanners are active"
    : "Tap card or enter ID...";
  const assignments = status.assignments || {};
  document.querySelector("#timeInDevice").textContent = assignments["Time In"]?.name || "Not assigned";
  document.querySelector("#timeOutDevice").textContent = assignments["Time Out"]?.name || "Not assigned";
  document.querySelector("#readyMessage").textContent = status.pendingAction
    ? `Scan any ID using the scanner to assign as ${status.pendingAction}.`
    : status.connected
      ? "Time In and Time Out are selected automatically by scanner."
      : "Scanner service unavailable; manual entry remains available.";
}
document.querySelectorAll("[data-pair]").forEach((button) =>
  button.addEventListener("click", async () => {
    const response = await fetch("/api/kiosk/scanners/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: button.dataset.pair }),
    });
    const status = await response.json();
    if (!response.ok) return show("error", "Configuration failed", status.message);
    renderScannerStatus(status);
    show("", `Assign ${button.dataset.pair} scanner`, "Scan any registered card with that physical scanner now.");
  }),
);
const scannerEvents = new EventSource("/api/kiosk/scanners/events");
scannerEvents.addEventListener("status", (event) => renderScannerStatus(JSON.parse(event.data)));
scannerEvents.addEventListener("scan", (event) => {
  const data = JSON.parse(event.data);
  scan(data.idNumber, data.action);
});
scannerEvents.addEventListener("assigned", (event) => {
  const data = JSON.parse(event.data);
  show("success", `${data.action} scanner assigned`, "The assignment was saved on this kiosk.");
  fetch("/api/kiosk/scanners").then((response) => response.json()).then(renderScannerStatus);
});
scannerEvents.addEventListener("unassigned", (event) =>
  show("error", "Scanner not assigned", `${JSON.parse(event.data).name} must be assigned below before use.`),
);
let buffer = "",
  timer;
document.addEventListener("keydown", (event) => {
  if (bridgeConnected) return;
  if (document.activeElement === input) return;
  if (event.key === "Enter" && buffer) {
    scan(buffer);
    buffer = "";
    return;
  }
  if (event.key.length === 1) {
    buffer += event.key;
    clearTimeout(timer);
    timer = setTimeout(() => (buffer = ""), 120);
  }
});
updateClock();
setInterval(updateClock, 30000);
input.focus();
