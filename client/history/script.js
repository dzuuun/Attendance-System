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
let periods = [],
  events = [],
  selectedEvent = null,
  scans = [],
  corrections = [],
  currentUser = null;
function renderEvents() {
  const table = $("#eventBody").closest("table");
  TapTrack.destroyDataTable(table);
  $("#eventBody").innerHTML =
    events
      .map(
        (event) =>
          `<tr><td><strong>${escapeHtml(event.name)}</strong><br><small>${escapeHtml(event.description || "Special event")}</small>${["Superadmin", "Administrator"].includes(currentUser?.role) ? `<br><small>Created by ${escapeHtml(event.creatorName || "Unknown user")}</small>` : ""}</td><td>${escapeHtml(event.targetAudience)}</td><td>${formatDate(event.startsAt)} ${formatTime(event.startsAt)}<br>to ${formatDate(event.endsAt)} ${formatTime(event.endsAt)}</td><td>${event.maxTimeIns} in · ${event.maxTimeOuts} out</td><td><span class="status-pill ${event.isActive ? "" : "time-out"}">${event.isActive ? "Active" : "Disabled"}</span></td><td><div class="event-actions"><button class="secondary-button view" data-id="${event.id}">View</button><button class="secondary-button export-event" data-id="${event.id}">Export</button></div></td></tr>`,
      )
      .join("") || emptyRow(6, "No past events in this academic period.");
  TapTrack.initDataTable(table);
}
function renderScans() {
  const table = $("#scanBody").closest("table");
  TapTrack.destroyDataTable(table);
  $("#scanBody").innerHTML =
    scans
      .map(
        (record) =>
          `<tr><td>${personCell({ name: record.name, contact: record.course || record.department || record.type })}</td><td>${escapeHtml(record.idNumber)}</td><td>${escapeHtml(record.type)}</td><td>${escapeHtml(record.action)}</td><td>${formatDate(record.timestamp)} ${formatTime(record.timestamp)}</td></tr>`,
      )
      .join("") || emptyRow(5, "No attendance recorded for this event.");
  TapTrack.initDataTable(table, { pageLength: 25 });
}
function renderCorrections() {
  const table = $("#correctionBody").closest("table");
  TapTrack.destroyDataTable(table);
  $("#correctionCount").textContent =
    `${corrections.length} change${corrections.length === 1 ? "" : "s"}`;
  $("#correctionBody").innerHTML =
    corrections
      .map((item) => {
        const original = `${item.originalAction} · ${formatDate(item.originalTimestamp)} ${formatTime(item.originalTimestamp)}`;
        const corrected =
          item.correctionType === "Deleted"
            ? "Record deleted"
            : `${item.correctedAction} · ${formatDate(item.correctedTimestamp)} ${formatTime(item.correctedTimestamp)}`;
        return `<tr><td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.type)} · ${escapeHtml(item.idNumber)}</small></td><td><span class="status-pill ${item.correctionType === "Deleted" ? "time-out" : ""}">${escapeHtml(item.correctionType)}</span></td><td>${escapeHtml(original)}</td><td>${escapeHtml(corrected)}</td><td>${escapeHtml(item.reason)}</td><td><strong>${escapeHtml(item.correctorName)}</strong><br><small>${formatDate(item.correctedAt)} ${formatTime(item.correctedAt)}</small></td></tr>`;
      })
      .join("") || emptyRow(6, "No corrections were made for this event.");
  TapTrack.initDataTable(table, { pageLength: 10 });
}
async function loadEvents() {
  const id = $("#period").value,
    period = periods.find((p) => String(p.id) === id);
  $("#periodTitle").textContent = period
    ? `${period.schoolYear} · ${period.term}`
    : "Events";
  events = await api(`/api/history/events?periodId=${encodeURIComponent(id)}`);
  selectedEvent = null;
  $("#attendanceCard").hidden = true;
  renderEvents();
}
async function viewEvent(id) {
  selectedEvent = events.find((event) => String(event.id) === String(id));
  [scans, corrections] = await Promise.all([
    api(`/api/history/events/${id}/scans`),
    api(`/api/history/events/${id}/corrections`),
  ]);
  $("#attendanceTitle").textContent = selectedEvent.name;
  $("#attendanceCard").hidden = false;
  renderScans();
  renderCorrections();
  $("#attendanceCard").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function exportEvent(
  eventRecord,
  eventScans = null,
  eventCorrections = null,
) {
  await loadXlsx();
  const [records, auditRecords] = await Promise.all([
      eventScans || api(`/api/history/events/${eventRecord.id}/scans`),
      eventCorrections ||
        api(`/api/history/events/${eventRecord.id}/corrections`),
    ]),
    grouped = new Map();
  records.forEach((scan) => {
    const key = `${scan.type}-${scan.personId}`;
    if (!grouped.has(key))
      grouped.set(key, {
        id: scan.idNumber,
        name: scan.name,
        type: scan.type,
        course: scan.course || "",
        department: scan.department || "",
        ins: [],
        outs: [],
      });
    grouped
      .get(key)
      [scan.action === "Time In" ? "ins" : "outs"].push(scan.timestamp);
  });
  const headers = [
    "ID Number",
    "Full Name",
    "Type",
    "Course",
    "Department",
    ...Array.from(
      { length: Number(eventRecord.maxTimeIns) },
      (_, i) => `Time In ${i + 1}`,
    ),
    ...Array.from(
      { length: Number(eventRecord.maxTimeOuts) },
      (_, i) => `Time Out ${i + 1}`,
    ),
  ];
  const rows = [...grouped.values()].map((person) => {
    const row = {
      "ID Number": person.id,
      "Full Name": person.name,
      Type: person.type,
      Course: person.course,
      Department: person.department,
    };
    person.ins.sort((a, b) => new Date(a) - new Date(b));
    person.outs.sort((a, b) => new Date(a) - new Date(b));
    person.ins.forEach(
      (time, i) =>
        (row[`Time In ${i + 1}`] = `${formatDate(time)} ${formatTime(time)}`),
    );
    person.outs.forEach(
      (time, i) =>
        (row[`Time Out ${i + 1}`] = `${formatDate(time)} ${formatTime(time)}`),
    );
    return row;
  });
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers }),
    book = XLSX.utils.book_new();
  sheet["!cols"] = headers.map((header) => ({
    wch: header === "Full Name" ? 28 : 20,
  }));
  XLSX.utils.book_append_sheet(book, sheet, "Attendance");
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
  const correctionRows = auditRecords.map((record) => ({
    "ID Number": record.idNumber,
    "Full Name": record.name,
    Type: record.type,
    Change: record.correctionType,
    "Original Action": record.originalAction,
    "Original Time": `${formatDate(record.originalTimestamp)} ${formatTime(record.originalTimestamp)}`,
    "Corrected Action": record.correctedAction || "",
    "Corrected Time": record.correctedTimestamp
      ? `${formatDate(record.correctedTimestamp)} ${formatTime(record.correctedTimestamp)}`
      : "",
    Reason: record.reason,
    "Corrected By": record.correctorName,
    "Corrected At": `${formatDate(record.correctedAt)} ${formatTime(record.correctedAt)}`,
  }));
  const correctionSheet = XLSX.utils.json_to_sheet(correctionRows, {
    header: correctionHeaders,
  });
  correctionSheet["!cols"] = correctionHeaders.map((header) => ({
    wch: ["Full Name", "Reason"].includes(header) ? 30 : 20,
  }));
  XLSX.utils.book_append_sheet(book, correctionSheet, "Corrections");
  XLSX.writeFile(
    book,
    `${eventRecord.name.replace(/[^a-z0-9]+/gi, "_")}_attendance.xlsx`,
  );
}
document.addEventListener("click", async (event) => {
  if (event.target.classList.contains("view"))
    await viewEvent(event.target.dataset.id);
  if (event.target.classList.contains("export-event")) {
    const record = events.find(
      (item) => String(item.id) === event.target.dataset.id,
    );
    event.target.disabled = true;
    try {
      await exportEvent(record);
    } catch (error) {
      alert(error.message);
    } finally {
      event.target.disabled = false;
    }
  }
});
$("#period").onchange = loadEvents;
$("#exportBtn").textContent = "Export";
$("#exportBtn").onclick = async () => {
  if (selectedEvent) await exportEvent(selectedEvent, scans, corrections);
};
(async () => {
  ({ user: currentUser } = await init("history"));
  periods = await api("/api/history/periods");
  $("#period").innerHTML =
    '<option value="" disabled selected>Select academic period</option>' +
    periods
      .map(
        (p) =>
          `<option value="${p.id}">${escapeHtml(p.schoolYear)} · ${escapeHtml(p.term)}${p.isCurrent ? " (Current)" : ""}</option>`,
      )
      .join("");
  $("#periodTitle").textContent = "Select an academic period";
  renderEvents();
})();
