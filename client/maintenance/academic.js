const { $, api, escapeHtml, emptyRow, init } = TapTrack,
  entity = document.body.dataset.entity,
  parentEntity = document.body.dataset.parent || "",
  label = document.body.dataset.label;
let records = [],
  parents = [];
function parentName(row) {
  return row.schoolName || row.collegeName || row.departmentName || "—";
}
function render() {
  const q = $("#search").value.toLowerCase(),
    rows = records.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q),
    );
  $("#body").innerHTML =
    rows
      .map(
        (row) =>
          `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.code)}</td>${parentEntity ? `<td>${escapeHtml(parentName(row))}</td>` : ""}<td><span class="status-pill">${row.isActive ? "Active" : "Inactive"}</span></td><td><button class="row-action" data-id="${row.id}" data-name="${escapeHtml(row.name)}">×</button></td></tr>`,
      )
      .join("") ||
    emptyRow(parentEntity ? 5 : 4, `No ${label.toLowerCase()} records.`);
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
$("#search").addEventListener("input", render);
$("#addBtn").addEventListener("click", () => {
  $("#form").reset();
  $("#error").textContent = "";
  if (parentEntity) renderParents();
  $("#dialog").showModal();
});
document.addEventListener("click", async (event) => {
  if (event.target.matches('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog").close();
    return;
  }
  if (!event.target.dataset.id) return;
  if (confirm(`Remove ${event.target.dataset.name}?`)) {
    try {
      await api(`/api/${entity}/${event.target.dataset.id}`, {
        method: "DELETE",
      });
      records = records.filter(
        (row) => String(row.id) !== event.target.dataset.id,
      );
      render();
    } catch (error) {
      alert(error.message);
    }
  }
});
$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const record = await api(`/api/${entity}`, {
      method: "POST",
      body: JSON.stringify({
        name: $("#name").value,
        code: $("#code").value,
        parentId: parentEntity ? $("#parent").value : null,
      }),
    });
    if (parentEntity) {
      const parent = parents.find(
        (row) => String(row.id) === $("#parent").value,
      );
      record[`${parentEntity}Name`] = parent.name;
    }
    records.push(record);
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
