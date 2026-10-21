const { $, api, escapeHtml, personCell, emptyRow, init, loadXlsx } = TapTrack;
let students = [],
  programs = [],
  sections = [],
  currentUser = null;
let managePopup = null;
let manageTrigger = null;
let bulkGraduateIds = [];
const openCardEnrollment = TapTrack.initCardEnrollmentDialog({ personType: "student", onSave: render });

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
  popup.innerHTML = `<button class="edit" data-id="${student.id}">Edit</button><button class="card-enroll" data-id="${student.id}">Enroll card</button>${["Superadmin", "Administrator"].includes(currentUser?.role) ? `<button class="graduate" data-id="${student.id}" ${student.isActive ? "" : "disabled"}>Move to Alumni</button>` : ""}<button class="person-log-export" data-person-id="${student.id}" data-person-type="student" data-person-name="${escapeHtml(student.name)}" data-id-number="${escapeHtml(student.idNumber)}">Export</button>`;
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

["program", "yearLevel", "section", "gender"].forEach((id) =>
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
        `${s.name} ${s.idNumber} ${s.programCode || ""} ${s.yearLevel || ""} ${s.sectionName || ""}`
          .toLowerCase()
          .includes(q),
    );
  $("#studentDirectoryTitle").textContent = showInactive
    ? "All students"
    : "Active students";
  $("#body").innerHTML = "";
  if (!rows.length) {
    $("#body").innerHTML = emptyRow(7, "No student records found.");
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
        render: (value, type, student) =>
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
        render: (value, type, student) =>
          type === "display"
            ? `<span class="student-placement">${display(value)}${student.sectionName ? `<small>${escapeHtml(student.sectionName)}</small>` : ""}</span>`
            : `${value || ""} ${student.sectionName || ""}`.trim(),
      },
      {
        data: "cardId",
        render: (value, type) => type === "display" ? (value ? `<span class="status-pill" title="${escapeHtml(value)}">Enrolled</span>` : "Not enrolled") : (value || ""),
      },
      {
        data: "isActive",
        render: (value, type, student) =>
          type === "display"
            ? `<span class="status-pill ${value ? "" : "time-out"}">${value ? "Active" : "Inactive"}${student.isAlumnus ? " · Alumnus" : ""}</span>`
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
function syncSectionField(selected = $("#section").value) {
  const isGrade = /^Grade\s+(?:[1-9]|1[0-2])$/.test($("#yearLevel").value);
  $("#sectionNameField").hidden = !isGrade;
  $("#section").required = isGrade;
  $("#section").innerHTML = isGrade
    ? `<option value="">Select section</option>${sections
        .filter(
          (section) =>
            section.isActive && section.yearLevel === $("#yearLevel").value,
        )
        .map(
          (section) =>
            `<option value="${section.id}" ${String(section.id) === String(selected) ? "selected" : ""}>${escapeHtml(section.name)}</option>`,
        )
        .join("")}`
    : '<option value="">Not applicable</option>';
  $("#section").searchableSelectSync?.();
}
$("#yearLevel").addEventListener("change", syncSectionField);
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
  syncSectionField(student?.sectionId);
  $("#error").textContent = "";
  $("#dialog").showModal();
}
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
      "Section Name": student.sectionName || "",
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
  if (event.target.classList.contains("card-enroll")) {
    openCardEnrollment(student);
  }
  if (event.target.classList.contains("graduate")) {
    $("#graduateStudentId").value = student.id;
    $("#graduateStudentName").textContent =
      `${student.name} (${student.idNumber})`;
    $("#graduationYear").value = new Date().getFullYear();
    $("#graduationYear").max = new Date().getFullYear() + 1;
    $("#graduateError").textContent = "";
    $("#graduateDialog").showModal();
  }
  if (event.target.classList.contains("status")) {
    await api(`/api/student/${student.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !student.isActive }),
    });
    student.isActive = !student.isActive;
    await render();
  }
});
$("#graduateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const studentId = $("#graduateStudentId").value;
  const submit = event.submitter;
  submit.disabled = true;
  submit.textContent = "Transferring…";
  try {
    await api(`/api/student/${studentId}/transfer-to-alumni`, {
      method: "POST",
      body: JSON.stringify({
        graduationYear: Number($("#graduationYear").value),
      }),
    });
    const student = students.find((item) => String(item.id) === studentId);
    if (student) student.isActive = false;
    await render();
    $("#graduateDialog").close();
    TapTrack.toast("Student transferred to the Alumni directory.", "success");
  } catch (error) {
    $("#graduateError").textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "Confirm graduation";
  }
});
$("#bulkGraduateBtn").addEventListener("click", () => {
  bulkGraduateIds = [];
  $("#bulkGraduateForm").reset();
  $("#bulkGraduationYear").value = new Date().getFullYear();
  $("#bulkGraduationYear").max = new Date().getFullYear() + 1;
  $("#bulkGraduateFileName").textContent = "Choose an Excel or CSV file";
  $("#bulkGraduateCount").textContent = "No IDs loaded.";
  $("#bulkGraduateError").textContent = "";
  $("#runBulkGraduate").disabled = true;
  $("#bulkGraduateDialog").showModal();
});
$("#bulkGraduateFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  bulkGraduateIds = [];
  $("#runBulkGraduate").disabled = true;
  $("#bulkGraduateError").textContent = "";
  if (!file) return;
  $("#bulkGraduateFileName").textContent = `Selected: ${file.name}`;
  try {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name))
      throw new Error("Choose an .xlsx, .xls, or .csv file.");
    if (file.size > 5 * 1024 * 1024)
      throw new Error("The ID file must be 5 MB or smaller.");
    await loadXlsx();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]],
      {
        header: 1,
        defval: "",
        raw: false,
      },
    );
    if (!rows.length) throw new Error("The first worksheet is empty.");
    const normalizeHeader = (value) =>
      String(value || "")
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase();
    const acceptedHeaders = new Set(["idnumber", "studentid", "schoolid"]);
    const column = rows[0].findIndex((value) =>
      acceptedHeaders.has(normalizeHeader(value)),
    );
    if (column < 0)
      throw new Error("Add a column named IDNumber, StudentID, or SchoolID.");
    const imported = [
      ...new Set(
        rows
          .slice(1)
          .map((row) =>
            String(row[column] || "")
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      ),
    ];
    if (!imported.length)
      throw new Error("No student IDs were found in the file.");
    if (imported.length > 10000)
      throw new Error("A bulk move can contain at most 10,000 IDs.");
    const activeIds = new Set(
      students
        .filter((student) => student.isActive)
        .map((student) => String(student.idNumber).trim().toUpperCase()),
    );
    bulkGraduateIds = imported.filter((id) => activeIds.has(id));
    const skipped = imported.length - bulkGraduateIds.length;
    $("#bulkGraduateCount").textContent =
      `${bulkGraduateIds.length.toLocaleString()} active student${bulkGraduateIds.length === 1 ? "" : "s"} ready to move${skipped ? `; ${skipped.toLocaleString()} unknown or inactive ID${skipped === 1 ? "" : "s"} will be skipped` : ""}.`;
    $("#runBulkGraduate").disabled = !bulkGraduateIds.length;
  } catch (error) {
    $("#bulkGraduateCount").textContent = "No valid IDs loaded.";
    $("#bulkGraduateError").textContent = error.message;
  }
});
$("#bulkGraduateTemplateBtn").addEventListener("click", async () => {
  try {
    await loadXlsx();
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([{ IDNumber: "20230001" }]),
      "Graduating Students",
    );
    XLSX.writeFile(workbook, "alumni_bulk_move_template.xlsx");
  } catch (error) {
    $("#bulkGraduateError").textContent = error.message;
  }
});
$("#bulkGraduateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!bulkGraduateIds.length) return;
  const submit = event.submitter;
  submit.disabled = true;
  submit.textContent = "Moving students…";
  try {
    const result = await api("/api/student/bulk-transfer-to-alumni", {
      method: "POST",
      body: JSON.stringify({
        idNumbers: bulkGraduateIds,
        graduationYear: Number($("#bulkGraduationYear").value),
      }),
    });
    const moved = new Set(
      result.movedIdNumbers.map((value) => String(value).trim().toUpperCase()),
    );
    students.forEach((student) => {
      if (moved.has(String(student.idNumber).trim().toUpperCase())) {
        student.isActive = false;
        student.isAlumnus = 1;
      }
    });
    bulkGraduateIds = [];
    $("#bulkGraduateDialog").close();
    await render();
    TapTrack.toast(
      `${result.transferred.toLocaleString()} student${result.transferred === 1 ? "" : "s"} moved to Alumni.`,
      "success",
    );
  } catch (error) {
    $("#bulkGraduateError").textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "Move students";
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
      sectionId: $("#section").value,
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
    $("#bulkGraduateBtn").hidden = !["Superadmin", "Administrator"].includes(
      currentUser?.role,
    );
    loadingTitle.textContent = "Loading student records";
    loadingMessage.textContent = "Retrieving students and academic programs.";
    [students, programs, sections] = await Promise.all([
      api("/api/student"),
      api("/api/program-options"),
      api("/api/section-options"),
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
