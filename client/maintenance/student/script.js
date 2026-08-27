const { $, api, escapeHtml, personCell, emptyRow, init } = TapTrack;
let students = [],
  programs = [];
function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  const q = $("#search").value.toLowerCase(),
    status = $("#statusFilter").value,
    rows = students.filter(
      (s) =>
        (status === "all" || (status === "active") === Boolean(s.isActive)) &&
        `${s.name} ${s.idNumber} ${s.programName}`.toLowerCase().includes(q),
    );
  $("#count").textContent = `${rows.length} records`;
  $("#body").innerHTML =
    rows
      .map(
        (s) =>
          `<tr><td>${personCell({ name: s.name, contact: s.institutionalEmail })}</td><td><strong>${escapeHtml(s.idNumber)}</strong></td><td>${escapeHtml(s.programName || "Not assigned")}</td><td>${escapeHtml(s.yearLevel || "—")}</td><td>${escapeHtml(s.gender || "—")}</td><td><span class="status-pill ${s.isActive ? "" : "time-out"}">${s.isActive ? "Active" : "Inactive"}</span></td><td><div class="event-actions"><button class="secondary-button edit" data-id="${s.id}">Edit</button><button class="secondary-button person-log-export" data-person-id="${s.id}" data-person-type="student" data-person-name="${escapeHtml(s.name)}" data-id-number="${escapeHtml(s.idNumber)}">Export</button><button class="secondary-button status" data-id="${s.id}">${s.isActive ? "Deactivate" : "Activate"}</button></div></td></tr>`,
      )
      .join("") || emptyRow(7, "No student records found.");
  $("#body")
    .querySelectorAll(".status")
    .forEach((button) => button.remove());
  $("#body")
    .querySelectorAll(".edit")
    .forEach((button) => {
      button.title = "Edit";
      button.setAttribute("aria-label", "Edit student");
    });
  TapTrack.initDataTable(table);
}
function programOptions(selected = "") {
  $("#program").innerHTML =
    '<option value="">Select program</option>' +
    programs
      .filter((p) => p.isActive)
      .map(
        (p) =>
          `<option value="${p.id}" ${String(p.id) === String(selected) ? "selected" : ""}>${escapeHtml(p.code)} · ${escapeHtml(p.name)}</option>`,
      )
      .join("");
}
function open(student = null) {
  $("#form").reset();
  $("#recordId").value = student?.id || "";
  $("#dialogTitle").textContent = student ? "Edit student" : "Add student";
  $("#isActive").checked = student ? Boolean(student.isActive) : true;
  programOptions(student?.programId);
  if (
    student?.yearLevel &&
    ![...$("#yearLevel").options].some(
      (option) => option.value === student.yearLevel,
    )
  )
    $("#yearLevel").add(new Option(student.yearLevel, student.yearLevel));
  if (student) {
    [
      "firstName",
      "middleName",
      "lastName",
      "idNumber",
      "yearLevel",
      "birthday",
      "institutionalEmail",
      "gender",
    ].forEach((key) => {
      $(`#${key}`).value = student[key]
        ? String(student[key]).slice(0, key === "birthday" ? 10 : 999)
        : "";
    });
  }
  $("#error").textContent = "";
  $("#dialog").showModal();
}
$("#search").addEventListener("input", render);
$("#statusFilter").addEventListener("change", render);
$("#addBtn").addEventListener("click", () => open());
document.addEventListener("click", async (event) => {
  if (event.target.matches('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog").close();
    return;
  }
  const student = students.find(
    (s) => String(s.id) === event.target.dataset.id,
  );
  if (!student) return;
  if (event.target.classList.contains("edit")) open(student);
  if (event.target.classList.contains("status")) {
    await api(`/api/student/${student.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !student.isActive }),
    });
    student.isActive = !student.isActive;
    render();
  }
});
$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#recordId").value,
    selected = programs.find((p) => String(p.id) === $("#program").value),
    body = {
      firstName: $("#firstName").value,
      middleName: $("#middleName").value,
      lastName: $("#lastName").value,
      idNumber: $("#idNumber").value,
      programId: $("#program").value,
      programName: selected?.name || "",
      yearLevel: $("#yearLevel").value,
      birthday: $("#birthday").value,
      institutionalEmail: $("#institutionalEmail").value,
      gender: $("#gender").value,
    };
  try {
    const saved = await api(id ? `/api/student/${id}` : "/api/student", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
    if (id || !$("#isActive").checked)
      await api(`/api/student/${id || saved.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: $("#isActive").checked }),
      });
    if (id) {
      const existing = students.find((s) => String(s.id) === id);
      Object.assign(existing, saved, {
        programName: selected.name,
        isActive: $("#isActive").checked,
      });
    } else
      students.push({
        ...saved,
        programName: selected.name,
        isActive: $("#isActive").checked,
      });
    render();
    $("#dialog").close();
  } catch (error) {
    $("#error").textContent = error.message;
  }
});
(async () => {
  const loadingDialog = $("#studentLoadingDialog");
  loadingDialog.showModal();
  try {
    await init("students");
    [students, programs] = await Promise.all([
      api("/api/student"),
      api("/api/program-options"),
    ]);
    render();
  } catch (error) {
    TapTrack.toast(
      error.message || "Student records could not be loaded.",
      "error",
    );
  } finally {
    if (loadingDialog.open) loadingDialog.close();
  }
})();
