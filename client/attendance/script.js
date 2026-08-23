const {
  $,
  api,
  escapeHtml,
  formatTime,
  formatDate,
  personCell,
  emptyRow,
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
  const rows = filtered();
  $("#body").innerHTML =
    rows
      .map(
        (a) =>
          `<tr><td>${personCell(people.find((p) => p.id === a.personId && p.type === a.type) || { name: a.name })}</td><td>${escapeHtml(a.idNumber)}</td><td><span class="type-pill ${a.type}">${a.type}</span></td><td>${escapeHtml(a.eventName || "University entrance")}</td><td>${formatDate(a.timestamp)}</td><td>${formatTime(a.timestamp)}</td><td><span class="status-pill ${a.action === "Time Out" ? "time-out" : ""}">${a.action}</span></td></tr>`,
      )
      .join("") || emptyRow(7, "No matching attendance records.");
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
$("#exportBtn").addEventListener("click", () => {
  const csv =
    "Name,ID,Type,Context,Date,Time,Action\n" +
    filtered()
      .map((a) =>
        [
          a.name,
          a.idNumber,
          a.type,
          a.eventName || "University entrance",
          formatDate(a.timestamp),
          formatTime(a.timestamp),
          a.action,
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    link = document.createElement("a");
  link.href = url;
  link.download = "attendance.csv";
  link.click();
  URL.revokeObjectURL(url);
});
(async () => {
  await init("attendance");
  [records, people] = await Promise.all([
    api("/api/attendance"),
    api("/api/people"),
  ]);
  render();
})();
