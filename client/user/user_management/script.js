const { $, api, escapeHtml, personCell, emptyRow, init } = TapTrack;
let users = [],
  permissions = [],
  currentRole = "";
function roleOptions(selected = "") {
  $("#role").innerHTML =
    '<option value="">Select permission</option>' +
    permissions
      .filter(
        (item) =>
          (item.name !== "Superadmin" || currentRole === "Superadmin") &&
          (item.isActive || String(item.id) === String(selected)),
      )
      .map(
        (item) =>
          `<option value="${item.id}" ${String(item.id) === String(selected) ? "selected" : ""}>${escapeHtml(item.name)}</option>`,
      )
      .join("");
}
function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  $("#body").innerHTML =
    users
      .map((u) => {
        return `<tr><td>${personCell({ name: u.fullName, contact: u.institutionalEmail || u.role })}</td><td><strong>${escapeHtml(u.username)}</strong></td><td>${escapeHtml(u.role)}</td><td><span class="status-pill">${u.isActive ? "Active" : "Inactive"}</span></td><td><button class="secondary-button edit edit-icon" data-id="${u.id}" aria-label="Edit ${escapeHtml(u.fullName)}" title="Edit"></button></td></tr>`;
      })
      .join("") || emptyRow(5, "No users.");
  TapTrack.initDataTable(table);
}
function openUser(user = null) {
  $("#form").reset();
  $("#password").type = "password";
  $("#passwordVisibility").setAttribute("aria-label", "Show password");
  $("#passwordVisibility").setAttribute("aria-pressed", "false");
  $("#passwordVisibility").title = "Show password";
  $("#passwordVisibilityText").textContent = "SHOW";
  $("#recordId").value = user?.id || "";
  $("#dialogTitle").textContent = user ? "Edit user" : "Add user";
  $("#dialogKicker").textContent = user ? "EDIT RECORD" : "NEW RECORD";
  $("#saveBtn").textContent = user ? "Save changes" : "Create";
  $("#passwordLabel").textContent = user
    ? "New password (optional)"
    : "Temporary password";
  $("#password").required = !user;
  $("#statusField").classList.toggle("hidden", !user);
  roleOptions(user?.permissionId);
  if (user) {
    $("#firstName").value = user.firstName || "";
    $("#middleName").value = user.middleName || "";
    $("#lastName").value = user.lastName || "";
    $("#username").value = user.username;
    $("#institutionalEmail").value = user.institutionalEmail || "";
    $("#isActive").checked = Boolean(user.isActive);
  }
  $("#error").textContent = "";
  $("#dialog").showModal();
}
$("#passwordVisibility").addEventListener("click", () => {
  const password = $("#password"),
    show = password.type === "password";
  password.type = show ? "text" : "password";
  $("#passwordVisibility").setAttribute(
    "aria-label",
    show ? "Hide password" : "Show password",
  );
  $("#passwordVisibility").setAttribute("aria-pressed", String(show));
  $("#passwordVisibility").title = show ? "Hide password" : "Show password";
  $("#passwordVisibilityText").textContent = show ? "HIDE" : "SHOW";
});
$("#addBtn").addEventListener("click", () => openUser());
document.addEventListener("click", async (event) => {
  if (event.target.matches('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog").close();
    return;
  }
  if (!event.target.classList.contains("edit")) return;
  const user = users.find((u) => String(u.id) === event.target.dataset.id);
  if (user) openUser(user);
});
$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const id = $("#recordId").value,
      user = await api(id ? `/api/users/${id}` : "/api/users", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          firstName: $("#firstName").value,
          middleName: $("#middleName").value,
          lastName: $("#lastName").value,
          username: $("#username").value,
          institutionalEmail: $("#institutionalEmail").value,
          password: $("#password").value,
          permissionId: $("#role").value,
          isActive: id ? $("#isActive").checked : true,
        }),
      });
    if (id) {
      const existing = users.find((item) => String(item.id) === id);
      Object.assign(existing, user);
    } else users.push(user);
    render();
    $("#dialog").close();
  } catch (error) {
    $("#error").textContent = error.message;
  }
});
(async () => {
  $("#addBtn").disabled = true;
  try {
    const session = await init("users");
    currentRole = session.user.role;
    [users, permissions] = await Promise.all([
      api("/api/users"),
      api("/api/user/permission-options"),
    ]);
    render();
    $("#addBtn").disabled = false;
  } catch (error) {
    $("#body").innerHTML = emptyRow(5, "User management could not be loaded.");
    TapTrack.toast(error.message || "User management could not be loaded.", "error");
  }
})();
