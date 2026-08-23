const { $, api, personCell, emptyRow, init } = TapTrack;
let users = [];
function render() {
  $("#body").innerHTML =
    users
      .map(
        (u) =>
          `<tr><td>${personCell({ name: u.fullName, contact: u.role })}</td><td><strong>${u.username}</strong></td><td>${u.role}</td><td><span class="status-pill">${u.isActive ? "Active" : "Inactive"}</span></td><td><button class="secondary-button status" data-id="${u.id}">${u.isActive ? "Deactivate" : "Activate"}</button></td></tr>`,
      )
      .join("") || emptyRow(5, "No users.");
}
$("#addBtn").addEventListener("click", () => {
  $("#form").reset();
  $("#dialog").showModal();
});
document.addEventListener("click", async (event) => {
  if (event.target.matches('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog").close();
    return;
  }
  if (!event.target.classList.contains("status")) return;
  const user = users.find((u) => String(u.id) === event.target.dataset.id);
  try {
    await api(`/api/users/${user.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    user.isActive = !user.isActive;
    render();
  } catch (error) {
    alert(error.message);
  }
});
$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const user = await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        fullName: $("#name").value,
        username: $("#username").value,
        password: $("#password").value,
        role: $("#role").value,
      }),
    });
    users.push(user);
    render();
    $("#dialog").close();
  } catch (error) {
    $("#error").textContent = error.message;
  }
});
(async () => {
  await init("users");
  users = await api("/api/users");
  render();
})();
