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
  people = [];
function filtered() {
  const q = $("#search").value.toLowerCase(),
    type = $("#type").value;
  return records.filter(
    (a) =>
      (type === "all" || a.type === type) &&
      (a.name.toLowerCase().includes(q) ||
        a.idNumber.toLowerCase().includes(q)),
  );
}
function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  const rows = filtered();
  $("#body").innerHTML =
    rows
      .map(
        (a) =>
          `<tr><td>${personCell(people.find((p) => p.id === a.personId && p.type === a.type) || { name: a.name })}</td><td>${escapeHtml(a.idNumber)}</td><td><span class="type-pill ${a.type}">${a.type}</span></td><td>${escapeHtml(a.eventName || "University entrance")}</td><td>${formatDate(a.timestamp)}</td><td>${formatTime(a.timestamp)}</td><td><span class="status-pill ${a.action === "Time Out" ? "time-out" : ""}">${a.action}</span></td></tr>`,
      )
      .join("") || emptyRow(7, "No matching attendance records.");
  TapTrack.initDataTable(table, { pageLength: 25 });
}
$("#search").addEventListener("input", render);
$("#type").addEventListener("change", render);
$("#clearBtn").addEventListener("click", async () => {
  if (confirm("Clear all student and employee attendance records?")) {
    await api("/api/attendance", { method: "DELETE" });
    records = [];
    render();
  }
});
$("#exportBtn").addEventListener("click", async () => {
  await loadXlsx();
  const rows = filtered().map((a) => ({
    Name: a.name,
    "ID Number": a.idNumber,
    Type: a.type,
    Context: a.eventName || "University entrance",
    Date: formatDate(a.timestamp),
    Time: formatTime(a.timestamp),
    Action: a.action,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: ["Name", "ID Number", "Type", "Context", "Date", "Time", "Action"],
  });
  sheet["!cols"] = [
    { wch: 28 },
    { wch: 18 },
    { wch: 12 },
    { wch: 28 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Attendance");
  XLSX.writeFile(workbook, "attendance.xlsx");
});
(async () => {
  await init("attendance");
  [records, people] = await Promise.all([
    api("/api/attendance"),
    api("/api/people"),
  ]);
  render();
})();
