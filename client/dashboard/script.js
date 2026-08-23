const { $, api, escapeHtml, formatTime, personCell, emptyRow, init } = TapTrack;
let people = [],
  attendance = [],
  events = [];
const today = (date) =>
  new Date(date).toLocaleDateString("en-CA") ===
  new Date().toLocaleDateString("en-CA");
function row(a) {
  const p = people.find((x) => x.id === a.personId && x.type === a.type) || {
    name: a.name,
  };
  return `<tr><td>${personCell(p)}</td><td>${escapeHtml(a.idNumber)}</td><td><span class="type-pill ${a.type}">${a.type}</span></td><td>${formatTime(a.timestamp)}</td><td><span class="status-pill ${a.action === "Time Out" ? "time-out" : ""}">${a.action}</span></td></tr>`;
}
function render() {
  const eventId = Number($("#attendanceMode").value) || null,
    records = attendance.filter((a) =>
      eventId
        ? Number(a.eventId) === eventId
        : !a.eventId && today(a.timestamp),
    ),
    latest = new Map();
  records.forEach((a) => {
    const key = `${a.type}-${a.personId}`;
    if (!latest.has(key)) latest.set(key, a);
  });
  const inside = new Set(
      [...latest].filter(([, a]) => a.action === "Time In").map(([key]) => key),
    ),
    students = people.filter((p) => p.type === "Student"),
    employees = people.filter((p) => p.type === "Employee");
  $("#presentCount").textContent = inside.size;
  $("#studentCount").textContent = students.length;
  $("#employeeCount").textContent = employees.length;
  $("#studentsToday").textContent = students.filter((p) =>
    inside.has(`Student-${p.id}`),
  ).length;
  $("#employeesToday").textContent = employees.filter((p) =>
    inside.has(`Employee-${p.id}`),
  ).length;
  $("#attendanceRate").textContent = people.length
    ? `${Math.round((inside.size / people.length) * 100)}%`
    : "0%";
  $("#recentBody").innerHTML =
    records.slice(0, 5).map(row).join("") ||
    emptyRow(5, "No attendance records in this mode.");
}
async function scan(value) {
  const idNumber = value.trim().toUpperCase();
  if (!idNumber) return;
  const message = $("#scanMessage");
  try {
    const record = await api("/api/attendance/scan", {
      method: "POST",
      body: JSON.stringify({
        idNumber,
        eventId: Number($("#attendanceMode").value) || null,
      }),
    });
    attendance.unshift(record);
    render();
    message.className = "scan-message success";
    message.textContent = `${record.name} · ${record.action} at ${formatTime(record.timestamp)}`;
  } catch (error) {
    message.className = "scan-message error";
    message.textContent = error.message;
  }
}
$("#scanForm").addEventListener("submit", (event) => {
  event.preventDefault();
  scan($("#scanInput").value);
  $("#scanInput").value = "";
  $("#scanInput").focus();
});
$("#attendanceMode").addEventListener("change", render);
$("#exportBtn").addEventListener(
  "click",
  () => (location.href = "/attendance"),
);
(async () => {
  await init("dashboard");
  [people, attendance, events] = await Promise.all([
    api("/api/people"),
    api("/api/attendance"),
    api("/api/events"),
  ]);
  $("#attendanceMode").innerHTML += [...events]
    .filter((e) => e.isActive)
    .map(
      (e) =>
        `<option value="${e.id}">${escapeHtml(e.name)} · ${escapeHtml(e.targetAudience || "Both")}</option>`,
    )
    .join("");
  render();
})();
