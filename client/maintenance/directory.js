const { $, api, escapeHtml, personCell, emptyRow, init } = TapTrack;
const type = document.body.dataset.type,
  lower = type.toLowerCase();
let people = [];
function render() {
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
          `<tr><td>${personCell(p)}</td><td><strong>${escapeHtml(p.idNumber)}</strong></td><td>${escapeHtml(p.groupName)}</td><td>${escapeHtml(p.contact || "—")}</td><td><button class="row-action" data-id="${p.id}" data-name="${escapeHtml(p.name)}">×</button></td></tr>`,
      )
      .join("") || emptyRow(5, `No ${lower}s found.`);
}
$("#search").addEventListener("input", render);
$("#addBtn").addEventListener("click", () => {
  $("#form").reset();
  $("#error").textContent = "";
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
    await api(`/api/${lower}/${event.target.dataset.id}`, { method: "DELETE" });
    people = people.filter((p) => String(p.id) !== event.target.dataset.id);
    render();
  }
});
$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const record = await api(`/api/${lower}`, {
      method: "POST",
      body: JSON.stringify({
        idNumber: $("#idNumber").value,
        name: $("#name").value,
        groupName: $("#group").value,
        contact: $("#contact").value,
      }),
    });
    people.push(record);
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
