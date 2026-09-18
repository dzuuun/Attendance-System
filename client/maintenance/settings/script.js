const { $, api, init } = TapTrack;
$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        school_name: $("#schoolName").value,
      }),
    });
    $("#message").textContent = "Settings saved.";
  } catch (error) {
    $("#message").textContent = error.message;
  }
});
(async () => {
  await init("maintenance");
  const settings = await api("/api/settings");
  $("#schoolName").value = settings.school_name || "TapTrack Academy";
})();
