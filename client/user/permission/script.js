const { $, api, emptyRow, escapeHtml, init } = TapTrack;
let permissions = [];
const maintenanceModuleInputs = () => [
  ...document.querySelectorAll(".maintenance-module"),
];
const accessInputs = () =>
  [
    "overviewAccess",
    "attendanceAccess",
    "specialEventsAccess",
    "libraryAccess",
    "maintenanceAccess",
    "usersAccess",
  ].map((id) => $(`#${id}`));
const selectedMaintenanceModules = () =>
  maintenanceModuleInputs()
    .filter((input) => input.checked)
    .map((input) => input.value);

function syncSelectAllAccess() {
  const selector = $("#selectAllAccess");
  const inputs = [...accessInputs(), ...maintenanceModuleInputs()];
  const selected = inputs.filter((input) => input.checked).length;
  selector.checked = selected === inputs.length;
  selector.indeterminate = selected > 0 && selected < inputs.length;
}

function syncMaintenancePanel({ selectAllWhenEmpty = false } = {}) {
  const master = $("#maintenanceAccess"),
    inputs = maintenanceModuleInputs();
  if (
    master.checked &&
    selectAllWhenEmpty &&
    !inputs.some((input) => input.checked)
  )
    inputs.forEach((input) => (input.checked = true));
  inputs.forEach((input) => (input.disabled = !master.checked));
  $("#selectAllMaintenance").disabled = !master.checked;
  $("#maintenanceModulePanel").classList.toggle("is-disabled", !master.checked);
  const selected = inputs.filter((input) => input.checked).length;
  $("#selectAllMaintenance").checked = selected === inputs.length;
  $("#selectAllMaintenance").indeterminate =
    selected > 0 && selected < inputs.length;
  syncSelectAllAccess();
}

function accessSummary(item) {
  const maintenanceLabel = item.maintenanceAccess
    ? item.maintenanceModules?.length === maintenanceModuleInputs().length
      ? "Maintenance (all)"
      : `Maintenance (${item.maintenanceModules?.length || 0})`
    : "Maintenance";
  return (
    [
      [item.overviewAccess, "Overview"],
      [item.attendanceAccess, "Attendance"],
      [item.specialEventsAccess, "Events"],
      [item.libraryAccess, "Library"],
      [item.maintenanceAccess, maintenanceLabel],
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
          `<tr><td><strong>${escapeHtml(item.name)}</strong><small class="mt-1 block text-xs text-[#65736c]">${escapeHtml(accessSummary(item))}</small></td><td>${escapeHtml(item.description || "—")}</td><td><span class="status-pill">${item.isActive ? "Active" : "Inactive"}</span></td><td><button class="secondary-button edit edit-icon" data-id="${item.id}" aria-label="Edit ${escapeHtml(item.name)}" title="Edit"></button></td></tr>`,
      )
      .join("") || emptyRow(4, "No permissions.");
  TapTrack.initDataTable(table, { order: [[1, "asc"]] });
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
      "overviewAccess",
      "attendanceAccess",
      "specialEventsAccess",
      "libraryAccess",
      "maintenanceAccess",
      "usersAccess",
      "isActive",
    ].forEach((key) => ($(`#${key}`).checked = Boolean(item[key])));
    const selected = new Set(item.maintenanceModules || []);
    maintenanceModuleInputs().forEach(
      (input) => (input.checked = selected.has(input.value)),
    );
  }
  syncMaintenancePanel({
    selectAllWhenEmpty: Boolean(item?.maintenanceAccess),
  });
  $("#error").textContent = "";
  $("#dialog").showModal();
}
$("#addBtn").onclick = () => open();
$("#maintenanceAccess").addEventListener("change", (event) => {
  if (!event.target.checked)
    maintenanceModuleInputs().forEach((input) => (input.checked = false));
  syncMaintenancePanel();
});
$("#selectAllMaintenance").addEventListener("change", (event) => {
  const checked = event.target.checked;
  $("#maintenanceAccess").checked = checked;
  maintenanceModuleInputs().forEach((input) => (input.checked = checked));
  syncMaintenancePanel();
});
maintenanceModuleInputs().forEach((input) =>
  input.addEventListener("change", () => {
    $("#maintenanceAccess").checked = maintenanceModuleInputs().some(
      (candidate) => candidate.checked,
    );
    syncMaintenancePanel();
  }),
);
$("#selectAllAccess").addEventListener("change", (event) => {
  const checked = event.target.checked;
  accessInputs().forEach((input) => (input.checked = checked));
  maintenanceModuleInputs().forEach((input) => (input.checked = checked));
  syncMaintenancePanel();
});
accessInputs()
  .filter((input) => input.id !== "maintenanceAccess")
  .forEach((input) => input.addEventListener("change", syncSelectAllAccess));
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
          overviewAccess: $("#overviewAccess").checked,
          attendanceAccess: $("#attendanceAccess").checked,
          specialEventsAccess: $("#specialEventsAccess").checked,
          libraryAccess: $("#libraryAccess").checked,
          maintenanceAccess: $("#maintenanceAccess").checked,
          maintenanceModules: selectedMaintenanceModules(),
          usersAccess: $("#usersAccess").checked,
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
