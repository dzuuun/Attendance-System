const { $, api, escapeHtml, formatTime, personCell, emptyRow, init } = TapTrack;
let people = [],
  attendance = [];
const today = (date) =>
  new Date(date).toLocaleDateString("en-CA") ===
  new Date().toLocaleDateString("en-CA");
function row(record) {
  const person = people.find(
    (item) => item.id === record.personId && item.type === record.type,
  ) || { name: record.name };
  return `<tr><td>${personCell(person)}</td><td>${escapeHtml(record.idNumber)}</td><td><span class="type-pill ${record.type}">${record.type}</span></td><td>${formatTime(record.timestamp)}</td><td><span class="status-pill ${record.action === "Time Out" ? "time-out" : ""}">${record.action}</span></td></tr>`;
}
function render() {
  const recentTable = $("#recentBody").closest("table");
  TapTrack.destroyDataTable(recentTable);
  const records = attendance.filter(
      (record) => !record.eventId && today(record.timestamp),
    ),
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
    records.slice(0, 5).map(row).join("") ||
    emptyRow(5, "No entrance attendance records today.");
  TapTrack.initDataTable(recentTable, {
    paging: false,
    searching: false,
    info: false,
    lengthChange: false,
  });
}
$("#exportBtn").addEventListener(
  "click",
  () => (location.href = "/attendance"),
);
(async () => {
  await init("dashboard");
  [people, attendance] = await Promise.all([
    api("/api/people"),
    api("/api/attendance"),
  ]);
  render();
})();
