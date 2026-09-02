const {
  $,
  api,
  escapeHtml,
  formatTime,
  formatDate,
  personCell,
  emptyRow,
  loadXlsx,
  init,
} = TapTrack;
let records = [],
  people = [],
  periods = [];
function localDateValue(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function searchableDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return [
    localDateValue(timestamp),
    formatDate(timestamp),
    formatTime(timestamp),
    date.toLocaleDateString(),
    date.toLocaleString(),
  ]
    .join(" ")
    .toLowerCase();
}
function filtered() {
  const q = $("#search").value.toLowerCase(),
    type = $("#type").value,
    dateMode = $("#dateMode").value,
    selectedFrom = $("#dateFrom").value,
    selectedTo = dateMode === "range" ? $("#dateTo").value : selectedFrom,
    rangeStart =
      selectedFrom && selectedTo
        ? selectedFrom <= selectedTo
          ? selectedFrom
          : selectedTo
        : selectedFrom || selectedTo,
    rangeEnd =
      selectedFrom && selectedTo
        ? selectedFrom <= selectedTo
          ? selectedTo
          : selectedFrom
        : selectedFrom || selectedTo;
  return records.filter((a) => {
    const scanDate = localDateValue(a.timestamp);
    return (
      (type === "all" || a.type === type) &&
      (dateMode === "period" ||
        (dateMode === "month"
          ? !$("#month").value || scanDate.startsWith($("#month").value)
          : !rangeStart || (scanDate >= rangeStart && scanDate <= rangeEnd))) &&
      (!q ||
        a.name?.toLowerCase().includes(q) ||
        a.idNumber?.toLowerCase().includes(q) ||
        a.location?.toLowerCase().includes(q) ||
        searchableDate(a.timestamp).includes(q))
    );
  });
}
function exportDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function exportScope() {
  const mode = $("#dateMode").value;
  if (mode === "day") return `One Day ${$("#dateFrom").value || "unspecified"}`;
  if (mode === "month") return `Month ${$("#month").value || "unspecified"}`;
  if (mode === "range") {
    const first = $("#dateFrom").value || "unspecified";
    const second = $("#dateTo").value || "unspecified";
    const from = first <= second ? first : second;
    const to = first <= second ? second : first;
    return `Date Range ${from} to ${to}`;
  }
  return "Entire Academic Period";
}
function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  const rows = filtered();
  $("#body").innerHTML =
    rows
      .map(
        (a) =>
          `<tr><td>${personCell(people.find((p) => p.id === a.personId && p.type === a.type) || { name: a.name })}</td><td>${escapeHtml(a.idNumber)}</td><td><span class="type-pill ${a.type}">${a.type}</span></td><td>${escapeHtml(a.location || "—")}</td><td data-order="${escapeHtml(a.timestamp)}">${formatDate(a.timestamp)}</td><td data-order="${escapeHtml(a.timestamp)}">${formatTime(a.timestamp)}</td><td><span class="status-pill ${a.action === "Time Out" ? "time-out" : ""}">${a.action}</span></td></tr>`,
      )
      .join("") || emptyRow(7, "No matching university entrance records.");
  TapTrack.initDataTable(table, {
    pageLength: 25,
    order: [
      [4, "desc"],
      [5, "desc"],
    ],
  });
}
$("#search").addEventListener("input", render);
$("#type").addEventListener("change", render);
$("#dateMode").addEventListener("change", () => {
  const mode = $("#dateMode").value,
    isRange = mode === "range",
    isMonth = mode === "month",
    isPeriod = mode === "period";
  $("#dateFromField").hidden = isMonth || isPeriod;
  $("#dateToField").hidden = !isRange;
  $("#monthField").hidden = !isMonth;
  $("#dateFromLabel").textContent = isRange ? "From" : "Date";
  if (isRange && !$("#dateTo").value) $("#dateTo").value = $("#dateFrom").value;
  render();
});
$("#dateFrom").addEventListener("change", render);
$("#dateTo").addEventListener("change", render);
$("#month").addEventListener("change", render);
$("#period").addEventListener("change", async () => {
  records = await api(
    `/api/attendance?periodId=${encodeURIComponent($("#period").value)}`,
  );
  render();
});
$("#exportBtn").addEventListener("click", async () => {
  await loadXlsx();
  const rows = filtered().map((a) => ({
    Name: a.name,
    "ID Number": a.idNumber,
    Type: a.type,
    Location: a.location || "",
    Date: formatDate(a.timestamp),
    Time: formatTime(a.timestamp),
    Action: a.action,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: ["Name", "ID Number", "Type", "Location", "Date", "Time", "Action"],
  });
  sheet["!cols"] = [
    { wch: 28 },
    { wch: 18 },
    { wch: 12 },
    { wch: 22 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Attendance");
  const period = periods.find(
    (item) => String(item.id) === String($("#period").value),
  );
  const suffix = period
    ? `${period.schoolYear} ${period.term}`.replace(/[\\/:*?"<>|]+/g, "-")
    : "Current Period";
  XLSX.writeFile(
    workbook,
    `University Entrance Logs ${suffix} ${exportScope()} as of ${exportDate()}.xlsx`,
  );
});
(async () => {
  await init("attendance");
  const today = localDateValue(new Date());
  $("#dateFrom").value = today;
  $("#dateTo").value = today;
  $("#month").value = today.slice(0, 7);
  [periods, people] = await Promise.all([
    api("/api/attendance/periods"),
    api("/api/people"),
  ]);
  $("#period").innerHTML = periods
    .map(
      (period) =>
        `<option value="${period.id}">${escapeHtml(period.schoolYear)} · ${escapeHtml(period.term)}${period.isCurrent ? " (Current)" : ""}</option>`,
    )
    .join("");
  const current = periods.find((period) => period.isCurrent) || periods[0];
  if (current) {
    $("#period").value = current.id;
    records = await api(`/api/attendance?periodId=${current.id}`);
  }
  render();
})();
