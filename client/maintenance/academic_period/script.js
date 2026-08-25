const { $, api, escapeHtml, emptyRow, init } = TapTrack;
let periods = [];
function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  $("#body").innerHTML =
    periods
      .map(
        (p) =>
          `<tr><td><strong>${escapeHtml(p.schoolYear)}</strong></td><td>${escapeHtml(p.term)}</td><td><span class="status-pill ${p.isCurrent ? "" : "time-out"}">${p.isCurrent ? "Current" : "Historical"}</span></td><td><button class="secondary-button edit edit-icon" data-id="${p.id}" title="Edit"></button></td></tr>`,
      )
      .join("") || emptyRow(4, "No academic periods.");
  TapTrack.initDataTable(table);
}
function open(p = null) {
  $("#form").reset();
  $("#recordId").value = p?.id || "";
  $("#dialogTitle").textContent = p
    ? "Edit academic period"
    : "Add academic period";
  if (p) {
    $("#schoolYear").value = p.schoolYear;
    $("#term").value = p.term;
    $("#isCurrent").checked = Boolean(p.isCurrent);
  }
  $("#error").textContent = "";
  $("#dialog").showModal();
}
$("#addBtn").onclick = () => open();
document.addEventListener("click", (e) => {
  if (e.target.matches('.close-button,button[value="cancel"]')) {
    e.preventDefault();
    e.target.closest("dialog").close();
    return;
  }
  if (e.target.classList.contains("edit"))
    open(periods.find((p) => String(p.id) === e.target.dataset.id));
});
$("#form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const id = $("#recordId").value,
      saved = await api(
        id ? `/api/academic-periods/${id}` : "/api/academic-periods",
        {
          method: id ? "PUT" : "POST",
          body: JSON.stringify({
            schoolYear: $("#schoolYear").value,
            term: $("#term").value,
            isCurrent: $("#isCurrent").checked,
          }),
        },
      );
    periods = await api("/api/academic-periods");
    render();
    $("#dialog").close();
  } catch (error) {
    $("#error").textContent = error.message;
  }
};
(async () => {
  await init("periods");
  periods = await api("/api/academic-periods");
  render();
})();
