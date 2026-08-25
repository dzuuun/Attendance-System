const { $, api, emptyRow, escapeHtml, init } = TapTrack;
let permissions = [];
function accessSummary(item) {
  return (
    [
      [item.attendanceAccess, "Attendance"],
      [item.specialEventsAccess, "Events"],
      [item.historicalDataAccess, "Historical data"],
      [item.libraryAccess, "Library"],
      [item.maintenanceAccess, "Maintenance"],
      [item.usersAccess, "User & access"],
    ]
      .filter(([enabled]) => enabled)
      .map(([, name]) => name)
      .join(", ") || "No module access"
  );
}
function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  $("#body").innerHTML =
    permissions
      .map(
        (item) =>
          `<tr><td><strong>${escapeHtml(item.name)}</strong><small class="mt-1 block text-xs text-[#65736c]">${escapeHtml(accessSummary(item))} · ${escapeHtml(item.peopleAccess || "Both")}</small></td><td>${escapeHtml(item.description || "—")}</td><td><span class="status-pill">${item.isActive ? "Active" : "Inactive"}</span></td><td><button class="secondary-button edit edit-icon" data-id="${item.id}" aria-label="Edit ${escapeHtml(item.name)}" title="Edit"></button></td></tr>`,
      )
      .join("") || emptyRow(4, "No permissions.");
  TapTrack.initDataTable(table);
}
function open(item = null) {
  $("#form").reset();
  $("#recordId").value = item?.id || "";
  $("#dialogTitle").textContent = item ? "Edit permission" : "Add permission";
  $("#dialog .modal-head .eyebrow").textContent = item
    ? "EDIT ROLE"
    : "NEW ROLE";
  $("#saveBtn").textContent = item ? "Save changes" : "Create permission";
  if (item) {
    $("#name").value = item.name;
    [
      "attendanceAccess",
      "specialEventsAccess",
      "historicalDataAccess",
      "libraryAccess",
      "maintenanceAccess",
      "usersAccess",
      "isActive",
    ].forEach((key) => ($(`#${key}`).checked = Boolean(item[key])));
    $("#peopleAccess").value = item.peopleAccess || "Both";
  }
  $("#error").textContent = "";
  $("#dialog").showModal();
}
$("#addBtn").onclick = () => open();
document.addEventListener("click", (event) => {
  if (event.target.matches('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog").close();
    return;
  }
  if (event.target.classList.contains("edit"))
    open(
      permissions.find((item) => String(item.id) === event.target.dataset.id),
    );
});
$("#form").onsubmit = async (event) => {
  event.preventDefault();
  const id = $("#recordId").value;
  try {
    const saved = await api(
      id ? `/api/permissions/${id}` : "/api/permissions",
      {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          name: $("#name").value,
          description: id
            ? permissions.find((item) => String(item.id) === id)?.description ||
              ""
            : "",
          attendanceAccess: $("#attendanceAccess").checked,
          specialEventsAccess: $("#specialEventsAccess").checked,
          historicalDataAccess: $("#historicalDataAccess").checked,
          libraryAccess: $("#libraryAccess").checked,
          maintenanceAccess: $("#maintenanceAccess").checked,
          usersAccess: $("#usersAccess").checked,
          peopleAccess: $("#peopleAccess").value,
          isActive: $("#isActive").checked,
        }),
      },
    );
    if (id)
      Object.assign(
        permissions.find((item) => String(item.id) === id),
        saved,
      );
    else permissions.push(saved);
    render();
    $("#dialog").close();
  } catch (error) {
    $("#error").textContent = error.message;
  }
};
(async () => {
  await init("permissions");
  permissions = await api("/api/permissions");
  render();
})();
