const { $, api, escapeHtml, emptyRow, init } = TapTrack;
let gates = [];

function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  const query = $("#search").value.trim().toLowerCase();
  const showInactive = $("#showInactive").checked;
  const rows = gates.filter(
    (gate) =>
      (showInactive || gate.isActive) &&
      (!query ||
        gate.name.toLowerCase().includes(query) ||
        gate.campus.toLowerCase().includes(query)),
  );
  $("#body").innerHTML =
    rows
      .map(
        (gate) =>
          `<tr><td><strong>${escapeHtml(gate.name)}</strong></td><td>${escapeHtml(gate.campus)}</td><td><span class="status-pill ${gate.isActive ? "" : "time-out"}">${gate.isActive ? "Active" : "Inactive"}</span></td><td><button class="secondary-button edit edit-icon" data-id="${gate.id}" aria-label="Edit ${escapeHtml(gate.name)}" title="Edit"></button></td></tr>`,
      )
      .join("") || emptyRow(4, "No gate records found.");
  TapTrack.initDataTable(table, { order: [[1, "asc"], [0, "asc"]] });
}

function open(gate = null) {
  $("#form").reset();
  $("#recordId").value = gate?.id || "";
  $("#dialog .modal-head h2").textContent = gate ? "Edit gate" : "Add gate";
  $("#isActive").checked = gate ? Boolean(gate.isActive) : true;
  $("#error").textContent = "";
  if (gate) {
    $("#name").value = gate.name;
    $("#campus").value = gate.campus;
    $("#campus").searchableSelectSync?.();
  }
  $("#dialog").showModal();
}

$("#search").addEventListener("input", render);
$("#showInactive").addEventListener("change", render);
$("#addBtn").addEventListener("click", () => open());
document.addEventListener("click", (event) => {
  if (event.target.matches('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog")?.close();
    return;
  }
  const button = event.target.closest(".edit");
  if (!button) return;
  const gate = gates.find((item) => String(item.id) === button.dataset.id);
  if (gate) open(gate);
});

$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const id = $("#recordId").value;
    const gate = await api(id ? `/api/gate/${id}` : "/api/gate", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({
        name: $("#name").value,
        campus: $("#campus").value,
        isActive: $("#isActive").checked,
      }),
    });
    if (id) Object.assign(gates.find((item) => String(item.id) === id), gate);
    else gates.push(gate);
    render();
    $("#dialog").close();
  } catch (error) {
    $("#error").textContent = error.message;
  }
});

(async () => {
  await init("gates");
  gates = await api("/api/gate");
  render();
})();
