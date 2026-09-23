const { $, api, escapeHtml, personCell, emptyRow, init } = TapTrack;
let alumni = [];
let currentUser = null;
let programs = [];
let sections = [];

function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  const query = $("#search").value.trim().toLowerCase();
  const showInactive = $("#showInactive").checked;
  const rows = alumni.filter(
    (item) =>
      (showInactive || Boolean(item.isActive)) &&
      `${item.idNumber} ${item.name} ${item.programCode || ""} ${item.graduationYear}`
        .toLowerCase()
        .includes(query),
  );
  $("#directoryTitle").textContent = showInactive
    ? "All alumni"
    : "Active alumni";
  $("#body").innerHTML = "";
  if (!rows.length) {
    $("#body").innerHTML = emptyRow(6, "No alumni records found.");
    return;
  }
  TapTrack.initDataTable(table, {
    data: rows,
    layout: {
      topStart: null,
      topEnd: null,
      bottomStart: "info",
      bottomEnd: "paging",
    },
    columns: [
      {
        data: "idNumber",
        render: (value, type) =>
          type === "display" ? `<strong>${escapeHtml(value)}</strong>` : value,
      },
      {
        data: null,
        render: (_value, type, item) =>
          type === "display"
            ? personCell({
                name: item.name,
                contact: item.institutionalEmail,
                photoUrl: item.photoUrl,
              })
            : item.name,
      },
      {
        data: "programCode",
        render: (value, type) =>
          type === "display"
            ? escapeHtml(value || "Not assigned")
            : value || "",
      },
      { data: "graduationYear" },
      {
        data: "isActive",
        render: (value, type) =>
          type === "display"
            ? `<span class="status-pill ${value ? "" : "time-out"}">${value ? "Active" : "Inactive"}</span>`
            : value,
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        render: (_value, type, item) =>
          type === "display"
            ? `<div class="table-actions">${["Superadmin", "Administrator"].includes(currentUser?.role) ? `<button class="edit secondary-button" data-id="${item.id}">Edit</button><button class="reenroll secondary-button" data-id="${item.id}" ${item.studentIsActive ? "disabled" : ""}>${item.studentIsActive ? "Student active" : "Re-enroll"}</button>` : ""}<button class="person-log-export secondary-button" data-person-id="${item.id}" data-person-type="alumnus" data-person-name="${escapeHtml(item.name)}" data-id-number="${escapeHtml(item.idNumber)}">Export</button>${["Superadmin", "Administrator"].includes(currentUser?.role) ? `<button class="status secondary-button" data-id="${item.id}">${item.isActive ? "Disable" : "Enable"}</button>` : ""}</div>`
            : "",
      },
    ],
    order: [[1, "asc"]],
  });
}

function openForm(item = null) {
  $("#form").reset();
  $("#recordId").value = item?.id || "";
  $("#dialogTitle").textContent = item ? "Edit alumnus" : "Add alumnus";
  $("#program").innerHTML =
    '<option value="">Select program</option>' +
    programs
      .filter((program) => program.isActive)
      .map(
        (program) =>
          `<option value="${program.id}">${escapeHtml(program.code)} · ${escapeHtml(program.name)}</option>`,
      )
      .join("");
  $("#firstName").value = item?.firstName || "";
  $("#middleName").value = item?.middleName || "";
  $("#lastName").value = item?.lastName || "";
  $("#idNumber").value = item?.idNumber || "";
  $("#program").value = item?.programId || "";
  $("#graduationYear").value = item?.graduationYear || new Date().getFullYear();
  $("#graduationYear").max = new Date().getFullYear() + 1;
  $("#birthday").value = item?.birthday
    ? String(item.birthday).slice(0, 10)
    : "";
  $("#gender").value = item?.gender || "";
  $("#institutionalEmail").value = item?.institutionalEmail || "";
  $("#error").textContent = "";
  $("#dialog").showModal();
}

$("#search").addEventListener("input", render);
$("#showInactive").addEventListener("change", render);
document.addEventListener("click", async (event) => {
  if (event.target.closest('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog").close();
    return;
  }
  const edit = event.target.closest(".edit");
  if (edit) {
    openForm(alumni.find((item) => String(item.id) === edit.dataset.id));
    return;
  }
  const reenroll = event.target.closest(".reenroll");
  if (reenroll && !reenroll.disabled) {
    const alumnus = alumni.find(
      (item) => String(item.id) === reenroll.dataset.id,
    );
    if (!alumnus) return;
    $("#reenrollAlumnusId").value = alumnus.id;
    $("#reenrollName").textContent = `${alumnus.name} (${alumnus.idNumber})`;
    $("#reenrollProgram").innerHTML =
      '<option value="">Select program</option>' +
      programs
        .filter((program) => program.isActive)
        .map(
          (program) =>
            `<option value="${program.id}">${escapeHtml(program.code)} · ${escapeHtml(program.name)}</option>`,
        )
        .join("");
    $("#reenrollYearLevel").value = "";
    $("#reenrollSection").innerHTML =
      '<option value="">Select section</option>';
    $("#reenrollSectionField").hidden = true;
    $("#reenrollSection").required = false;
    $("#reenrollError").textContent = "";
    $("#reenrollDialog").showModal();
    return;
  }
  const button = event.target.closest(".status");
  if (!button) return;
  const alumnus = alumni.find((item) => String(item.id) === button.dataset.id);
  if (!alumnus) return;
  button.disabled = true;
  try {
    await api(`/api/alumni/${alumnus.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !alumnus.isActive }),
    });
    alumnus.isActive = !alumnus.isActive;
    render();
  } catch (error) {
    TapTrack.toast(error.message, "error");
    button.disabled = false;
  }
});
$("#reenrollYearLevel").addEventListener("change", () => {
  const isGrade = /^Grade\s+(?:[1-9]|1[0-2])$/.test(
    $("#reenrollYearLevel").value,
  );
  $("#reenrollSectionField").hidden = !isGrade;
  $("#reenrollSection").required = isGrade;
  $("#reenrollSection").innerHTML = isGrade
    ? `<option value="">Select section</option>${sections
        .filter(
          (section) =>
            section.isActive &&
            section.yearLevel === $("#reenrollYearLevel").value,
        )
        .map(
          (section) =>
            `<option value="${section.id}">${escapeHtml(section.name)}</option>`,
        )
        .join("")}`
    : '<option value="">Not applicable</option>';
});
$("#reenrollForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#reenrollAlumnusId").value;
  const submit = event.submitter;
  submit.disabled = true;
  try {
    await api(`/api/alumni/${id}/reenroll`, {
      method: "POST",
      body: JSON.stringify({
        programId: $("#reenrollProgram").value,
        yearLevel: $("#reenrollYearLevel").value,
        sectionId: $("#reenrollSection").value,
      }),
    });
    const alumnus = alumni.find((item) => String(item.id) === id);
    if (alumnus) alumnus.studentIsActive = 1;
    $("#reenrollDialog").close();
    render();
    TapTrack.toast(
      "Student account activated. Alumni record retained.",
      "success",
    );
  } catch (error) {
    $("#reenrollError").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
$("#addBtn").addEventListener("click", () => openForm());
$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#recordId").value;
  const body = {
    idNumber: $("#idNumber").value,
    firstName: $("#firstName").value,
    middleName: $("#middleName").value,
    lastName: $("#lastName").value,
    programId: $("#program").value,
    graduationYear: Number($("#graduationYear").value),
    birthday: $("#birthday").value,
    institutionalEmail: $("#institutionalEmail").value,
    gender: $("#gender").value,
  };
  try {
    const saved = await api(id ? `/api/alumni/${id}` : "/api/alumni", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
    if (id)
      Object.assign(
        alumni.find((item) => String(item.id) === id),
        saved,
      );
    else alumni.push(saved);
    $("#dialog").close();
    render();
    TapTrack.toast(id ? "Alumnus updated." : "Alumnus added.", "success");
  } catch (error) {
    $("#error").textContent = error.message;
  }
});

(async () => {
  try {
    ({ user: currentUser } = await init("alumni"));
    [alumni, programs, sections] = await Promise.all([
      api("/api/alumni"),
      api("/api/program-options"),
      api("/api/section-options"),
    ]);
    render();
  } catch (error) {
    TapTrack.toast(
      error.message || "Alumni records could not be loaded.",
      "error",
    );
  }
})();
