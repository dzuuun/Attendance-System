(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const api = (url, options) => TapTrack.api(url, options);
  const dialog = document.createElement("dialog");
  dialog.className = "attendance-system-modal attendance-system-review-modal";

  const close = () => dialog.close();
  const bindCloseButtons = () =>
    dialog
      .querySelectorAll("[data-close]")
      .forEach((button) => button.addEventListener("click", close));

  function renderImportForm() {
    dialog.innerHTML = `<form id="mssqlImportForm">
      <div class="modal-head"><div><span class="modal-kicker">SQL SERVER IMPORT</span><h2>Import enrolled students</h2></div><button type="button" class="close-button" data-close aria-label="Close">×</button></div>
      <div class="attendance-system-modal-body"><p class="attendance-system-review-intro">Preview records from the configured registrar view before synchronizing them with TapTrack.</p><div class="form-grid"><label>School year<input id="mssqlSchoolYear" placeholder="2026-2027" pattern="\\d{4}-\\d{4}" required></label><label>Semester<select id="mssqlSemester" required><option value="">Select semester</option><option value="1">First Semester</option><option value="2">Second Semester</option><option value="3">Summer</option></select></label><label class="full status-toggle-field mssql-photo-choice"><span><strong>Import student photos</strong><small>Also copy available photos from the SQL Server Student table. Leave this off for a faster student-data-only import.</small></span><input id="mssqlImportPhotos" type="checkbox" aria-label="Import student photos"></label></div><div class="mssql-preview-loading" id="mssqlPreviewLoading" hidden role="status" aria-live="polite"><span class="mssql-preview-spinner" aria-hidden="true"></span><div><strong>Preparing student preview</strong><p id="mssqlPreviewLoadingText">Connecting to SQL Server and validating student records. Please keep this window open.</p></div></div><p class="form-error" id="mssqlError"></p></div>
      <div class="modal-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button" id="mssqlPreviewBtn">Preview import</button></div>
    </form>`;
    bindCloseButtons();
    $("#mssqlImportForm", dialog).addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const error = $("#mssqlError", dialog);
      error.textContent = "";
      const button = $("#mssqlPreviewBtn", dialog);
      const loading = $("#mssqlPreviewLoading", dialog);
      const schoolYearInput = $("#mssqlSchoolYear", dialog);
      const semesterInput = $("#mssqlSemester", dialog);
      const importPhotosInput = $("#mssqlImportPhotos", dialog);
      button.disabled = true;
      button.textContent = "Preparing preview…";
      schoolYearInput.disabled = true;
      semesterInput.disabled = true;
      importPhotosInput.disabled = true;
      loading.hidden = false;
      form.setAttribute("aria-busy", "true");
      const slowMessage = setTimeout(() => {
        const message = $("#mssqlPreviewLoadingText", dialog);
        if (message)
          message.textContent =
            "Still working — the registrar returned a large enrollment list and TapTrack is validating it.";
      }, 8000);
      try {
        const schoolYear = schoolYearInput.value.trim();
        const semester = Number(semesterInput.value);
        const query = new URLSearchParams({
          schoolYear,
          semester: String(semester),
          importPhotos: String(importPhotosInput.checked),
        });
        const preview = await api(`/api/student/mssql-import/preview?${query}`);
        clearTimeout(slowMessage);
        renderPreview(preview);
      } catch (requestError) {
        clearTimeout(slowMessage);
        error.textContent = requestError.message;
        button.disabled = false;
        button.textContent = "Preview import";
        schoolYearInput.disabled = false;
        semesterInput.disabled = false;
        importPhotosInput.disabled = false;
        loading.hidden = true;
        form.removeAttribute("aria-busy");
      }
    });
  }

  const recordMarkup = (record) =>
    `<p><small>${TapTrack.escapeHtml(record.idNumber || `Row ${record.row}`)}</small><span>${TapTrack.escapeHtml(record.name || "Unnamed record")}</span><em>${TapTrack.escapeHtml(record.message)}</em></p>`;
  const semesterLabel = (semester) =>
    ({ 1: "First Semester", 2: "Second Semester", 3: "Summer" })[semester] ||
    `Semester ${semester}`;

  function showImportProgress(data) {
    const loadingDialog = $("#studentLoadingDialog");
    const title = $("#studentLoadingTitle");
    const message = $("#studentLoadingMessage");
    const total = Number(data.total || 0).toLocaleString();
    title.textContent = "Importing students from SQL Server";
    message.textContent = data.importPhotos
      ? `Processing ${total} source records and their available profile photos. Please keep this page open.`
      : `Processing ${total} source records. Student photos will not be imported.`;
    loadingDialog.setAttribute("aria-busy", "true");
    if (!loadingDialog.open) loadingDialog.showModal();
    const timers = [
      setTimeout(() => {
        message.textContent =
          "The registrar records are being synchronized. Large imports can take several minutes.";
      }, 10000),
      setTimeout(() => {
        message.textContent = data.importPhotos
          ? "Still working — profile photos are being validated and saved in controlled batches."
          : "Still working — TapTrack is finishing the remaining student records.";
      }, 35000),
      setTimeout(() => {
        message.textContent =
          "The import is still active. Do not refresh or close this page while TapTrack finishes the remaining records.";
      }, 90000),
    ];
    const stop = () => timers.forEach(clearTimeout);
    return {
      stop,
      close() {
        stop();
        loadingDialog.removeAttribute("aria-busy");
        if (loadingDialog.open) loadingDialog.close();
      },
    };
  }

  function groupMarkup(key, label, tone, group) {
    const rows = group.records.length
      ? group.records.map(recordMarkup).join("")
      : '<p class="attendance-system-empty">No rows in this group.</p>';
    return `<section class="attendance-system-review-group mssql-review-group ${tone}">
      <header><span class="attendance-system-result-dot"></span><strong>${label}</strong><b>${group.recordTotal.toLocaleString()}</b></header>
      <div id="mssql-${key}-rows">${rows}${group.hasMore ? `<button type="button" class="secondary-button" data-mssql-group="${key}">Load next 100 rows</button>` : ""}</div>
    </section>`;
  }

  function renderPreview(data) {
    dialog.innerHTML = `<div class="mssql-review-shell">
      <div class="modal-head"><div><span class="modal-kicker">VALIDATION COMPLETE</span><h2>Review student import</h2></div><button type="button" class="close-button" data-close aria-label="Close">×</button></div>
      <p class="attendance-system-review-intro">${TapTrack.escapeHtml(data.period.schoolYear)} · ${semesterLabel(data.period.semester)} · ${data.total.toLocaleString()} source rows · ${data.importPhotos ? "Photos included" : "Photos not included"}</p>
      <div class="attendance-system-review-body">
        ${groupMarkup("new", "New students", "created", data.groups.new)}
        ${groupMarkup("update", "Updates", "updated", data.groups.update)}
        ${groupMarkup("error", "Invalid rows", "errors", data.groups.error)}
      </div>
      <div class="mssql-import-confirmation">
        ${data.deactivate ? `<p class="mssql-deactivation-warning">${data.deactivate.toLocaleString()} active student${data.deactivate === 1 ? " is" : "s are"} absent from this enrollment source.</p><label class="status-toggle-field"><span><strong>Deactivate missing students</strong><small>Leave this off to import students without deactivating any other records.</small></span><input id="mssqlConfirm" type="checkbox"></label>` : '<p class="mssql-no-deactivation">No active students are missing from this enrollment source.</p>'}
        <p class="form-error" id="mssqlError"></p>
      </div>
      <div class="modal-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button type="button" id="mssqlRun" class="primary-button" ${data.new + data.update ? "" : "disabled"}>Import students</button></div>
    </div>`;
    bindCloseButtons();

    $(".attendance-system-review-body", dialog).addEventListener(
      "click",
      async (event) => {
        const button = event.target.closest("[data-mssql-group]");
        if (!button) return;
        const key = button.dataset.mssqlGroup;
        const group = data.groups[key];
        button.disabled = true;
        button.textContent = "Loading…";
        try {
          const query = new URLSearchParams({
            schoolYear: data.period.schoolYear,
            semester: String(data.period.semester),
            offset: String(group.nextOffset),
            importPhotos: String(data.importPhotos),
          });
          const page = await api(`/api/student/mssql-import/preview?${query}`);
          const nextGroup = page.groups[key];
          button.insertAdjacentHTML(
            "beforebegin",
            nextGroup.records.map(recordMarkup).join(""),
          );
          group.nextOffset = nextGroup.nextOffset;
          group.hasMore = nextGroup.hasMore;
          if (group.hasMore) {
            button.disabled = false;
            button.textContent = "Load next 100 rows";
          } else button.remove();
        } catch (requestError) {
          $("#mssqlError", dialog).textContent = requestError.message;
          button.disabled = false;
          button.textContent = "Load next 100 rows";
        }
      },
    );

    $("#mssqlRun", dialog).addEventListener("click", async () => {
      const error = $("#mssqlError", dialog);
      const button = $("#mssqlRun", dialog);
      const reviewShell = $(".mssql-review-shell", dialog);
      button.disabled = true;
      button.textContent = "Importing…";
      reviewShell.setAttribute("aria-busy", "true");
      const progress = showImportProgress(data);
      try {
        const result = await api("/api/student/mssql-import", {
          method: "POST",
          body: JSON.stringify({
            ...data.period,
            importPhotos: data.importPhotos === true,
            confirmDeactivation: Boolean($("#mssqlConfirm", dialog)?.checked),
          }),
        });
        progress.stop();
        $("#studentLoadingTitle").textContent = "Import complete";
        $("#studentLoadingMessage").textContent = result.message;
        TapTrack.toastAfterReload(result.message, "success");
        location.reload();
      } catch (requestError) {
        progress.close();
        reviewShell.removeAttribute("aria-busy");
        error.textContent = requestError.message;
        button.disabled = false;
        button.textContent = "Import students";
      }
    });
  }

  renderImportForm();
  document.body.append(dialog);
  $("#mssqlImportBtn")?.addEventListener("click", () => {
    renderImportForm();
    dialog.showModal();
  });
})();
