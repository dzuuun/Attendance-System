const { $, api, escapeHtml, formatTime, personCell, emptyRow, init } = TapTrack;
const eventId = Number(location.pathname.match(/\/events\/(\d+)\/scan/)?.[1]);
let eventRecord,
  eventScans = [],
  bridgeConnected = false;
const scanControls = () => [
  $("#eventScanInput"),
  ...document.querySelectorAll("#eventScanForm button"),
  ...document.querySelectorAll('input[name="scanAction"]'),
];
function disableScanning(message) {
  scanControls().forEach((control) => {
    control.disabled = true;
  });
  result("error", "Attendance closed", message);
}
const selectedAction = () =>
  document.querySelector('input[name="scanAction"]:checked').value;
function renderScans() {
  const table = $("#scanBody").closest("table");
  TapTrack.destroyDataTable(table);
  $("#sessionCount").textContent =
    `${eventScans.length} scan${eventScans.length === 1 ? "" : "s"}`;
  $("#scanBody").innerHTML =
    eventScans
      .map(
        (record) =>
          `<tr><td>${personCell({ name: record.name, contact: record.program || record.department || record.eventName })}</td><td>${escapeHtml(record.idNumber)}</td><td><span class="type-pill ${record.type}">${escapeHtml(record.type)}</span></td><td><span class="status-pill ${record.action === "Time Out" ? "time-out" : ""}">${record.action}</span></td><td>${formatTime(record.timestamp)}</td></tr>`,
      )
      .join("") || emptyRow(5, "No attendance scans recorded for this event.");
  TapTrack.initDataTable(table, { pageLength: 10 });
}
async function loadEventScans() {
  eventScans = await api(`/api/events/${eventId}/scans`);
  renderScans();
}
function result(type, title, detail) {
  const node = $("#scanResult");
  node.className = `event-scan-result ${type}`;
  node.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
}
async function scan(value) {
  if (!eventRecord?.isActive) {
    const detail =
      "This event is disabled and is no longer accepting attendance.";
    disableScanning(detail);
    return { success: false, title: "Attendance closed", detail };
  }
  const idNumber = String(value || "")
    .trim()
    .toUpperCase();
  if (!idNumber) return;
  result(
    "",
    "Processing scan…",
    `Recording ${selectedAction()} for ${idNumber}.`,
  );
  try {
    const record = await api(`/api/events/${eventId}/scan`, {
      method: "POST",
      body: JSON.stringify({ idNumber, action: selectedAction() }),
    });
    await loadEventScans();
    result(
      "success",
      `${record.name} · ${record.action}`,
      `Recorded successfully at ${formatTime(record.timestamp)}.`,
    );
    return {
      success: true,
      title: `${record.name} · ${record.action}`,
      detail: `Recorded successfully at ${formatTime(record.timestamp)}.`,
    };
  } catch (error) {
    result("error", "Scan not recorded", error.message);
    return {
      success: false,
      title: "Scan not recorded",
      detail: error.message,
    };
  } finally {
    $("#eventScanInput").value = "";
    $("#eventScanInput").focus();
  }
}
$("#eventScanForm").addEventListener("submit", (event) => {
  event.preventDefault();
  scan($("#eventScanInput").value);
});
$("#eventCameraScan").addEventListener("click", () =>
  TapTrackCameraScanner.open((value) => scan(value)),
);
document.querySelectorAll('input[name="scanAction"]').forEach((input) =>
  input.addEventListener("change", () => {
    result(
      "",
      `${input.value} mode`,
      `All new scans will record ${input.value}.`,
    );
    $("#eventScanInput").focus();
  }),
);
const scannerEvents = new EventSource("/api/kiosk/scanners/events");
scannerEvents.addEventListener("status", (message) => {
  bridgeConnected = JSON.parse(message.data).connected;
});
scannerEvents.addEventListener("scan", (message) => {
  if (eventRecord?.isActive) scan(JSON.parse(message.data).idNumber);
});
let buffer = "",
  timer;
document.addEventListener("keydown", (event) => {
  if (document.activeElement === $("#eventScanInput")) return;
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
(async () => {
  await init("events");
  if (!eventId) return location.replace("/events");
  const events = await api("/api/events");
  eventRecord = events.find((item) => Number(item.id) === eventId);
  if (!eventRecord) {
    disableScanning("Return to Events and select an available event.");
    return;
  }
  $("#eventTitle").textContent = eventRecord.name;
  $("#eventDetails").textContent =
    `${eventRecord.targetAudience} · ${new Date(eventRecord.startsAt).toLocaleString()} to ${new Date(eventRecord.endsAt).toLocaleString()}${Number(eventRecord.maxTimeOuts) === 0 ? " · Time In only" : ""}`;
  if (Number(eventRecord.maxTimeOuts) === 0) {
    document
      .querySelector('input[name="scanAction"][value="Time Out"]')
      ?.closest("label")
      ?.remove();
    document.querySelector(
      'input[name="scanAction"][value="Time In"]',
    ).checked = true;
    document.querySelector(".action-selector").style.gridTemplateColumns =
      "1fr";
    result("", "Time In only", "This event does not record Time Out.");
  }
  await loadEventScans();
  if (!eventRecord.isActive) {
    disableScanning(
      "This event is disabled and is no longer accepting attendance.",
    );
    return;
  }
  $("#eventScanInput").focus();
})();
