const { $, api, uploadProfilePhoto, escapeHtml, personCell, personName, emptyRow, init } = TapTrack;
const type = document.body.dataset.type;
const lower = type.toLowerCase();
let people = [], departments = [];

$("#form").insertAdjacentHTML("afterbegin", '<input type="hidden" id="recordId">');
$("#form .form-grid").insertAdjacentHTML(
  "beforeend",
  `<label class="full status-toggle-field"><span><strong>Active ${lower}</strong><small>Available throughout the system</small></span><input id="isActive" type="checkbox" checked></label>`,
);

function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  const query = $("#search").value.toLowerCase();
  const showInactive = $("#showInactive").checked;
  const directoryTitle = $("#employeeDirectoryTitle");
  if (directoryTitle)
    directoryTitle.textContent = showInactive
      ? "All employees"
      : "Active employees";
  const rows = people.filter(
    (person) =>
      (showInactive || Boolean(person.isActive)) &&
      (person.name.toLowerCase().includes(query) ||
        person.idNumber.toLowerCase().includes(query) ||
        person.departmentName.toLowerCase().includes(query)),
  );
  $("#body").innerHTML = "";
  if (!rows.length) {
    $("#body").innerHTML = emptyRow(6, `No ${lower}s found.`);
    return Promise.resolve(null);
  }
  return TapTrack.initDataTable(table, {
    data: rows,
    deferRender: true,
    columns: [
      { data: "idNumber", render: (value, mode) => mode === "display" ? `<strong>${escapeHtml(value)}</strong>` : value },
      { data: null, render: (_value, mode, person) => mode === "display" ? personCell(person) : personName(person) },
      { data: "departmentName", render: (value, mode) => mode === "display" ? escapeHtml(value) : value },
      { data: "contact", render: (value, mode) => mode === "display" ? escapeHtml(value || "—") : value || "" },
      { data: "isActive", render: (value, mode) => mode === "display" ? `<span class="status-pill ${value ? "" : "time-out"}">${value ? "Active" : "Inactive"}</span>` : value ? "Active" : "Inactive" },
      {
        data: null,
        orderable: false,
        searchable: false,
        render: (_value, mode, person) => mode === "display"
          ? `<div class="event-actions"><button class="secondary-button edit edit-icon" data-id="${person.id}" aria-label="Edit ${escapeHtml(person.name)}" title="Edit"></button><button class="secondary-button person-log-export" data-person-id="${person.id}" data-person-type="employee" data-person-name="${escapeHtml(person.name)}" data-id-number="${escapeHtml(person.idNumber)}">Export</button></div>`
          : "",
      },
    ],
    order: [[1, "asc"]],
  });
}

function open(person = null) {
  $("#form").reset();
  $("#recordId").value = person?.id || "";
  $("#dialog .modal-head h2").textContent = person ? `Edit ${lower}` : `Add ${lower}`;
  $("#isActive").checked = person ? Boolean(person.isActive) : true;
  $("#photoHelp").textContent = person?.photoUrl
    ? "Choose a new image to replace the current photo when you save."
    : "Choose a profile photo to upload when this " + lower + " is saved.";
  if (person) {
    $("#firstName").value = person.firstName || "";
    $("#middleName").value = person.middleName || "";
    $("#lastName").value = person.lastName || "";
    $("#idNumber").value = person.idNumber;
    $("#department").value = person.departmentId || "";
    $("#department").searchableSelectSync?.();
    $("#contact").value = person.contact || "";
  }
  $("#error").textContent = "";
  $("#dialog").showModal();
}

$("#search").addEventListener("input", render);
$("#showInactive").addEventListener("change", render);
$("#addBtn").addEventListener("click", () => open());
document.addEventListener("taptrack:photo-updated", (event) => {
  const person = people.find((item) => String(item.id) === String(event.detail.id));
  if (person) {
    person.photoUrl = `${event.detail.photoUrl}?v=${Date.now()}`;
    $("#editPhotoBtn").textContent = "Replace photo";
    render();
  }
});
document.addEventListener("click", (event) => {
  if (event.target.matches('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog").close();
    return;
  }
  if (!event.target.classList.contains("edit")) return;
  const person = people.find((item) => String(item.id) === event.target.dataset.id);
  if (person) open(person);
});

$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const id = $("#recordId").value;
    const record = await api(id ? `/api/${lower}/${id}` : `/api/${lower}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({
        idNumber: $("#idNumber").value,
        firstName: $("#firstName").value,
        middleName: $("#middleName").value,
        lastName: $("#lastName").value,
        departmentId: $("#department").value,
        contact: $("#contact").value,
        isActive: $("#isActive").checked,
      }),
    });
    record.isActive = $("#isActive").checked;
    let photoError = null;
    const photoFile = $("#photoInput").files[0];
    if (photoFile) {
      try {
        const photo = await uploadProfilePhoto(lower, id || record.id, photoFile);
        record.photoUrl = photo.photoUrl + "?v=" + Date.now();
      } catch (error) {
        photoError = error;
      }
    }
    if (id) Object.assign(people.find((item) => String(item.id) === id), record);
    else people.push(record);
    render();
    $("#dialog").close();
    if (photoError)
      TapTrack.toast(
        "The " + lower + " was saved, but the photo could not be uploaded: " + photoError.message,
        "error",
      );
  } catch (error) {
    $("#error").textContent = error.message;
  }
});

(async () => {
  const loadingDialog = $("#employeeLoadingDialog");
  const loadingTitle = $("#employeeLoadingTitle");
  const loadingMessage = $("#employeeLoadingMessage");
  loadingDialog.addEventListener("cancel", (event) => event.preventDefault());
  if (!loadingDialog.open) loadingDialog.showModal();
  try {
    await new Promise(requestAnimationFrame);
    loadingTitle.textContent = "Loading employee directory";
    loadingMessage.textContent = "Checking your access and preparing the page.";
    await init("employees");
    loadingTitle.textContent = "Loading employee records";
    loadingMessage.textContent = "Retrieving employee information.";
    [people, departments] = await Promise.all([
      api(`/api/${lower}`),
      api("/api/employee_department"),
    ]);
    $("#department").innerHTML = `<option value="">Select department</option>${departments.filter((item) => item.isActive).map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}`;
    $("#department").searchableSelectSync?.();
    loadingTitle.textContent = "Preparing the table";
    loadingMessage.textContent = `Displaying ${people.length.toLocaleString()} employee records.`;
    await render();
    await new Promise(requestAnimationFrame);
  } catch (error) {
    TapTrack.toast(error.message || "Employee records could not be loaded.", "error");
  } finally {
    if (loadingDialog.open) loadingDialog.close();
  }
})();
