const { $, api, init } = TapTrack;

$("#showPasswords").addEventListener("change", (event) => {
  document
    .querySelectorAll('#changePasswordForm input:not([type="checkbox"])')
    .forEach(
      (input) => (input.type = event.target.checked ? "text" : "password"),
    );
});

$("#changePasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorNode = $("#passwordError");
  const submit = $("#savePassword");
  errorNode.textContent = "";
  if ($("#newPassword").value !== $("#confirmPassword").value) {
    errorNode.textContent = "The new passwords do not match.";
    return;
  }
  submit.disabled = true;
  try {
    await api("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: $("#currentPassword").value,
        newPassword: $("#newPassword").value,
        confirmPassword: $("#confirmPassword").value,
      }),
    });
    window.location.replace(window.taptrackUrl("/login?password_changed=1"));
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

(async () => {
  await init("changePassword");
})();
