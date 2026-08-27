const { $, api, escapeHtml, formatDate, formatTime, emptyRow, loadXlsx, init } =
  TapTrack;
let records = [];
const isInternetSection = location.pathname.includes("/internet-section");
const locationKey = isInternetSection ? "internet" : "library";
const pageKey = isInternetSection ? "internetEntrance" : "libraryEntrance";
const label = () => (isInternetSection ? "Internet Section" : "Library");
function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  $("#tableTitle").textContent = `${label()} entrance`;
  $("#kioskLink").href = `/kiosk/${isInternetSection ? "internet-section" : "library"}`;
  $("#body").innerHTML =
    records
      .map(
        (record) =>
          `<tr><td data-order="${escapeHtml(record.timestamp)}">${formatDate(record.timestamp)} ${formatTime(record.timestamp)}</td><td>${escapeHtml(record.idNumber)}</td><td><strong>${escapeHtml(record.name || "Unknown")}</strong></td><td><span class="type-pill ${escapeHtml(record.type)}">${escapeHtml(record.type)}</span></td><td>${escapeHtml(record.course || "—")}</td><td>${escapeHtml(record.department || "—")}</td></tr>`,
      )
      .join("") || emptyRow(6, `No ${label().toLowerCase()} entrance records.`);
  TapTrack.initDataTable(table, {
    pageLength: 25,
    order: [[0, "desc"]],
    columnDefs: [],
  });
}
async function load() {
  records = await api(`/api/library?location=${locationKey}`);
  render();
}
$("#exportBtn").addEventListener("click", async () => {
  try {
    await loadXlsx();
    const rows = records.map((record) => ({
      Date: formatDate(record.timestamp),
      "Time In": formatTime(record.timestamp),
      "ID Number": record.idNumber,
      "Full Name": record.name,
      Type: record.type,
      Course: record.course || "",
      Department: record.department || "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, {
      header: [
        "Date",
        "Time In",
        "ID Number",
        "Full Name",
        "Type",
        "Course",
        "Department",
      ],
    });
    sheet["!cols"] = [
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 30 },
      { wch: 12 },
      { wch: 28 },
      { wch: 28 },
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Entrance Logs");
    XLSX.writeFile(book, `${label().replaceAll(" ", "_")}_entrance_logs.xlsx`);
    TapTrack.toast(`${label()} entrance log exported.`, "success");
  } catch (error) {
    TapTrack.toast(error.message, "error");
  }
});
(async () => {
  document.title = `${label()} entrance logs — TapTrack`;
  $("#pageTitle").textContent = `${label()} entrance logs`;
  $("#pageDescription").textContent = `Review every entrance recorded at the ${label().toLowerCase()}.`;
  await init(pageKey);
  await load();
})();
