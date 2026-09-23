const { $, api, escapeHtml, emptyRow, init } = TapTrack;
let sections = [];

function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  const query = $("#search").value.trim().toLowerCase();
  const showInactive = $("#showInactive").checked;
  const rows = sections.filter(
    (section) =>
      (showInactive || section.isActive) &&
      `${section.name} ${section.yearLevel}`.toLowerCase().includes(query),
  );
  $("#body").innerHTML = rows.length
    ? rows
        .map(
          (section) =>
            `<tr><td><strong>${escapeHtml(section.name)}</strong></td><td>${escapeHtml(section.yearLevel)}</td><td><span class="status-pill ${section.isActive ? "" : "time-out"}">${section.isActive ? "Active" : "Inactive"}</span></td><td><button class="secondary-button edit edit-icon" data-id="${section.id}" aria-label="Edit ${escapeHtml(section.name)}" title="Edit"></button></td></tr>`,
        )
        .join("")
    : emptyRow(4, "No section records found.");
  TapTrack.initDataTable(table, {
    order: [
      [1, "asc"],
      [0, "asc"],
    ],
  });
}

function open(section = null) {
  $("#form").reset();
  $("#recordId").value = section?.id || "";
  $("#dialogTitle").textContent = section ? "Edit section" : "Add section";
  $("#name").value = section?.name || "";
  $("#yearLevel").value = section?.yearLevel || "";
  $("#isActive").checked = section ? Boolean(section.isActive) : true;
  $("#error").textContent = "";
  $("#dialog").showModal();
}

$("#search").addEventListener("input", render);
$("#showInactive").addEventListener("change", render);
$("#addBtn").addEventListener("click", () => open());
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-close]")) return $("#dialog").close();
  const edit = event.target.closest(".edit");
  if (edit)
    open(sections.find((section) => String(section.id) === edit.dataset.id));
});
$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#recordId").value;
  try {
    const section = await api(id ? `/api/section/${id}` : "/api/section", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({
        name: $("#name").value,
        yearLevel: $("#yearLevel").value,
        isActive: $("#isActive").checked,
      }),
    });
    if (id)
      Object.assign(
        sections.find((item) => String(item.id) === id),
        section,
      );
    else sections.push(section);
    render();
    $("#dialog").close();
  } catch (error) {
    $("#error").textContent = error.message;
  }
});
(async () => {
  await init("sections");
  sections = await api("/api/section");
  render();
})();
