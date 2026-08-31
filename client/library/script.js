const { $, api, escapeHtml, formatDate, formatTime, emptyRow, loadXlsx, init } =
  TapTrack;
let records = [],
  periods = [];
const isInternetSection = location.pathname.includes("/internet-section");
const locationKey = isInternetSection ? "internet" : "library";
const pageKey = isInternetSection ? "internetEntrance" : "libraryEntrance";
const label = () => (isInternetSection ? "Internet Section" : "Library");
function localDateValue(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function exportDate() {
  return localDateValue(new Date());
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
function filtered() {
  const query = $("#search").value.trim().toLowerCase(),
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
  return records.filter((record) => {
    const scanDate = localDateValue(record.timestamp);
    return (
      (type === "all" || record.type === type) &&
      (dateMode === "period" ||
        (dateMode === "month"
          ? !$("#month").value || scanDate.startsWith($("#month").value)
          : !rangeStart || (scanDate >= rangeStart && scanDate <= rangeEnd))) &&
      (!query ||
        record.name?.toLowerCase().includes(query) ||
        record.idNumber?.toLowerCase().includes(query) ||
        record.courseCode?.toLowerCase().includes(query) ||
        record.department?.toLowerCase().includes(query))
    );
  });
}
function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  $("#body").innerHTML =
    filtered()
      .map(
        (record) =>
          `<tr><td>${escapeHtml(record.idNumber)}</td><td><strong>${escapeHtml(record.name || "Unknown")}</strong></td><td><span class="type-pill ${escapeHtml(record.type)}">${escapeHtml(record.type)}</span></td><td>${escapeHtml(record.courseCode || "—")}</td><td>${escapeHtml(record.department || "—")}</td><td data-order="${escapeHtml(record.timestamp)}">${formatDate(record.timestamp)}</td><td data-order="${escapeHtml(record.timestamp)}">${formatTime(record.timestamp)}</td></tr>`,
      )
      .join("") || emptyRow(7, `No ${label().toLowerCase()} entrance records.`);
  TapTrack.initDataTable(table, {
    pageLength: 25,
    order: [
      [5, "desc"],
      [6, "desc"],
    ],
    columnDefs: [],
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
$("#period").addEventListener("change", load);
async function load() {
  records = await api(
    `/api/library?location=${locationKey}&periodId=${encodeURIComponent($("#period").value)}`,
  );
  render();
}
$("#exportBtn").addEventListener("click", async () => {
  try {
    await loadXlsx();
    const rows = filtered().map((record) => ({
      "ID Number": record.idNumber,
      "Full Name": record.name,
      Type: record.type,
      "Course Code": record.courseCode || "",
      Department: record.department || "",
      Date: formatDate(record.timestamp),
      Time: formatTime(record.timestamp),
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, {
      header: [
        "ID Number",
        "Full Name",
        "Type",
        "Course Code",
        "Department",
        "Date",
        "Time",
      ],
    });
    sheet["!cols"] = [
      { wch: 16 },
      { wch: 30 },
      { wch: 12 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Entrance Logs");
    const period = periods.find(
      (item) => String(item.id) === String($("#period").value),
    );
    const periodSuffix = period
      ? `${period.schoolYear} ${period.term}`.replace(/[\\/:*?"<>|]+/g, "-")
      : "Current Period";
    XLSX.writeFile(
      book,
      `${label()} Entrance Logs ${periodSuffix} ${exportScope()} as of ${exportDate()}.xlsx`,
    );
    TapTrack.toast(`${label()} entrance log exported.`, "success");
  } catch (error) {
    TapTrack.toast(error.message, "error");
  }
});
(async () => {
  document.title = `${label()} entrance logs — TapTrack`;
  $("#pageTitle").textContent = `${label()} entrance logs`;
  $("#pageDescription").textContent =
    `Review every entrance recorded at the ${label().toLowerCase()}.`;
  await init(pageKey);
  const today = localDateValue(new Date());
  $("#dateFrom").value = today;
  $("#dateTo").value = today;
  $("#month").value = today.slice(0, 7);
  periods = await api("/api/attendance/periods");
  $("#period").innerHTML = periods
    .map(
      (period) =>
        `<option value="${period.id}">${escapeHtml(period.schoolYear)} · ${escapeHtml(period.term)}${period.isCurrent ? " (Current)" : ""}</option>`,
    )
    .join("");
  const current = periods.find((period) => period.isCurrent) || periods[0];
  if (current) $("#period").value = current.id;
  await load();
})();
