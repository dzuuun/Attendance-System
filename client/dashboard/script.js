let people = [],
  attendance = [],
  users = [],
  currentUser = null;
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (response.status === 401) {
    location.href = "/login";
    throw new Error("Please sign in.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})),
      error = new Error(body.message || "Request failed.");
    error.data = body;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
const escapeHtml = (value = "") => {
  const d = document.createElement("div");
  d.textContent = value;
  return d.innerHTML;
};
const initials = (name) =>
  name
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const todayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const formatDate = (iso) =>
  new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const emptyRow = (n, text) =>
  `<tr><td class="empty-row" colspan="${n}">${text}</td></tr>`;
const personCell = (p) =>
  `<div class="person-cell"><span class="avatar">${initials(p.name)}</span><div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.contact || p.groupName || "Registered user")}</small></div></div>`;
function message(text, type) {
  const el = $("#scanMessage");
  el.className = `scan-message ${type}`;
  el.textContent = text;
}
function clock() {
  const now = new Date(),
    hour = now.getHours();
  $("#liveTime").textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  $("#liveDate").textContent = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if ($("#dashboardView").classList.contains("active"))
    $("#pageTitle").textContent =
      `Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}`;
}
function attendanceRow(a, full = false) {
  const p = people.find((x) => x.id === a.personId && x.type === a.type) || {
    name: a.name,
    contact: "Archived record",
  };
  return `<tr><td>${personCell(p)}</td><td>${escapeHtml(a.idNumber)}</td><td><span class="type-pill ${a.type}">${a.type}</span></td>${full ? `<td>${formatDate(a.timestamp)}</td>` : ""}<td>${formatTime(a.timestamp)}</td><td><span class="status-pill">Present</span></td></tr>`;
}
function renderRecent() {
  const rows = attendance.slice(0, 5);
  $("#recentBody").innerHTML = rows.length
    ? rows.map((a) => attendanceRow(a)).join("")
    : emptyRow(5, "No scans yet. Tap a card to begin.");
}
function renderAttendance() {
  const q = $("#attendanceSearch").value.toLowerCase(),
    type = $("#attendanceFilter").value,
    rows = attendance.filter(
      (a) =>
        (type === "all" || a.type === type) &&
        (a.name.toLowerCase().includes(q) ||
          a.idNumber.toLowerCase().includes(q)),
    );
  $("#attendanceBody").innerHTML = rows.length
    ? rows.map((a) => attendanceRow(a, true)).join("")
    : emptyRow(6, "No matching attendance records.");
}
function renderDirectory(type) {
  const lower = type.toLowerCase(),
    q = $(`#${lower}Search`).value.toLowerCase(),
    rows = people.filter(
      (p) =>
        p.type === type &&
        (p.name.toLowerCase().includes(q) ||
          p.idNumber.toLowerCase().includes(q) ||
          p.groupName.toLowerCase().includes(q)),
    );
  $(`#${lower}RecordCount`).textContent =
    `${rows.length} ${rows.length === 1 ? "record" : "records"}`;
  $(`#${lower}sBody`).innerHTML = rows.length
    ? rows
        .map(
          (p) =>
            `<tr><td>${personCell(p)}</td><td><strong>${escapeHtml(p.idNumber)}</strong></td><td>${escapeHtml(p.groupName)}</td><td>${escapeHtml(p.contact || "—")}</td><td><button class="row-action" data-id="${p.id}" data-type="${p.type}" data-name="${escapeHtml(p.name)}">×</button></td></tr>`,
        )
        .join("")
    : emptyRow(5, `No ${lower}s found.`);
}
function render() {
  const todays = attendance.filter(
      (a) => todayKey(new Date(a.timestamp)) === todayKey(),
    ),
    unique = new Set(todays.map((a) => `${a.type}-${a.personId}`)),
    students = people.filter((p) => p.type === "Student"),
    employees = people.filter((p) => p.type === "Employee");
  $("#presentCount").textContent = unique.size;
  $("#studentCount").textContent = students.length;
  $("#employeeCount").textContent = employees.length;
  $("#studentsToday").textContent = students.filter((p) =>
    unique.has(`Student-${p.id}`),
  ).length;
  $("#employeesToday").textContent = employees.filter((p) =>
    unique.has(`Employee-${p.id}`),
  ).length;
  $("#attendanceRate").textContent = people.length
    ? `${Math.round((unique.size / people.length) * 100)}%`
    : "0%";
  renderRecent();
  renderAttendance();
  renderDirectory("Student");
  renderDirectory("Employee");
}
async function load() {
  try {
    currentUser = await api("/api/auth/me");
    $("#signedInName").textContent = currentUser.fullName;
    $("#signedInRole").textContent = currentUser.role;
    const isAdmin = ["Superadmin", "Administrator"].includes(currentUser.role);
    $$(".admin-only").forEach((element) => element.classList.toggle("hidden", !isAdmin));
    [people, attendance] = await Promise.all([
      api("/api/people"),
      api("/api/attendance"),
    ]);
    if (isAdmin) {
      users = await api("/api/users");
      renderUsers();
      const settings = await api("/api/settings");
      $("#schoolName").value = settings.school_name || "TapTrack Academy";
    }
    render();
  } catch (error) {
    $(".connection-pill").innerHTML = "<span></span>OFFLINE";
    message(error.message, "error");
  }
}
async function scan(raw) {
  const idNumber = raw.trim().toUpperCase();
  if (!idNumber) return;
  try {
    const record = await api("/api/attendance/scan", {
      method: "POST",
      body: JSON.stringify({ idNumber }),
    });
    attendance.unshift(record);
    render();
    message(`✓ Welcome, ${record.name}. Attendance recorded.`, "success");
    $(".scanner-card").classList.remove("flash");
    requestAnimationFrame(() => $(".scanner-card").classList.add("flash"));
  } catch (error) {
    message(
      error.message +
        (error.data?.timestamp
          ? ` at ${formatTime(error.data.timestamp)}`
          : ""),
      "error",
    );
  }
}
function showView(name) {
  $$(".view").forEach((v) =>
    v.classList.toggle("active", v.id === `${name}View`),
  );
  $$(".nav-item").forEach((n) =>
    n.classList.toggle("active", n.dataset.view === name),
  );
  const titles = {
    attendance: "Attendance log",
    students: "Student directory",
    employees: "Employee directory",
    maintenance: "Maintenance",
    users: "User management",
  };
  name === "dashboard" ? clock() : ($("#pageTitle").textContent = titles[name]);
}
function renderUsers() {
  $("#usersBody").innerHTML = users.length
    ? users.map((u) => `<tr><td>${personCell({name:u.fullName,contact:u.role})}</td><td><strong>${escapeHtml(u.username)}</strong></td><td><span class="type-pill Employee">${u.role}</span></td><td><span class="status-pill">${u.isActive ? "Active" : "Inactive"}</span></td><td><button class="secondary-button user-status" data-user-id="${u.id}">${u.isActive ? "Deactivate" : "Activate"}</button></td></tr>`).join("")
    : emptyRow(5, "No user accounts.");
}
$("#scanForm").addEventListener("submit", (e) => {
  e.preventDefault();
  scan($("#scanInput").value);
  $("#scanInput").value = "";
  $("#scanInput").focus();
});
$$(".nav-item").forEach((b) =>
  b.addEventListener("click", () => showView(b.dataset.view)),
);
$$("[data-go]").forEach((b) =>
  b.addEventListener("click", () => showView(b.dataset.go)),
);
$("#attendanceSearch").addEventListener("input", renderAttendance);
$("#attendanceFilter").addEventListener("change", renderAttendance);
$("#studentSearch").addEventListener("input", () => renderDirectory("Student"));
$("#employeeSearch").addEventListener("input", () =>
  renderDirectory("Employee"),
);
$$(".add-person").forEach((btn) =>
  btn.addEventListener("click", () => {
    const type = btn.dataset.type;
    $("#personForm").reset();
    $("#personType").value = type;
    $("#modalTitle").textContent = `Add ${type.toLowerCase()}`;
    $("#personGroup").previousSibling.textContent =
      type === "Student" ? "Program / Section" : "Department / Role";
    $("#formError").textContent = "";
    $("#personDialog").showModal();
  }),
);
$("#personForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#formError").textContent = "";
  try {
    const record = await api("/api/people", {
      method: "POST",
      body: JSON.stringify({
        idNumber: $("#personId").value,
        name: $("#personName").value,
        type: $("#personType").value,
        groupName: $("#personGroup").value,
        contact: $("#personContact").value,
      }),
    });
    people.push(record);
    render();
    $("#personDialog").close();
  } catch (error) {
    $("#formError").textContent = error.message;
  }
});
document.addEventListener("click", async (e) => {
  if (!e.target.dataset.id) return;
  if (confirm(`Remove ${e.target.dataset.name} from the directory?`)) {
    try {
      await api(`/api/people/${e.target.dataset.type}/${e.target.dataset.id}`, {
        method: "DELETE",
      });
      people = people.filter(
        (p) =>
          !(
            String(p.id) === e.target.dataset.id &&
            p.type === e.target.dataset.type
          ),
      );
      render();
    } catch (error) {
      alert(error.message);
    }
  }
});
$("#clearAttendance").addEventListener("click", async () => {
  if (
    attendance.length &&
    confirm("Clear all attendance records? This cannot be undone.")
  ) {
    try {
      await api("/api/attendance", { method: "DELETE" });
      attendance = [];
      render();
    } catch (error) {
      alert(error.message);
    }
  }
});
$("#exportBtn").addEventListener("click", () => {
  const header = "Name,ID Number,Type,Date,Time\n",
    rows = attendance
      .map((a) =>
        [
          a.name,
          a.idNumber,
          a.type,
          formatDate(a.timestamp),
          formatTime(a.timestamp),
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n"),
    url = URL.createObjectURL(new Blob([header + rows], { type: "text/csv" })),
    link = document.createElement("a");
  link.href = url;
  link.download = `attendance-${todayKey()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});
let scannerBuffer = "",
  scannerTimer;
document.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  if (e.key === "Enter" && scannerBuffer) {
    scan(scannerBuffer);
    scannerBuffer = "";
    return;
  }
  if (e.key.length === 1) {
    scannerBuffer += e.key;
    clearTimeout(scannerTimer);
    scannerTimer = setTimeout(() => (scannerBuffer = ""), 120);
  }
});
$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  location.href = "/login";
});
$("#addUserBtn").addEventListener("click", () => {
  $("#userForm").reset();
  $("#userError").textContent = "";
  $("#userDialog").showModal();
});
$("#userForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const user = await api("/api/users", { method: "POST", body: JSON.stringify({ fullName: $("#userFullName").value, username: $("#newUsername").value, password: $("#newPassword").value, role: $("#userRole").value }) });
    users.push(user); renderUsers(); $("#userDialog").close();
  } catch (error) { $("#userError").textContent = error.message; }
});
$("#usersBody").addEventListener("click", async (e) => {
  if (!e.target.classList.contains("user-status")) return;
  const user = users.find((u) => String(u.id) === e.target.dataset.userId);
  try { await api(`/api/users/${user.id}/status`, { method: "PATCH", body: JSON.stringify({ isActive: !user.isActive }) }); user.isActive = !user.isActive; renderUsers(); }
  catch (error) { alert(error.message); }
});
$("#settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await api("/api/settings", { method: "PUT", body: JSON.stringify({ school_name: $("#schoolName").value, duplicate_window: $("#duplicateWindow").value }) }); $("#settingsMessage").textContent = "Settings saved."; }
  catch (error) { $("#settingsMessage").textContent = error.message; }
});
$("#maintenanceExport").addEventListener("click", () => $("#exportBtn").click());
$("#maintenanceClear").addEventListener("click", () => $("#clearAttendance").click());
clock();
setInterval(clock, 30000);
load();
