const {
  $,
  api,
  uploadProfilePhoto,
  escapeHtml,
  personCell,
  personName,
  emptyRow,
  init,
} = TapTrack;
const type = document.body.dataset.type;
const lower = type.toLowerCase();
let people = [],
  departments = [],
  currentUser = null;
let managePopup = null;
let manageTrigger = null;

function closeManagePopup() {
  if (manageTrigger) manageTrigger.setAttribute("aria-expanded", "false");
  managePopup?.remove();
  managePopup = null;
  manageTrigger = null;
}

function openManagePopup(trigger) {
  closeManagePopup();
  const person = people.find(
    (item) => String(item.id) === String(trigger.dataset.id),
  );
  if (!person) return;
  const popup = document.createElement("div");
  popup.className = "event-action-options event-action-popup";
  popup.innerHTML = `<button class="edit" data-id="${person.id}">Edit</button>${["Superadmin", "Administrator"].includes(currentUser?.role) ? `<button class="card-enroll" data-id="${person.id}" ${person.isActive ? "" : "disabled"}>Enroll card</button>` : ""}<button class="person-log-export" data-person-id="${person.id}" data-person-type="employee" data-person-name="${escapeHtml(person.name)}" data-id-number="${escapeHtml(person.idNumber)}">Export</button>`;
  document.body.appendChild(popup);
  const rect = trigger.getBoundingClientRect();
  const width = 172;
  const height = popup.offsetHeight;
  popup.style.left = `${Math.max(8, Math.min(rect.right - width, innerWidth - width - 8))}px`;
  popup.style.top = `${rect.bottom + height + 8 <= innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - height - 6)}px`;
  trigger.setAttribute("aria-expanded", "true");
  managePopup = popup;
  manageTrigger = trigger;
}

$("#form").insertAdjacentHTML(
  "afterbegin",
  '<input type="hidden" id="recordId">',
);
$("#form .form-grid").insertAdjacentHTML(
  "beforeend",
  `<label class="full status-toggle-field"><span><strong>Active ${lower}</strong><small>Available throughout the system</small></span><input id="isActive" type="checkbox" checked></label>`,
);

function render() {
  closeManagePopup();
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
        String(person.departmentName || "")
          .toLowerCase()
          .includes(query) ||
        String(person.departmentCode || "")
          .toLowerCase()
          .includes(query)),
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
      {
        data: "idNumber",
        render: (value, mode) =>
          mode === "display" ? `<strong>${escapeHtml(value)}</strong>` : value,
      },
      {
        data: null,
        render: (_value, mode, person) =>
          mode === "display" ? personCell(person) : personName(person),
      },
      {
        data: "departmentCode",
        render: (value, mode) =>
          mode === "display" ? escapeHtml(value) : value,
      },
      {
        data: "contact",
        render: (value, mode) =>
          mode === "display" ? escapeHtml(value || "—") : value || "",
      },
      {
        data: "isActive",
        render: (value, mode) =>
          mode === "display"
            ? `<span class="status-pill ${value ? "" : "time-out"}">${value ? "Active" : "Inactive"}</span>`
            : value
              ? "Active"
              : "Inactive",
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        render: (_value, mode, person) =>
          mode === "display"
            ? `<button class="event-action-trigger person-manage-trigger" data-id="${person.id}" aria-expanded="false">Manage <span class="material-symbols-rounded" aria-hidden="true">expand_more</span></button>`
            : "",
      },
    ],
    order: [[1, "asc"]],
  });
}

function open(person = null) {
  $("#form").reset();
  $("#recordId").value = person?.id || "";
  $("#dialog .modal-head h2").textContent = person
    ? `Edit ${lower}`
    : `Add ${lower}`;
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

let cardEnrollmentPerson = null;
let enrollmentCardRead = false;
async function openCardEnrollment(person) {
  cardEnrollmentPerson = person;
  enrollmentCardRead = false;
  $("#cardEnrollmentName").textContent = personName(person);
  $("#cardEnrollmentId").textContent = `ID number: ${person.idNumber}`;
  $("#cardEnrollmentError").textContent = "";
  $("#cardEnrollmentStatus").textContent = "Checking the local NFC writer…";
  $("#cardCurrentValue").textContent = "Current card text: Not read";
  $("#readCardBtn").disabled = true;
  $("#writeCardBtn").disabled = true;
  $("#cardEnrollmentDialog").showModal();
  try {
    const status = await api("/api/employee/card-writer/status");
    $("#cardEnrollmentStatus").textContent = status.message;
    $("#readCardBtn").disabled = !status.available || status.busy;
  } catch (error) {
    $("#cardEnrollmentStatus").textContent = "NFC writer unavailable.";
    $("#cardEnrollmentError").textContent = error.message;
  }
}

$("#readCardBtn").addEventListener("click", async () => {
  const button = $("#readCardBtn");
  button.disabled = true;
  button.textContent = "Reading…";
  $("#writeCardBtn").disabled = true;
  $("#cardEnrollmentError").textContent = "";
  try {
    const result = await api("/api/employee/card-writer/read", {
      method: "POST",
    });
    enrollmentCardRead = true;
    $("#cardCurrentValue").textContent =
      `Current card text: ${result.value || "Blank card"}`;
    $("#cardEnrollmentStatus").textContent =
      "Card read successfully. Keep the same card in place to write.";
    $("#writeCardBtn").disabled = false;
  } catch (error) {
    enrollmentCardRead = false;
    $("#cardEnrollmentError").textContent = error.message;
  } finally {
    button.textContent = "Read card";
    button.disabled = false;
  }
});

$("#cardEnrollmentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!cardEnrollmentPerson) return;
  const button = $("#writeCardBtn");
  button.disabled = true;
  button.textContent = "Writing… keep card in place";
  $("#cardEnrollmentError").textContent = "";
  try {
    await api(`/api/employee/${cardEnrollmentPerson.id}/card-enrollment`, {
      method: "POST",
    });
    $("#cardEnrollmentDialog").close();
    TapTrack.toast(
      `Card enrolled and verified for ${cardEnrollmentPerson.idNumber}.`,
      "success",
    );
  } catch (error) {
    enrollmentCardRead = false;
    $("#cardEnrollmentError").textContent = error.message;
    $("#cardEnrollmentStatus").textContent =
      "Read the card again before another write attempt.";
  } finally {
    button.textContent = "Write and verify card";
    button.disabled = !enrollmentCardRead;
  }
});

$("#search").addEventListener("input", render);
$("#showInactive").addEventListener("change", render);
$("#addBtn").addEventListener("click", () => open());
document.addEventListener("taptrack:photo-updated", (event) => {
  const person = people.find(
    (item) => String(item.id) === String(event.detail.id),
  );
  if (person) {
    person.photoUrl = `${event.detail.photoUrl}?v=${Date.now()}`;
    $("#editPhotoBtn").textContent = "Replace photo";
    render();
  }
});
document.addEventListener("click", (event) => {
  const manageButton = event.target.closest(".person-manage-trigger");
  if (manageButton) {
    if (manageButton === manageTrigger) closeManagePopup();
    else openManagePopup(manageButton);
    return;
  }
  if (managePopup) {
    if (!managePopup.contains(event.target)) closeManagePopup();
    else if (event.target.closest("button")) closeManagePopup();
  }
  if (event.target.matches('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog").close();
    return;
  }
  const person = people.find(
    (item) => String(item.id) === event.target.dataset.id,
  );
  if (!person) return;
  if (event.target.classList.contains("edit")) open(person);
  if (event.target.classList.contains("card-enroll"))
    openCardEnrollment(person);
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
        const photo = await uploadProfilePhoto(
          lower,
          id || record.id,
          photoFile,
        );
        record.photoUrl = photo.photoUrl + "?v=" + Date.now();
      } catch (error) {
        photoError = error;
      }
    }
    if (id)
      Object.assign(
        people.find((item) => String(item.id) === id),
        record,
      );
    else people.push(record);
    render();
    $("#dialog").close();
    if (photoError)
      TapTrack.toast(
        "The " +
          lower +
          " was saved, but the photo could not be uploaded: " +
          photoError.message,
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
    ({ user: currentUser } = await init("employees"));
    loadingTitle.textContent = "Loading employee records";
    loadingMessage.textContent = "Retrieving employee information.";
    [people, departments] = await Promise.all([
      api(`/api/${lower}`),
      api("/api/employee_department"),
    ]);
    $("#department").innerHTML =
      `<option value="">Select department</option>${departments
        .filter((item) => item.isActive)
        .map(
          (item) =>
            `<option value="${item.id}">${escapeHtml(item.name)}</option>`,
        )
        .join("")}`;
    $("#department").searchableSelectSync?.();
    loadingTitle.textContent = "Preparing the table";
    loadingMessage.textContent = `Displaying ${people.length.toLocaleString()} employee records.`;
    await render();
    await new Promise(requestAnimationFrame);
  } catch (error) {
    TapTrack.toast(
      error.message || "Employee records could not be loaded.",
      "error",
    );
  } finally {
    if (loadingDialog.open) loadingDialog.close();
  }
})();
