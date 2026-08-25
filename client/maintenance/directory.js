const { $, api, escapeHtml, personCell, emptyRow, init } = TapTrack;
const type = document.body.dataset.type,
  lower = type.toLowerCase();
let people = [];
$("#form").insertAdjacentHTML(
  "afterbegin",
  '<input type="hidden" id="recordId">',
);
$("#form .form-grid").insertAdjacentHTML(
  "beforeend",
  `<label class="full status-toggle-field"><span><strong>Active ${lower}</strong><small>Available throughout the system</small></span><input id="isActive" type="checkbox" checked></label>`,
);
function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  const q = $("#search").value.toLowerCase(),
    rows = people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.idNumber.toLowerCase().includes(q) ||
        p.groupName.toLowerCase().includes(q),
    );
  $("#count").textContent = `${rows.length} records`;
  $("#body").innerHTML =
    rows
      .map(
        (p) =>
          `<tr><td>${personCell(p)}</td><td><strong>${escapeHtml(p.idNumber)}</strong></td><td>${escapeHtml(p.groupName)}</td><td>${escapeHtml(p.contact || "—")}</td><td><span class="status-pill">${p.isActive ? "Active" : "Inactive"}</span></td><td><button class="secondary-button edit edit-icon" data-id="${p.id}" aria-label="Edit ${escapeHtml(p.name)}" title="Edit"></button></td></tr>`,
      )
      .join("") || emptyRow(6, `No ${lower}s found.`);
  TapTrack.initDataTable(table);
}
function open(person = null) {
  $("#form").reset();
  $("#recordId").value = person?.id || "";
  $("#dialog .modal-head h2").textContent = person
    ? `Edit ${lower}`
    : `Add ${lower}`;
  $("#isActive").checked = person ? Boolean(person.isActive) : true;
  if (person) {
    $("#firstName").value = person.firstName || "";
    $("#middleName").value = person.middleName || "";
    $("#lastName").value = person.lastName || "";
    $("#idNumber").value = person.idNumber;
    $("#group").value = person.groupName;
    $("#contact").value = person.contact || "";
  }
  $("#error").textContent = "";
  $("#dialog").showModal();
}
$("#search").addEventListener("input", render);
$("#addBtn").addEventListener("click", () => open());
document.addEventListener("click", (event) => {
  if (event.target.matches('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog").close();
    return;
  }
  if (!event.target.classList.contains("edit")) return;
  const person = people.find(
    (item) => String(item.id) === event.target.dataset.id,
  );
  if (person) open(person);
});
$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const id = $("#recordId").value,
      record = await api(id ? `/api/${lower}/${id}` : `/api/${lower}`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          idNumber: $("#idNumber").value,
          firstName: $("#firstName").value,
          middleName: $("#middleName").value,
          lastName: $("#lastName").value,
          groupName: $("#group").value,
          contact: $("#contact").value,
          isActive: $("#isActive").checked,
        }),
      });
    record.isActive = $("#isActive").checked;
    if (id)
      Object.assign(
        people.find((item) => String(item.id) === id),
        record,
      );
    else people.push(record);
    render();
    $("#dialog").close();
  } catch (error) {
    $("#error").textContent = error.message;
  }
});
(async () => {
  await init(type === "Student" ? "students" : "employees");
  people = await api(`/api/${lower}`);
  render();
})();
