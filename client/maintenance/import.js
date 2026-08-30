(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const path = location.pathname.split("/").filter(Boolean).pop();
  const academic = ["school", "college", "department", "program"].includes(
    path,
  );
  const type =
    path === "student"
      ? "student"
      : path === "employee"
        ? "employee"
        : academic
          ? path
          : null;
  if (!type) return;

  const plural = type === "employee" ? "employees" : `${type}s`;
  const parent = {
    college: "school",
    department: "college",
    program: "department",
  }[type];
  const required = academic
    ? ["Name", "Code", ...(parent ? [`${title(parent)}Code`] : [])]
    : type === "employee"
      ? ["IDNumber", "FirstName", "LastName", "DepartmentCode"]
      : [
          "IDNumber",
          "FirstName",
          "LastName",
          "ProgramCode",
          "YearLevel",
          "Birthday",
          "Gender",
        ];
  const templateColumns =
    type === "student"
      ? [
          "IDNumber",
          "FirstName",
          "MiddleName",
          "LastName",
          "ProgramCode",
          "YearLevel",
          "Birthday",
          "InstitutionalEmail",
          "Gender",
        ]
      : required;
  const studentYearLevels = [
    ...Array.from({ length: 12 }, (_, index) => `Grade ${index + 1}`),
    "1st Year",
    "2nd Year",
    "3rd Year",
    "4th Year",
    "5th Year",
  ];
  let pending = { created: [], updated: [], errors: [] };

  const addDialog = $("#dialog"),
    form = $("#form"),
    actions = form && $(".modal-actions", form);
  if (!addDialog || !actions) return;
  const choice = document.createElement("div");
  choice.className = "satp-import-action";
  choice.innerHTML = `<button type="button" class="satp-import-link" id="openImport"><span class="material-symbols-rounded" aria-hidden="true">upload_file</span> Import multiple</button>`;
  actions.prepend(choice);

  document.body.insertAdjacentHTML(
    "beforeend",
    `
    <dialog id="importDialog" class="w-[min(760px,calc(100vw-2rem))] max-w-3xl rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-emerald-950/50"><form id="importForm" class="p-6">
      <div class="mb-5 flex items-start justify-between gap-4"><div><span class="text-xs font-bold tracking-[.16em] text-emerald-700">BULK OPERATION</span><h2 class="mt-1 text-2xl font-bold text-slate-900">Import ${plural}</h2></div><button type="button" class="material-symbols-rounded grid h-9 w-9 place-items-center rounded-full text-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-900" data-close aria-label="Close">close</button></div>
      <label class="block cursor-pointer rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 px-5 py-9 text-center transition hover:border-emerald-600 hover:bg-emerald-50" id="importDrop"><strong id="importFileText" class="block text-sm font-semibold text-slate-800">Click to upload or drag an Excel file here</strong><small class="mt-1.5 block text-xs text-slate-500">.xlsx or .xls, up to 5 MB</small><input class="hidden" id="importFile" type="file" accept=".xlsx,.xls" /></label>
      <div class="mt-4 flex flex-col-reverse justify-between gap-3 sm:flex-row"><button type="button" class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" id="templateBtn">Download template</button><button type="submit" class="rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900">Validate file</button></div>
      <p class="mt-3 min-h-5 text-sm font-medium text-red-700" id="importError"></p>
    </form></dialog>
    <dialog id="previewDialog" class="w-[min(760px,calc(100vw-2rem))] max-w-3xl rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-emerald-950/50"><div class="p-6">
      <div class="mb-4 flex items-start justify-between gap-4"><div><span class="text-xs font-bold tracking-[.16em] text-emerald-700">VALIDATION COMPLETE</span><h2 class="mt-1 text-2xl font-bold text-slate-900">Review ${type} import</h2></div><button type="button" class="material-symbols-rounded grid h-9 w-9 place-items-center rounded-full text-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-900" data-close aria-label="Close">close</button></div>
      <div class="my-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><div class="rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-900"><strong id="createCount" class="block text-2xl">0</strong>New</div><div class="rounded-xl bg-blue-50 p-3 text-center text-sm text-blue-900"><strong id="updateCount" class="block text-2xl">0</strong>Updates</div><div class="rounded-xl bg-red-50 p-3 text-center text-sm text-red-800"><strong id="errorCount" class="block text-2xl">0</strong>Errors</div></div>
      <div class="max-h-[330px] overflow-auto rounded-xl border border-slate-200"><table class="w-full text-left text-xs"><thead class="sticky top-0 bg-slate-50 text-slate-600"><tr><th class="px-3 py-2.5">ROW</th><th class="px-3 py-2.5">RECORD</th><th class="px-3 py-2.5">RESULT</th></tr></thead><tbody id="previewBody" class="divide-y divide-slate-100"></tbody></table></div>
      <p id="importProgress" class="mt-3 min-h-5 text-sm font-medium text-emerald-800"></p><div class="mt-5 flex justify-end gap-3"><button type="button" class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" data-close>Cancel</button><button type="button" class="rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50" id="runImport">Run import</button></div>
    </div></dialog>`,
  );

  // Normalize the generated dialogs to the same SATP modal composition used
  // throughout maintenance, independent of Tailwind/CDN load timing.
  const importDialog = $("#importDialog");
  importDialog.className = "satp-modal satp-import-modal";
  $("#importForm").innerHTML = `
    <div class="modal-head"><div><span class="modal-kicker">BULK ACTION</span><h2>Import ${plural}</h2></div><button type="button" class="close-button" data-close aria-label="Close">×</button></div>
    <div class="satp-modal-body"><label class="satp-file-drop" id="importDrop"><span class="satp-upload-icon material-symbols-rounded" aria-hidden="true">upload_file</span><strong id="importFileText" data-empty-text="Choose an Excel file">Choose an Excel file</strong><small>Template columns: ${templateColumns.join(", ")}${type === "student" ? ". Optional values: MiddleName, InstitutionalEmail" : ""}</small><input id="importFile" type="file" accept=".xlsx,.xls"></label><p class="satp-template-copy">Need the format? <button type="button" id="templateBtn">Download template</button></p><p class="form-error" id="importError"></p></div>
    <div class="modal-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button type="submit" class="primary-button">Validate file</button></div>`;
  const previewDialog = $("#previewDialog");
  previewDialog.className = "satp-modal satp-review-modal";
  previewDialog.firstElementChild.innerHTML = `
    <div class="modal-head"><div><span class="modal-kicker">VALIDATION COMPLETE</span><h2>Review ${type} import</h2></div><button type="button" class="close-button" data-close aria-label="Close">×</button></div>
    <p class="satp-review-intro">Review all detected rows before updating records.</p><div class="satp-review-body" id="previewGroups"></div>
    <p id="importProgress" class="satp-import-progress"></p><div class="modal-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button type="button" class="primary-button" id="runImport">Run import</button></div>`;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<dialog id="progressDialog" class="satp-modal satp-progress-modal">
      <div>
        <div class="modal-head"><div><span class="modal-kicker">IMPORT IN PROGRESS</span><h2>Importing ${plural}</h2></div></div>
        <div class="satp-progress-body">
          <span class="satp-progress-icon material-symbols-rounded" aria-hidden="true">upload_file</span>
          <strong id="progressHeading">Preparing import...</strong>
          <p id="progressDetail">Please keep this page open until all records are processed.</p>
          <div class="satp-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progressTrack"><span id="progressFill"></span></div>
          <div class="satp-progress-count"><span id="progressProcessed">0 processed</span><b id="progressPercent">0%</b></div>
        </div>
      </div>
    </dialog>
    ${
      type === "student"
        ? `<dialog id="deactivateMissingDialog" class="satp-modal">
      <div>
        <div class="modal-head"><div><span class="modal-kicker">STUDENT STATUS</span><h2>Deactivate missing students?</h2></div><button type="button" class="close-button" id="deactivateMissingClose" aria-label="Close">Ã—</button></div>
        <div class="satp-modal-body"><p>Would you like to deactivate active students who are not included in this import file?</p><p class="satp-review-intro">Students in the file will still be imported whichever option you choose.</p></div>
        <div class="modal-actions"><button type="button" class="secondary-button" id="importWithoutDeactivation">Import only</button><button type="button" class="primary-button" id="importWithDeactivation">Import and deactivate missing</button></div>
      </div>
    </dialog>`
        : ""
    }`,
  );

  const fileInput = $("#importFile"),
    drop = $("#importDrop");
  $("#openImport").onclick = () => {
    addDialog.close();
    $("#importDialog").showModal();
  };
  document
    .querySelectorAll("[data-close]")
    .forEach(
      (button) => (button.onclick = () => button.closest("dialog").close()),
    );
  fileInput.onchange = () =>
    ($("#importFileText").textContent = fileInput.files[0]
      ? `Selected: ${fileInput.files[0].name}`
      : "Click to upload or drag an Excel file here");
  ["dragenter", "dragover"].forEach((name) =>
    drop.addEventListener(name, (e) => {
      e.preventDefault();
      drop.classList.add("border-emerald-700", "bg-emerald-100");
    }),
  );
  ["dragleave", "drop"].forEach((name) =>
    drop.addEventListener(name, (e) => {
      e.preventDefault();
      drop.classList.remove("border-emerald-700", "bg-emerald-100");
    }),
  );
  drop.addEventListener("drop", (e) => {
    fileInput.files = e.dataTransfer.files;
    fileInput.onchange();
  });

  function title(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function chooseStudentDeactivation() {
    if (type !== "student") return Promise.resolve(false);
    const dialog = $("#deactivateMissingDialog");
    return new Promise((resolve) => {
      let settled = false;
      const finish = (choice) => {
        if (settled) return;
        settled = true;
        dialog.close();
        resolve(choice);
      };
      $("#importWithoutDeactivation").onclick = () => finish(false);
      $("#importWithDeactivation").onclick = () => finish(true);
      $("#deactivateMissingClose").onclick = () => finish(false);
      dialog.oncancel = (event) => {
        event.preventDefault();
        finish(false);
      };
      dialog.showModal();
    });
  }
  function norm(value) {
    return String(value ?? "").trim();
  }
  function headerKey(value) {
    return norm(value)
      .replace(/^\uFEFF/, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  }
  function cell(row, name) {
    const expected = headerKey(name);
    const key = Object.keys(row).find(
      (column) => headerKey(column) === expected,
    );
    return norm(key ? row[key] : "");
  }
  function normalizeBirthday(value) {
    const input = norm(value);
    const slashDate = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (slashDate) {
      const [, month, day, sourceYear] = slashDate;
      const year =
        sourceYear.length === 2
          ? String(
              Number(sourceYear) >= 50
                ? 1900 + Number(sourceYear)
                : 2000 + Number(sourceYear),
            )
          : sourceYear;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return input;
  }
  function loadXlsx() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve();
      const s = document.createElement("script");
      s.src = "/vendor/xlsx/xlsx.full.min.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load the Excel reader."));
      document.head.append(s);
    });
  }
  function api(url, options) {
    return TapTrack.api(url, options);
  }
  function recordLabel(item) {
    return item.idNumber || item.code || item.name || "Unnamed record";
  }

  $("#templateBtn").onclick = async () => {
    await loadXlsx();
    const example = Object.fromEntries(
      templateColumns.map((h) => [
        h,
        {
          Name: `Sample ${title(type)}`,
          Code: "SAMPLE",
          IDNumber: "2026-0001",
          FirstName: "Juan",
          MiddleName: "Santos",
          LastName: "Dela Cruz",
          DepartmentCode: "MIS",
          ProgramCode: "BSIT",
          YearLevel: "1st Year",
          Birthday: "2000-01-01",
          InstitutionalEmail: "juan@example.edu",
          Gender: "Male",
        }[h] || "PARENT",
      ]),
    );
    const ws = XLSX.utils.json_to_sheet([example], {
      header: templateColumns,
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title(plural));
    XLSX.writeFile(wb, `${type}_import_template.xlsx`);
  };

  $("#importForm").onsubmit = async (event) => {
    event.preventDefault();
    const error = $("#importError");
    error.textContent = "";
    try {
      const file = fileInput.files[0];
      if (!file) throw new Error("Choose an Excel file first.");
      if (!/\.(xlsx|xls)$/i.test(file.name))
        throw new Error("Only .xlsx and .xls files are accepted.");
      if (file.size > 5 * 1024 * 1024)
        throw new Error("The file must be 5 MB or smaller.");
      await loadXlsx();
      const bytes = await file.arrayBuffer();
      const wb = XLSX.read(bytes, { type: "array", cellDates: true });
      if (!wb.SheetNames.length)
        throw new Error("The workbook has no worksheets.");
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        defval: "",
        raw: false,
      });
      if (!rows.length)
        throw new Error("The first worksheet contains no data rows.");
      const headers = Object.keys(rows[0]);
      const availableHeaders = new Set(headers.map(headerKey));
      const missing = templateColumns.filter(
        (header) => !availableHeaders.has(headerKey(header)),
      );
      if (missing.length)
        throw new Error(`Missing template columns: ${missing.join(", ")}.`);
      const [existing, parents] = await Promise.all([
        api(`/api/${type}`),
        parent
          ? api(`/api/${parent}`)
          : type === "student"
            ? api("/api/program-options")
            : type === "employee"
              ? api("/api/employee_department")
              : Promise.resolve([]),
      ]);
      pending = classify(rows, existing, parents);
      renderPreview();
      $("#importDialog").close();
      $("#previewDialog").showModal();
    } catch (e) {
      error.textContent = e.message || "The file could not be validated.";
    }
  };

  function classify(rows, existing, parents) {
    const result = { created: [], updated: [], errors: [], fileIdNumbers: [] },
      seen = new Set();
    const existingByKey = new Map(
      existing.map((r) => [
        `${norm(r.idNumber || r.code).toUpperCase()}${academic && parent ? `|${r.parentId}` : ""}`,
        r,
      ]),
    );
    const parentByCode = new Map(
      parents
        .filter((r) => r.isActive)
        .map((r) => [norm(r.code).toUpperCase(), r]),
    );
    rows.forEach((row, index) => {
      const item = { row: index + 2, original: row };
      if (type === "student") {
        const sourceId = cell(row, "IDNumber").toUpperCase();
        if (sourceId) result.fileIdNumbers.push(sourceId);
      }
      if (academic)
        Object.assign(item, {
          firstName: cell(row, "FirstName"),
          middleName: cell(row, "MiddleName"),
          lastName: cell(row, "LastName"),
          code: cell(row, "Code").toUpperCase(),
        });
      else if (type === "employee")
        Object.assign(item, {
          idNumber: cell(row, "IDNumber").toUpperCase(),
          firstName: cell(row, "FirstName"),
          middleName: cell(row, "MiddleName"),
          lastName: cell(row, "LastName"),
          departmentCode: cell(row, "DepartmentCode").toUpperCase(),
          contact: cell(row, "Contact"),
        });
      else
        Object.assign(item, {
          idNumber: cell(row, "IDNumber").toUpperCase(),
          firstName: cell(row, "FirstName"),
          middleName: cell(row, "MiddleName"),
          lastName: cell(row, "LastName"),
          programCode: cell(row, "ProgramCode").toUpperCase(),
          yearLevel: cell(row, "YearLevel"),
          birthday: normalizeBirthday(cell(row, "Birthday")),
          institutionalEmail: cell(row, "InstitutionalEmail").toLowerCase(),
          gender: cell(row, "Gender"),
        });
      let key = norm(item.idNumber || item.code).toUpperCase();
      const errors = [];
      required.forEach((h) => {
        if (!cell(row, h)) errors.push(`${h} is required`);
      });
      if (parent) {
        const p = parentByCode.get(
          cell(row, `${title(parent)}Code`).toUpperCase(),
        );
        if (!p) errors.push(`Active ${parent} code was not found`);
        else item.parentId = p.id;
      }
      if (academic && parent) key += `|${item.parentId || "missing"}`;
      if (!norm(item.idNumber || item.code))
        errors.push("Record key is missing");
      else if (seen.has(key)) errors.push("Duplicate key in this file");
      seen.add(key);
      if (type === "student") {
        const normalizedYearLevel = studentYearLevels.find(
          (level) => level.toLowerCase() === item.yearLevel.toLowerCase(),
        );
        if (normalizedYearLevel) item.yearLevel = normalizedYearLevel;
        const p = new Map(
          parents.map((r) => [norm(r.code).toUpperCase(), r]),
        ).get(item.programCode);
        if (!p) errors.push("ProgramCode was not found");
        else {
          item.programId = p.id;
          item.programName = p.name;
        }
        if (
          item.institutionalEmail &&
          !/^\S+@\S+\.\S+$/.test(item.institutionalEmail)
        )
          errors.push("InstitutionalEmail is invalid");
        if (!studentYearLevels.includes(item.yearLevel))
          errors.push(
            "YearLevel must be Grade 1 to Grade 12 or 1st Year to 5th Year",
          );
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(item.birthday) ||
          Number.isNaN(Date.parse(item.birthday))
        )
          errors.push("Birthday must be YYYY-MM-DD or M/D/YYYY");
        if (
          !["Male", "Female", "Other", "Prefer not to say"].includes(
            item.gender,
          )
        )
          errors.push("Gender is invalid");
      }
      if (type === "employee") {
        const department = parentByCode.get(item.departmentCode);
        if (!department) errors.push("Active DepartmentCode was not found");
        else item.departmentId = department.id;
      }
      item.existing = existingByKey.get(key);
      item.errors = errors;
      result[
        errors.length ? "errors" : item.existing ? "updated" : "created"
      ].push(item);
    });
    return result;
  }

  function renderPreview() {
    const groups = [
      ["created", "Created records", pending.created, "Record will be created"],
      [
        "updated",
        "Updated records",
        pending.updated,
        "Existing record will be updated",
      ],
      ["errors", "Errors", pending.errors, ""],
    ];
    $("#previewGroups").innerHTML = groups
      .map(
        ([kind, label, items, fallback]) =>
          `<section class="satp-review-group ${kind}"><header><span class="satp-result-dot"></span><strong>${label}</strong><b>${items.length}</b></header><div>${items.length ? items.map((item) => `<p><small>Row ${item.row}</small><span>${TapTrack.escapeHtml(recordLabel(item))}</span><em>${TapTrack.escapeHtml(item.errors.length ? item.errors.join("; ") : fallback)}</em></p>`).join("") : `<p class="satp-empty">No ${kind} found</p>`}</div></section>`,
      )
      .join("");
    $("#runImport").disabled =
      !pending.created.length && !pending.updated.length;
  }

  $("#runImport").onclick = async () => {
    const deactivateMissing =
      type === "student" &&
      !pending.errors.length &&
      (await chooseStudentDeactivation());
    const items = [
        ...pending.created.map((x) => ({ ...x, method: "POST" })),
        ...pending.updated.map((x) => ({ ...x, method: "PUT" })),
      ],
      failures = [];
    let addedCount = 0,
      updatedCount = 0;
    $("#runImport").disabled = true;
    const progressDialog = $("#progressDialog"),
      progressTrack = $("#progressTrack");
    $("#previewDialog").close();
    $("#progressHeading").textContent = `Importing 0 of ${items.length}`;
    $("#progressDetail").textContent =
      "Please keep this page open until all records are processed.";
    $("#progressProcessed").textContent = `0 of ${items.length} processed`;
    $("#progressPercent").textContent = "0%";
    $("#progressFill").style.width = "0%";
    progressTrack.setAttribute("aria-valuenow", "0");
    progressDialog.showModal();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      $("#progressHeading").textContent =
        `Importing ${i + 1} of ${items.length}`;
      const body = academic
        ? { name: item.name, code: item.code, parentId: item.parentId }
        : type === "employee"
          ? {
              idNumber: item.idNumber,
              firstName: item.firstName,
              middleName: item.middleName,
              lastName: item.lastName,
              departmentId: item.departmentId,
              contact: item.contact,
            }
          : item;
      try {
        await api(
          `/api/${type}${item.method === "PUT" ? `/${item.existing.id}` : ""}`,
          {
            method: item.method,
            headers: type === "student" ? { "X-Bulk-Import": "student" } : {},
            body: JSON.stringify(body),
          },
        );
        if (type === "student" && item.method === "PUT")
          await api(`/api/student/${item.existing.id}/status`, {
            method: "PATCH",
            headers: { "X-Bulk-Import": "student" },
            body: JSON.stringify({ isActive: true }),
          });
        if (type === "student") {
          if (item.method === "POST") addedCount++;
          else updatedCount++;
        }
      } catch (e) {
        failures.push({
          Row: item.row,
          Record: recordLabel(item),
          Error: e.message,
        });
      }
      const processed = i + 1,
        percent = Math.round((processed / items.length) * 100);
      $("#progressProcessed").textContent =
        `${processed} of ${items.length} processed`;
      $("#progressPercent").textContent = `${percent}%`;
      $("#progressFill").style.width = `${percent}%`;
      progressTrack.setAttribute("aria-valuenow", String(percent));
    }
    let resultMessage,
      resultType = "success";
    if (!failures.length && deactivateMissing) {
      const result = await api("/api/student/deactivate-missing", {
        method: "POST",
        headers: { "X-Bulk-Import": "student" },
        body: JSON.stringify({
          idNumbers: [...new Set(pending.fileIdNumbers)],
        }),
      });
      resultMessage = `${items.length} ${plural} imported successfully. ${result.deactivated} missing student${result.deactivated === 1 ? " was" : "s were"} deactivated.`;
    } else if (failures.length) {
      await loadXlsx();
      const ws = XLSX.utils.json_to_sheet(failures);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Import Errors");
      XLSX.writeFile(wb, `${type}_import_errors.xlsx`);
      resultMessage = `${items.length - failures.length} imported; ${failures.length} failed. An error workbook was downloaded.`;
      resultType = "error";
    } else resultMessage = `${items.length} ${plural} imported successfully.`;
    if (type === "student")
      await api("/api/student/import-summary", {
        method: "POST",
        body: JSON.stringify({ added: addedCount, updated: updatedCount }),
      });
    progressDialog.close();
    TapTrack.toastAfterReload(resultMessage, resultType);
    location.reload();
  };
})();
