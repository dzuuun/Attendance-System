const { $, api, escapeHtml, emptyRow, init } = TapTrack,
  entity = document.body.dataset.entity,
  parentEntity = document.body.dataset.parent || "",
  label = document.body.dataset.label;
let records = [],
  parents = [];
$("#form").insertAdjacentHTML(
  "afterbegin",
  '<input type="hidden" id="recordId">',
);
$("#form .form-grid").insertAdjacentHTML(
  "beforeend",
  '<label class="full status-toggle-field"><span><strong>Active record</strong><small>Available throughout the system</small></span><input id="isActive" type="checkbox" checked></label>',
);
function parentName(row) {
  return row.schoolName || row.collegeName || row.departmentName || "—";
}
function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  const q = $("#search").value.toLowerCase(),
    showInactive = $("#showInactive").checked,
    rows = records.filter(
      (row) =>
        (showInactive || Boolean(row.isActive)) &&
        (row.name.toLowerCase().includes(q) ||
          row.code.toLowerCase().includes(q)),
    );
  $("#body").innerHTML =
    rows
      .map(
        (row) =>
          `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.code)}</td>${parentEntity ? `<td>${escapeHtml(parentName(row))}</td>` : ""}<td><span class="status-pill ${!row.isActive ? "time-out" : ""}">${row.isActive ? "Active" : "Inactive"}</span></td><td><button class="secondary-button edit edit-icon" data-id="${row.id}" aria-label="Edit ${escapeHtml(row.name)}" title="Edit"></button></td></tr>`,
      )
      .join("") ||
    emptyRow(parentEntity ? 5 : 4, `No ${label.toLowerCase()} records.`);
  TapTrack.initDataTable(table);
}
function renderParents() {
  $("#parent").innerHTML =
    `<option value="">Select ${parentEntity}</option>` +
    parents
      .map(
        (row) =>
          `<option value="${row.id}">${escapeHtml(row.code)} · ${escapeHtml(row.name)}</option>`,
      )
      .join("");
}
function open(record = null) {
  $("#form").reset();
  $("#recordId").value = record?.id || "";
  $("#dialog .modal-head h2").textContent = record
    ? `Edit ${entity}`
    : `Add ${entity}`;
  $("#isActive").checked = record ? Boolean(record.isActive) : true;
  $("#error").textContent = "";
  if (parentEntity) renderParents();
  if (record) {
    $("#name").value = record.name;
    $("#code").value = record.code;
    if (parentEntity) $("#parent").value = record.parentId;
  }
  $("#dialog").showModal();
}
$("#search").addEventListener("input", render);
$("#showInactive").addEventListener("change", render);
$("#addBtn").addEventListener("click", () => open());
document.addEventListener("click", (event) => {
  if (event.target.matches('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog").close();
    return;
  }
  if (!event.target.classList.contains("edit")) return;
  const record = records.find(
    (row) => String(row.id) === event.target.dataset.id,
  );
  if (record) open(record);
});
$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const id = $("#recordId").value,
      record = await api(id ? `/api/${entity}/${id}` : `/api/${entity}`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          name: $("#name").value,
          code: $("#code").value,
          parentId: parentEntity ? $("#parent").value : null,
          isActive: $("#isActive").checked,
        }),
      });
    if (parentEntity) {
      const parent = parents.find(
        (row) => String(row.id) === $("#parent").value,
      );
      record[`${parentEntity}Name`] = parent.name;
    }
    record.isActive = $("#isActive").checked;
    if (id)
      Object.assign(
        records.find((row) => String(row.id) === id),
        record,
      );
    else records.push(record);
    render();
    $("#dialog").close();
  } catch (error) {
    $("#error").textContent = error.message;
  }
});
(async () => {
  await init(entity);
  records = await api(`/api/${entity}`);
  if (parentEntity) parents = await api(`/api/${parentEntity}`);
  render();
})();
