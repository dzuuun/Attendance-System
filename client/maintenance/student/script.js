const { $, api, escapeHtml, personCell, emptyRow, init, loadXlsx } = TapTrack;
let students = [],
  programs = [],
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
  const student = students.find(
    (item) => String(item.id) === String(trigger.dataset.id),
  );
  if (!student) return;
  const popup = document.createElement("div");
  popup.className = "event-action-options event-action-popup";
  popup.innerHTML = `<button class="edit" data-id="${student.id}">Edit</button>${["Superadmin", "Administrator"].includes(currentUser?.role) ? `<button class="card-enroll" data-id="${student.id}" ${student.isActive ? "" : "disabled"}>Enroll card</button>` : ""}<button class="person-log-export" data-person-id="${student.id}" data-person-type="student" data-person-name="${escapeHtml(student.name)}" data-id-number="${escapeHtml(student.idNumber)}">Export</button>`;
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

function enhanceSearchableSelect(select) {
  const wrapper = document.createElement("div");
  wrapper.className = "searchable-select";
  select.before(wrapper);
  wrapper.appendChild(select);
  select.classList.add("searchable-select-native");
  wrapper.insertAdjacentHTML(
    "beforeend",
    `<button type="button" class="searchable-select-trigger" aria-haspopup="listbox" aria-expanded="false"><span></span><span class="material-symbols-rounded" aria-hidden="true">expand_more</span></button><div class="searchable-select-menu" hidden><input type="search" class="searchable-select-search" placeholder="Search..." autocomplete="off" /><div class="searchable-select-options" role="listbox"></div></div>`,
  );
  const trigger = wrapper.querySelector(".searchable-select-trigger");
  const triggerLabel = trigger.querySelector("span:first-child");
  const menu = wrapper.querySelector(".searchable-select-menu");
  const search = wrapper.querySelector(".searchable-select-search");
  const options = wrapper.querySelector(".searchable-select-options");

  const sync = () => {
    const selected = select.selectedOptions[0];
    triggerLabel.textContent = selected?.textContent || "Select an option";
    trigger.classList.toggle("placeholder", !select.value);
  };
  const close = () => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    wrapper.classList.remove("open");
  };
  const renderOptions = () => {
    const query = search.value.trim().toLowerCase();
    const available = [...select.options].filter(
      (option) =>
        !option.disabled &&
        option.value &&
        option.textContent.toLowerCase().includes(query),
    );
    options.innerHTML = available.length
      ? available
          .map(
            (option) =>
              `<button type="button" role="option" data-value="${escapeHtml(option.value)}" aria-selected="${String(option.value === select.value)}" class="${option.value === select.value ? "selected" : ""}">${escapeHtml(option.textContent)}</button>`,
          )
          .join("")
      : '<p class="searchable-select-empty">No matching options</p>';
  };

  trigger.addEventListener("click", () => {
    const opening = menu.hidden;
    document.querySelectorAll(".searchable-select.open").forEach((item) => {
      if (item !== wrapper)
        item.querySelector(".searchable-select-menu").hidden = true;
      if (item !== wrapper) item.classList.remove("open");
    });
    if (!opening) return close();
    search.value = "";
    renderOptions();
    menu.hidden = false;
    wrapper.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => search.focus());
  });
  search.addEventListener("input", renderOptions);
  options.addEventListener("click", (event) => {
    const option = event.target.closest("[data-value]");
    if (!option) return;
    select.value = option.dataset.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    sync();
    close();
    trigger.focus();
  });
  wrapper.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
      trigger.focus();
    }
  });
  select.addEventListener("change", sync);
  select.addEventListener("invalid", (event) => {
    event.preventDefault();
    trigger.focus();
    if (menu.hidden) trigger.click();
  });
  select.searchableSelectSync = sync;
  sync();
}

["program", "yearLevel", "gender"].forEach((id) =>
  TapTrack.enhanceSearchableSelect($(`#${id}`)),
);

document.addEventListener("click", (event) => {
  if (event.target.closest(".searchable-select")) return;
  document.querySelectorAll(".searchable-select.open").forEach((wrapper) => {
    wrapper.classList.remove("open");
    wrapper.querySelector(".searchable-select-menu").hidden = true;
    wrapper
      .querySelector(".searchable-select-trigger")
      .setAttribute("aria-expanded", "false");
  });
});
function render() {
  closeManagePopup();
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  const q = $("#search").value.toLowerCase(),
    showInactive = $("#showInactive").checked,
    rows = students.filter(
      (s) =>
        (showInactive || Boolean(s.isActive)) &&
        `${s.name} ${s.idNumber} ${s.programCode || ""}`
          .toLowerCase()
          .includes(q),
    );
  $("#studentDirectoryTitle").textContent = showInactive
    ? "All students"
    : "Active students";
  $("#body").innerHTML = "";
  if (!rows.length) {
    $("#body").innerHTML = emptyRow(6, "No student records found.");
    return Promise.resolve(null);
  }
  const display = (value) => escapeHtml(value || "—");
  return TapTrack.initDataTable(table, {
    data: rows,
    deferRender: true,
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
        render: (_value, type, student) =>
          type === "display"
            ? personCell({
                name: TapTrack.personName(student),
                contact: student.institutionalEmail,
                photoUrl: student.photoUrl,
              })
            : TapTrack.personName(student),
      },
      {
        data: "programCode",
        render: (value, type) =>
          type === "display" ? display(value || "Not assigned") : value || "",
      },
      {
        data: "yearLevel",
        render: (value, type) =>
          type === "display" ? display(value) : value || "",
      },
      {
        data: "isActive",
        render: (value, type) =>
          type === "display"
            ? `<span class="status-pill ${value ? "" : "time-out"}">${value ? "Active" : "Inactive"}</span>`
            : value
              ? "Active"
              : "Inactive",
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        render: (_value, type, student) =>
          type === "display"
            ? `<button class="event-action-trigger person-manage-trigger" data-id="${student.id}" aria-expanded="false">Manage <span class="material-symbols-rounded" aria-hidden="true">expand_more</span></button>`
            : "",
      },
    ],
    order: [[1, "asc"]],
  });
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
  $("#program").searchableSelectSync?.();
}
function open(student = null) {
  document.querySelectorAll(".searchable-select").forEach((wrapper) => {
    wrapper.classList.remove("open");
    wrapper.querySelector(".searchable-select-menu").hidden = true;
    wrapper
      .querySelector(".searchable-select-trigger")
      .setAttribute("aria-expanded", "false");
  });
  $("#form").reset();
  $("#recordId").value = student?.id || "";
  $("#dialogTitle").textContent = student ? "Edit student" : "Add student";
  $("#isActive").checked = student ? Boolean(student.isActive) : true;
  $("#photoHelp").textContent = student?.photoUrl
    ? "Choose a new image to replace the current photo when you save."
    : "Choose a profile photo to upload when this student is saved.";
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
  ["program", "yearLevel", "gender"].forEach((id) =>
    $(`#${id}`).searchableSelectSync?.(),
  );
  $("#error").textContent = "";
  $("#dialog").showModal();
}
let cardEnrollmentStudent = null;
let enrollmentCardRead = false;
async function openCardEnrollment(student) {
  cardEnrollmentStudent = student;
  enrollmentCardRead = false;
  $("#cardEnrollmentName").textContent = TapTrack.personName(student);
  $("#cardEnrollmentId").textContent = `ID number: ${student.idNumber}`;
  $("#cardEnrollmentError").textContent = "";
  $("#cardEnrollmentStatus").textContent = "Checking the local NFC writer…";
  $("#cardCurrentValue").textContent = "Current card text: Not read";
  $("#readCardBtn").disabled = true;
  $("#writeCardBtn").disabled = true;
  $("#cardEnrollmentDialog").showModal();
  try {
    const status = await TapTrackNfc.status();
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
    const result = await TapTrackNfc.read();
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
  if (!cardEnrollmentStudent) return;
  const button = $("#writeCardBtn");
  button.disabled = true;
  button.textContent = "Writing… keep card in place";
  $("#cardEnrollmentError").textContent = "";
  try {
    const authorization = await api(
      `/api/student/${cardEnrollmentStudent.id}/card-enrollment`,
      {
        method: "POST",
        body: JSON.stringify({ validateOnly: true }),
      },
    );
    await TapTrackNfc.write(authorization.idNumber);
    await api(`/api/student/${cardEnrollmentStudent.id}/card-enrollment`, {
      method: "POST",
      body: JSON.stringify({ localVerified: true }),
    });
    $("#cardEnrollmentDialog").close();
    TapTrack.toast(
      `Card enrolled and verified for ${cardEnrollmentStudent.idNumber}.`,
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
$("#exportStudentsBtn").addEventListener("click", async () => {
  const includeInactive = $("#showInactive").checked;
  const rows = students
    .filter((student) => includeInactive || student.isActive)
    .map((student) => ({
      "ID Number": student.idNumber,
      "First Name": student.firstName,
      "Middle Name": student.middleName || "",
      "Last Name": student.lastName,
      "Program Code": student.programCode || "",
      "Year Level": student.yearLevel || "",
      Birthday: student.birthday ? String(student.birthday).slice(0, 10) : "",
      "Institutional Email": student.institutionalEmail || "",
      Gender: student.gender || "",
      Status: student.isActive ? "Active" : "Inactive",
    }));
  try {
    await loadXlsx();
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = Object.keys(rows[0] || { Student: "" }).map((key) => ({
      wch: Math.max(14, key.length + 2),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Students");
    XLSX.writeFile(
      workbook,
      includeInactive ? "all_students.xlsx" : "active_students.xlsx",
    );
    TapTrack.toast("Student export created.", "success");
  } catch (error) {
    TapTrack.toast(
      error.message || "Student export could not be created.",
      "error",
    );
  }
});
document.addEventListener("taptrack:photo-updated", (event) => {
  const student = students.find(
    (item) => String(item.id) === String(event.detail.id),
  );
  if (student) {
    student.photoUrl = `${event.detail.photoUrl}?v=${Date.now()}`;
    render();
  }
});
$("#addBtn").addEventListener("click", () => open());
document.addEventListener("click", async (event) => {
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
  const student = students.find(
    (s) => String(s.id) === event.target.dataset.id,
  );
  if (!student) return;
  if (event.target.classList.contains("edit")) open(student);
  if (event.target.classList.contains("card-enroll"))
    openCardEnrollment(student);
  if (event.target.classList.contains("status")) {
    await api(`/api/student/${student.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !student.isActive }),
    });
    student.isActive = !student.isActive;
    await render();
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
      programCode: selected?.code || "",
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
    let photoError = null;
    const photoFile = $("#photoInput").files[0];
    if (photoFile) {
      try {
        const photo = await TapTrack.uploadProfilePhoto(
          "student",
          id || saved.id,
          photoFile,
        );
        saved.photoUrl = photo.photoUrl + "?v=" + Date.now();
      } catch (error) {
        photoError = error;
      }
    }
    if (id) {
      const existing = students.find((s) => String(s.id) === id);
      Object.assign(existing, saved, {
        programName: selected.name,
        programCode: selected.code,
        isActive: $("#isActive").checked,
      });
    } else
      students.push({
        ...saved,
        programName: selected.name,
        programCode: selected.code,
        isActive: $("#isActive").checked,
      });
    render();
    $("#dialog").close();
    if (photoError)
      TapTrack.toast(
        "The student was saved, but the photo could not be uploaded: " +
          photoError.message,
        "error",
      );
  } catch (error) {
    $("#error").textContent = error.message;
  }
});
(async () => {
  const loadingDialog = $("#studentLoadingDialog");
  const loadingTitle = $("#studentLoadingTitle");
  const loadingMessage = $("#studentLoadingMessage");
  loadingDialog.addEventListener("cancel", (event) => event.preventDefault());
  loadingDialog.showModal();
  try {
    await new Promise(requestAnimationFrame);
    loadingTitle.textContent = "Loading student directory";
    loadingMessage.textContent = "Checking your access and preparing the page.";
    ({ user: currentUser } = await init("students"));
    $("#mssqlImportBtn").hidden = !["Superadmin", "Administrator"].includes(
      currentUser?.role,
    );
    loadingTitle.textContent = "Loading student records";
    loadingMessage.textContent = "Retrieving students and academic programs.";
    [students, programs] = await Promise.all([
      api("/api/student"),
      api("/api/program-options"),
    ]);
    loadingTitle.textContent = "Preparing the table";
    loadingMessage.textContent = `Displaying ${students.length.toLocaleString()} student records.`;
    await render();
    await new Promise(requestAnimationFrame);
  } catch (error) {
    TapTrack.toast(
      error.message || "Student records could not be loaded.",
      "error",
    );
  } finally {
    if (loadingDialog.open) loadingDialog.close();
  }
})();
