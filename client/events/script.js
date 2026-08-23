const { $, api, escapeHtml, formatDate, formatTime, emptyRow, init } = TapTrack;
let events = [];
function render() {
  const now = new Date();
  $("#body").innerHTML =
    events
      .map((e) => {
        const status = !e.isActive
          ? "Disabled"
          : now < new Date(e.startsAt)
            ? "Scheduled"
            : now > new Date(e.endsAt)
              ? "Ended"
              : "Live";
        return `<tr><td><strong>${escapeHtml(e.name)}</strong><br><small>${escapeHtml(e.description || "Special event")}</small></td><td><span class="type-pill Employee">${escapeHtml(e.targetAudience || "Both")}</span></td><td>${formatDate(e.startsAt)} ${formatTime(e.startsAt)}<br>to ${formatDate(e.endsAt)} ${formatTime(e.endsAt)}</td><td>${e.maxTimeIns} in · ${e.maxTimeOuts} out</td><td><span class="status-pill ${["Ended", "Disabled"].includes(status) ? "time-out" : ""}">${status}</span></td><td><button class="secondary-button status" data-id="${e.id}">${e.isActive ? "Disable" : "Enable"}</button></td></tr>`;
      })
      .join("") || emptyRow(6, "No special events.");
}
$("#addBtn").addEventListener("click", () => {
  $("#form").reset();
  $("#ins").value = 1;
  $("#outs").value = 1;
  $("#dialog").showModal();
});
document.addEventListener("click", async (event) => {
  if (event.target.matches('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog").close();
    return;
  }
  if (!event.target.classList.contains("status")) return;
  const item = events.find((e) => String(e.id) === event.target.dataset.id);
  await api(`/api/events/${item.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: !item.isActive }),
  });
  item.isActive = !item.isActive;
  render();
});
$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const item = await api("/api/events", {
      method: "POST",
      body: JSON.stringify({
        name: $("#name").value,
        targetAudience: $("#audience").value,
        description: $("#description").value,
        startsAt: $("#start").value,
        endsAt: $("#end").value,
        maxTimeIns: Number($("#ins").value),
        maxTimeOuts: Number($("#outs").value),
      }),
    });
    events.unshift(item);
    render();
    $("#dialog").close();
  } catch (error) {
    $("#error").textContent = error.message;
  }
});
(async () => {
  await init("events");
  events = await api("/api/events");
  render();
})();
