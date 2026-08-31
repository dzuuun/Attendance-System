const { $, api, escapeHtml, formatTime, personCell, emptyRow, init } = TapTrack;
let people = [],
  attendance = [];
function row(record) {
  const person = people.find(
    (item) => item.id === record.personId && item.type === record.type,
  ) || { name: record.name };
  return `<tr><td>${personCell(person)}</td><td>${escapeHtml(record.idNumber)}</td><td><span class="type-pill ${record.type}">${record.type}</span></td><td>${escapeHtml(record.location || "—")}</td><td data-order="${escapeHtml(record.timestamp)}">${formatTime(record.timestamp)}</td><td><span class="status-pill ${record.action === "Time Out" ? "time-out" : ""}">${record.action}</span></td></tr>`;
}
function render() {
  const recentTable = $("#recentBody").closest("table");
  TapTrack.destroyDataTable(recentTable);
  const records = attendance,
    latest = new Map();
  records.forEach((record) => {
    const key = `${record.type}-${record.personId}`;
    if (!latest.has(key)) latest.set(key, record);
  });
  const inside = new Set(
      [...latest]
        .filter(([, record]) => record.action === "Time In")
        .map(([key]) => key),
    ),
    students = people.filter((person) => person.type === "Student"),
    employees = people.filter((person) => person.type === "Employee");
  $("#presentCount").textContent = inside.size;
  $("#studentCount").textContent = students.length;
  $("#employeeCount").textContent = employees.length;
  $("#studentsToday").textContent = students.filter((person) =>
    inside.has(`Student-${person.id}`),
  ).length;
  $("#employeesToday").textContent = employees.filter((person) =>
    inside.has(`Employee-${person.id}`),
  ).length;
  $("#attendanceRate").textContent = people.length
    ? `${Math.round((inside.size / people.length) * 100)}%`
    : "0%";
  $("#recentBody").innerHTML =
    records.map(row).join("") ||
    emptyRow(6, "No entrance attendance records today.");
  TapTrack.initDataTable(recentTable, {
    paging: true,
    pageLength: 10,
    searching: false,
    info: false,
    lengthChange: true,
    order: [[4, "desc"]],
  });
}
(async () => {
  await init("dashboard");
  [people, attendance] = await Promise.all([
    api("/api/people"),
    api("/api/attendance/today"),
  ]);
  render();
})();
