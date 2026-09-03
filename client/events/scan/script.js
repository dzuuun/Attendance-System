const {
  $,
  api,
  escapeHtml,
  formatDate,
  formatTime,
  personCell,
  emptyRow,
  loadXlsx,
  init,
} = TapTrack;
const eventId = Number(location.pathname.match(/\/events\/(\d+)\/scan/)?.[1]);
let eventRecord,
  eventScans = [],
  eventCorrections = [],
  bridgeConnected = false,
  scansLoading = false,
  correctionsLoading = false,
  scansInitialized = false,
  scanFingerprint = "",
  correctionFingerprint = "";
let currentAttendeeTimer = null;
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
function syncActionCopy() {
  const action = selectedAction();
  $("#eventScanLabel").textContent = `ID NUMBER FOR ${action.toUpperCase()}`;
  $("#eventScanInput").placeholder = `Tap card or enter ID for ${action}…`;
  $("#recordScanBtn").textContent = `Record ${action}`;
  $("#recordScanBtn").setAttribute(
    "aria-label",
    `Record selected ID as ${action}`,
  );
  $("#eventCameraScan").setAttribute(
    "aria-label",
    `Use camera to record ${action}`,
  );
}
function renderScans() {
  const table = $("#scanBody").closest("table");
  TapTrack.destroyDataTable(table);
  $("#sessionCount").textContent =
    `${eventScans.length} scan${eventScans.length === 1 ? "" : "s"} across all stations`;
  $("#scanBody").innerHTML =
    eventScans
      .map(
        (record) =>
          `<tr><td>${personCell({ name: record.name, contact: record.program || record.department || record.eventName })}</td><td>${escapeHtml(record.idNumber)}</td><td><span class="type-pill ${record.type}">${escapeHtml(record.type)}</span></td><td><span class="status-pill ${record.action === "Time Out" ? "time-out" : ""}">${record.action}</span></td><td>${formatDate(record.timestamp)} ${formatTime(record.timestamp)}</td><td><button class="secondary-button correct-scan" data-id="${record.id}">Rectify</button></td></tr>`,
      )
      .join("") || emptyRow(6, "No attendance scans recorded for this event.");
  TapTrack.initDataTable(table, { pageLength: 10 });
}
function renderCurrentAttendee(record) {
  const panel = $("#currentAttendee");
  const photo = $("#currentAttendeePhoto");
  if (currentAttendeeTimer) {
    clearTimeout(currentAttendeeTimer);
    currentAttendeeTimer = null;
  }
  if (record) {
    const remaining =
      30000 - (Date.now() - new Date(record.timestamp).getTime());
    if (remaining <= 0) record = null;
    else
      currentAttendeeTimer = setTimeout(() => {
        currentAttendeeTimer = null;
        renderCurrentAttendee(null);
      }, remaining);
  }
  if (!record) {
    photo.src = "/client/images/NDMU-Logo.png";
    photo.alt = "Scanned attendee";
    $("#currentAttendeeKicker").textContent = "CURRENT ATTENDEE";
    $("#currentAttendeeName").textContent = "Ready to scan";
    $("#currentAttendeeId").textContent =
      "The scanned attendee will appear here.";
    $("#currentAttendeeDetails").innerHTML = "";
    panel.className = "current-attendee is-idle";
    return;
  }
  const isStudent = record.type === "Student";
  photo.onerror = () => {
    photo.onerror = null;
    photo.src = "/client/images/NDMU-Logo.png";
  };
  photo.src = record.photoUrl || "/client/images/NDMU-Logo.png";
  photo.alt = `${record.name || "Attendee"} photo`;
  $("#currentAttendeeKicker").textContent =
    `LATEST ${String(record.action || "SCAN").toUpperCase()}`;
  $("#currentAttendeeName").textContent = record.name || "Unknown attendee";
  $("#currentAttendeeId").textContent =
    `${record.type || "Attendee"} · ${record.idNumber || "No ID"}`;
  $("#currentAttendeeDetails").innerHTML = isStudent
    ? `<div><span>PROGRAM</span><strong>${escapeHtml(record.program || "Not specified")}</strong></div><div><span>COLLEGE</span><strong>${escapeHtml(record.college || "Not specified")}</strong></div>`
    : `<div><span>DEPARTMENT / OFFICE</span><strong>${escapeHtml(record.department || "Not specified")}</strong></div>`;
  panel.classList.remove("is-idle", "is-time-in", "is-time-out");
  panel.classList.add(
    record.action === "Time Out" ? "is-time-out" : "is-time-in",
  );
}
async function loadEventScans(force = false) {
  if (scansLoading) return;
  scansLoading = true;
  try {
    const records = await api(`/api/events/${eventId}/scans`);
    const nextFingerprint = records
      .map((record) => `${record.id}:${record.action}:${record.timestamp}`)
      .join("|");
    const contentChanged = nextFingerprint !== scanFingerprint;
    const changed = force || contentChanged;
    if (!changed) return;
    eventScans = records;
    scanFingerprint = nextFingerprint;
    renderScans();
    if (scansInitialized && contentChanged)
      renderCurrentAttendee(eventScans[0]);
    scansInitialized = true;
  } finally {
    scansLoading = false;
  }
}
function renderCorrections() {
  const table = $("#correctionBody").closest("table");
  TapTrack.destroyDataTable(table);
  $("#correctionCount").textContent =
    `${eventCorrections.length} change${eventCorrections.length === 1 ? "" : "s"}`;
  $("#correctionBody").innerHTML =
    eventCorrections
      .map((item) => {
        const original = `${item.originalAction} · ${formatDate(item.originalTimestamp)} ${formatTime(item.originalTimestamp)}`;
        const corrected =
          item.correctionType === "Deleted"
            ? "Record deleted"
            : `${item.correctedAction} · ${formatDate(item.correctedTimestamp)} ${formatTime(item.correctedTimestamp)}`;
        return `<tr><td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.type)} · ${escapeHtml(item.idNumber)}</small></td><td><span class="status-pill ${item.correctionType === "Deleted" ? "time-out" : ""}">${escapeHtml(item.correctionType)}</span></td><td>${escapeHtml(original)}</td><td>${escapeHtml(corrected)}</td><td>${escapeHtml(item.reason)}</td><td><strong>${escapeHtml(item.correctorName)}</strong><br><small>${formatDate(item.correctedAt)} ${formatTime(item.correctedAt)}</small></td></tr>`;
      })
      .join("") || emptyRow(6, "No corrections have been made for this event.");
  TapTrack.initDataTable(table, { pageLength: 10 });
}
async function loadCorrections(force = false) {
  if (correctionsLoading) return;
  correctionsLoading = true;
  try {
    const records = await api(`/api/events/${eventId}/corrections`);
    const nextFingerprint = records
      .map((record) => `${record.id}:${record.correctedAt}`)
      .join("|");
    if (!force && nextFingerprint === correctionFingerprint) return;
    eventCorrections = records;
    correctionFingerprint = nextFingerprint;
    renderCorrections();
  } finally {
    correctionsLoading = false;
  }
}
async function refreshAllStationScans() {
  if (document.hidden) return;
  try {
    await Promise.all([loadEventScans(), loadCorrections()]);
  } catch (_error) {}
}
const localDateTime = (value) => {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
function openCorrection(record) {
  $("#correctionScanId").value = record.id;
  $("#correctionAction").value = record.action;
  $("#correctionTimestamp").value = localDateTime(record.timestamp);
  $("#correctionReason").value = "";
  $("#correctionError").textContent = "";
  $("#correctionPerson").innerHTML =
    `<strong>${escapeHtml(record.name)}</strong><span>${escapeHtml(record.type)} · ${escapeHtml(record.idNumber)}</span>`;
  $("#correctionDialog").showModal();
}
const exportTime = (value) => `${formatDate(value)} ${formatTime(value)}`;
async function exportCurrentEvent() {
  const button = $("#exportEventBtn");
  button.disabled = true;
  try {
    await loadXlsx();
    await Promise.all([loadEventScans(true), loadCorrections(true)]);
    const attendees = new Map();
    eventScans.forEach((scan) => {
      const key = `${scan.type}-${scan.personId}`;
      if (!attendees.has(key))
        attendees.set(key, {
          idNumber: scan.idNumber,
          name: scan.name,
          type: scan.type,
          programCode: scan.programCode || "",
          departmentCode:
            scan.type === "Student"
              ? scan.departmentCode || ""
              : scan.employeeDepartmentCode || "",
          collegeCode: scan.collegeCode || "",
          ins: [],
          outs: [],
        });
      attendees
        .get(key)
        [scan.action === "Time In" ? "ins" : "outs"].push(scan.timestamp);
    });
    const timeHeaders = [];
    for (let index = 1; index <= Number(eventRecord.maxTimeIns); index += 1)
      timeHeaders.push(`Time In ${index}`);
    for (let index = 1; index <= Number(eventRecord.maxTimeOuts); index += 1)
      timeHeaders.push(`Time Out ${index}`);
    const attendanceRows = [...attendees.values()].map((attendee) => {
      const row = {
        _type: attendee.type,
        "ID Number": attendee.idNumber,
        "Full Name": attendee.name,
        "Program Code": attendee.programCode,
        "Department Code": attendee.departmentCode,
        "College Code": attendee.collegeCode,
      };
      attendee.ins.sort((a, b) => new Date(a) - new Date(b));
      attendee.outs.sort((a, b) => new Date(a) - new Date(b));
      attendee.ins.forEach(
        (time, index) => (row[`Time In ${index + 1}`] = exportTime(time)),
      );
      attendee.outs.forEach(
        (time, index) => (row[`Time Out ${index + 1}`] = exportTime(time)),
      );
      return row;
    });
    const studentHeaders = [
      "ID Number",
      "Full Name",
      "Program Code",
      "Department Code",
      "College Code",
      ...timeHeaders,
    ];
    const employeeHeaders = [
      "ID Number",
      "Full Name",
      "Department Code",
      ...timeHeaders,
    ];
    const studentRows = attendanceRows
      .filter((row) => row._type === "Student")
      .map(({ _type, ...row }) => row);
    const employeeRows = attendanceRows
      .filter((row) => row._type === "Employee")
      .map(({ _type, ...row }) => row);
    const correctionHeaders = [
      "ID Number",
      "Full Name",
      "Type",
      "Change",
      "Original Action",
      "Original Time",
      "Corrected Action",
      "Corrected Time",
      "Reason",
      "Corrected By",
      "Corrected At",
    ];
    const correctionRows = eventCorrections.map((record) => ({
      "ID Number": record.idNumber,
      "Full Name": record.name,
      Type: record.type,
      Change: record.correctionType,
      "Original Action": record.originalAction,
      "Original Time": exportTime(record.originalTimestamp),
      "Corrected Action": record.correctedAction || "",
      "Corrected Time": record.correctedTimestamp
        ? exportTime(record.correctedTimestamp)
        : "",
      Reason: record.reason,
      "Corrected By": record.correctorName,
      "Corrected At": exportTime(record.correctedAt),
    }));
    const correctionSheet = XLSX.utils.json_to_sheet(correctionRows, {
      header: correctionHeaders,
    });
    correctionSheet["!cols"] = correctionHeaders.map((header) => ({
      wch: ["Full Name", "Reason"].includes(header) ? 30 : 20,
    }));
    const workbook = XLSX.utils.book_new();
    const appendAttendanceSheet = (rows, headers, name) => {
      const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
      sheet["!cols"] = headers.map((header) => ({
        wch: header === "Full Name" ? 28 : 20,
      }));
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };
    if (studentRows.length && employeeRows.length) {
      appendAttendanceSheet(studentRows, studentHeaders, "Students");
      appendAttendanceSheet(employeeRows, employeeHeaders, "Employees");
    } else if (employeeRows.length) {
      appendAttendanceSheet(employeeRows, employeeHeaders, "Attendance");
    } else {
      appendAttendanceSheet(studentRows, studentHeaders, "Attendance");
    }
    XLSX.utils.book_append_sheet(workbook, correctionSheet, "Corrections");
    const filename =
      eventRecord.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") ||
      `event_${eventRecord.id}`;
    XLSX.writeFile(workbook, `${filename}_attendance.xlsx`);
  } catch (error) {
    TapTrack.toast(error.message, "error");
  } finally {
    button.disabled = false;
  }
}
$("#exportEventBtn").addEventListener("click", exportCurrentEvent);
$("#closeCorrectionDialog").addEventListener("click", () =>
  $("#correctionDialog").close(),
);
$("#cancelCorrection").addEventListener("click", () =>
  $("#correctionDialog").close(),
);
$("#correctionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#correctionError").textContent = "";
  try {
    await api(`/api/events/${eventId}/scans/${$("#correctionScanId").value}`, {
      method: "PUT",
      body: JSON.stringify({
        action: $("#correctionAction").value,
        timestamp: $("#correctionTimestamp").value,
        reason: $("#correctionReason").value,
      }),
    });
    await Promise.all([loadEventScans(true), loadCorrections(true)]);
    $("#correctionDialog").close();
    TapTrack.toast("Attendance scan corrected.", "success");
  } catch (error) {
    $("#correctionError").textContent = error.message;
  }
});
$("#deleteScanBtn").addEventListener("click", async () => {
  const reason = $("#correctionReason").value.trim();
  if (!reason) {
    $("#correctionError").textContent =
      "Provide a reason before deleting this scan.";
    return;
  }
  if (
    !window.confirm(
      "Delete this attendance scan? Its details will remain in Correction history.",
    )
  )
    return;
  try {
    await api(`/api/events/${eventId}/scans/${$("#correctionScanId").value}`, {
      method: "DELETE",
      body: JSON.stringify({ reason }),
    });
    await Promise.all([loadEventScans(true), loadCorrections(true)]);
    $("#correctionDialog").close();
    TapTrack.toast(
      "Attendance scan deleted and retained in the audit trail.",
      "success",
    );
  } catch (error) {
    $("#correctionError").textContent = error.message;
  }
});
document.addEventListener("click", (event) => {
  const button = event.target.closest(".correct-scan");
  if (!button) return;
  const record = eventScans.find(
    (item) => String(item.id) === button.dataset.id,
  );
  if (record) openCorrection(record);
});
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
    await loadEventScans(true);
    renderCurrentAttendee(record);
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
    syncActionCopy();
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
  if (event.target.closest?.("input, textarea, select, dialog")) return;
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
  const audienceCopy = {
    Students: "Accepting students only",
    Employees: "Accepting employees only",
    Both: "Accepting students and employees",
  };
  const audienceLabel =
    audienceCopy[eventRecord.targetAudience] ||
    `Accepting ${eventRecord.targetAudience}`;
  $("#eventAudienceBadge").textContent = audienceLabel;
  $("#eventAudienceBadge").dataset.audience = eventRecord.targetAudience;
  $("#eventDetails").textContent =
    `${new Date(eventRecord.startsAt).toLocaleString()} to ${new Date(eventRecord.endsAt).toLocaleString()}${Number(eventRecord.maxTimeOuts) === 0 ? " · Time In only" : ""}`;
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
    syncActionCopy();
    result("", "Time In only", "This event does not record Time Out.");
  }
  await Promise.all([loadEventScans(true), loadCorrections(true)]);
  $("#exportEventBtn").disabled = false;
  if (!eventRecord.isActive) {
    disableScanning(
      "This event is disabled and is no longer accepting attendance.",
    );
    return;
  }
  $("#eventScanInput").focus();
  window.setInterval(refreshAllStationScans, 3000);
})();
syncActionCopy();
