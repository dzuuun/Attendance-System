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
          `<tr><td>${personCell(people.find((p) => p.id === a.personId && p.type === a.type) || { name: a.name })}</td><td>${escapeHtml(a.idNumber)}</td><td><span class="type-pill ${a.type}">${a.type}</span></td><td>${escapeHtml(a.location || "—")}</td><td>${formatDate(a.timestamp)}</td><td>${formatTime(a.timestamp)}</td><td><span class="status-pill ${a.action === "Time Out" ? "time-out" : ""}">${a.action}</span></td></tr>`,
      )
      .join("") || emptyRow(7, "No matching university entrance records.");
  TapTrack.initDataTable(table, { pageLength: 25 });
}
$("#search").addEventListener("input", render);
$("#type").addEventListener("change", render);
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
    ? `${period.schoolYear}_${period.term}`.replace(/[^a-z0-9]+/gi, "_")
    : "current_period";
  XLSX.writeFile(workbook, `university_entrance_${suffix}.xlsx`);
});
(async () => {
  await init("attendance");
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
