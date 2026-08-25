const { $, api, escapeHtml, formatDate, formatTime, emptyRow, loadXlsx, init } =
  TapTrack;
let events = [];
let actionPopup = null;
let actionTrigger = null;
function closeActionPopup() {
  if (actionTrigger) actionTrigger.setAttribute("aria-expanded", "false");
  actionPopup?.remove();
  actionPopup = null;
  actionTrigger = null;
}
function openActionPopup(trigger) {
  closeActionPopup();
  const id = trigger.dataset.id;
  const active = trigger.dataset.active === "1";
  const popup = document.createElement("div");
  popup.className = "event-action-options event-action-popup";
  popup.innerHTML = `<a href="/events/${id}/scan">Scan attendance</a><button class="export-event" data-id="${id}">Export</button><button class="edit-event" data-id="${id}">Edit</button><button class="status" data-id="${id}">${active ? "Disable" : "Enable"}</button>`;
  document.body.appendChild(popup);
  const rect = trigger.getBoundingClientRect();
  const width = 172;
  const height = popup.offsetHeight;
  popup.style.left = `${Math.max(8, Math.min(rect.right - width, innerWidth - width - 8))}px`;
  popup.style.top = `${rect.bottom + height + 8 <= innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - height - 6)}px`;
  trigger.setAttribute("aria-expanded", "true");
  actionPopup = popup;
  actionTrigger = trigger;
}
const excelTime = (value) => `${formatDate(value)} ${formatTime(value)}`;
const localDateTime = (value) => {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
function syncTimeOutField() {
  const enabled = $("#recordTimeOut").checked;
  $("#outs").disabled = !enabled;
  $("#outsField").style.opacity = enabled ? "1" : ".45";
  if (enabled && Number($("#outs").value) < 1) $("#outs").value = 1;
}
function openEvent(item = null) {
  $("#form").reset();
  $("#recordId").value = item?.id || "";
  $("#dialogTitle").textContent = item ? "Edit event" : "Create event";
  $("#saveEvent").textContent = item ? "Save changes" : "Create";
  $("#name").value = item?.name || "";
  $("#audience").value = item?.targetAudience || "";
  $("#description").value = item?.description || "";
  $("#start").value = item ? localDateTime(item.startsAt) : "";
  $("#end").value = item ? localDateTime(item.endsAt) : "";
  $("#ins").value = Number(item?.maxTimeIns || 1);
  const recordsTimeOut = !item || Number(item.maxTimeOuts) > 0;
  $("#recordTimeOut").checked = recordsTimeOut;
  $("#outs").value = recordsTimeOut ? Number(item?.maxTimeOuts || 1) : 1;
  $("#error").textContent = "";
  syncTimeOutField();
  $("#dialog").showModal();
}
async function exportEvent(item) {
  const [scans] = await Promise.all([
    api(`/api/events/${item.id}/scans`),
    loadXlsx(),
  ]);
  const attendees = new Map();
  scans.forEach((scan) => {
    const key = `${scan.type}-${scan.personId}`;
    if (!attendees.has(key))
      attendees.set(key, {
        idNumber: scan.idNumber,
        name: scan.name,
        type: scan.type,
        course: scan.course || "",
        department: scan.department || "",
        ins: [],
        outs: [],
      });
    attendees
      .get(key)
      [scan.action === "Time In" ? "ins" : "outs"].push(scan.timestamp);
  });
  const headers = ["ID Number", "Full Name", "Type", "Course", "Department"];
  for (let index = 1; index <= Number(item.maxTimeIns); index += 1)
    headers.push(`Time In ${index}`);
  for (let index = 1; index <= Number(item.maxTimeOuts); index += 1)
    headers.push(`Time Out ${index}`);
  const rows = [...attendees.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((attendee) => {
      const row = {
        "ID Number": attendee.idNumber,
        "Full Name": attendee.name,
        Type: attendee.type,
        Course: attendee.course,
        Department: attendee.department,
      };
      attendee.ins.sort((a, b) => new Date(a) - new Date(b));
      attendee.outs.sort((a, b) => new Date(a) - new Date(b));
      for (let index = 1; index <= Number(item.maxTimeIns); index += 1)
        row[`Time In ${index}`] = attendee.ins[index - 1]
          ? excelTime(attendee.ins[index - 1])
          : "";
      for (let index = 1; index <= Number(item.maxTimeOuts); index += 1)
        row[`Time Out ${index}`] = attendee.outs[index - 1]
          ? excelTime(attendee.outs[index - 1])
          : "";
      return row;
    });
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  sheet["!cols"] = headers.map((header) => ({
    wch:
      header === "Full Name"
        ? 28
        : header === "Course" || header === "Department"
          ? 24
          : 20,
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Attendance");
  const filename =
    item.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") ||
    `event_${item.id}`;
  XLSX.writeFile(workbook, `${filename}_attendance.xlsx`);
}
function render() {
  const table = $("#body").closest("table");
  TapTrack.destroyDataTable(table);
  const now = new Date();
  $("#body").innerHTML =
    events
      .map((event) => {
        const status = !event.isActive
          ? "Disabled"
          : now < new Date(event.startsAt)
            ? "Scheduled"
            : now > new Date(event.endsAt)
              ? "Ended"
              : "Live";
        const limits =
          Number(event.maxTimeOuts) === 0
            ? `${event.maxTimeIns} Time In · No Time Out`
            : `${event.maxTimeIns} in · ${event.maxTimeOuts} out`;
        return `<tr><td><strong>${escapeHtml(event.name)}</strong><br><small>${escapeHtml(event.description || "Special event")}</small></td><td><span class="type-pill Employee">${escapeHtml(event.targetAudience || "Both")}</span></td><td>${formatDate(event.startsAt)} ${formatTime(event.startsAt)}<br>to ${formatDate(event.endsAt)} ${formatTime(event.endsAt)}</td><td>${limits}</td><td><span class="status-pill ${["Ended", "Disabled"].includes(status) ? "time-out" : ""}">${status}</span></td><td><button class="event-action-trigger" data-id="${event.id}" data-active="${event.isActive ? "1" : "0"}" aria-expanded="false">Actions <span aria-hidden="true">⌄</span></button></td></tr>`;
      })
      .join("") || emptyRow(6, "No Events.");
  TapTrack.initDataTable(table);
}
$("#addBtn").addEventListener("click", () => openEvent());
$("#recordTimeOut").addEventListener("change", syncTimeOutField);
document.addEventListener("click", async (event) => {
  const trigger = event.target.closest(".event-action-trigger");
  if (trigger) {
    if (trigger === actionTrigger) closeActionPopup();
    else openActionPopup(trigger);
    return;
  }
  if (actionPopup && !actionPopup.contains(event.target)) closeActionPopup();
  else if (
    event.target.closest(
      ".event-action-options a, .event-action-options button",
    )
  )
    closeActionPopup();
  if (event.target.matches('.close-button,button[value="cancel"]')) {
    event.preventDefault();
    event.target.closest("dialog").close();
    return;
  }
  if (event.target.classList.contains("export-event")) {
    const item = events.find(
      (entry) => String(entry.id) === event.target.dataset.id,
    );
    event.target.disabled = true;
    try {
      await exportEvent(item);
    } catch (error) {
      TapTrack.toast(error.message, "error");
    } finally {
      event.target.disabled = false;
    }
    return;
  }
  if (event.target.classList.contains("edit-event")) {
    const item = events.find(
      (entry) => String(entry.id) === event.target.dataset.id,
    );
    openEvent(item);
    return;
  }
  if (!event.target.classList.contains("status")) return;
  const item = events.find(
    (entry) => String(entry.id) === event.target.dataset.id,
  );
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
    const recordId = $("#recordId").value;
    const item = await api(
      recordId ? `/api/events/${recordId}` : "/api/events",
      {
        method: recordId ? "PUT" : "POST",
        body: JSON.stringify({
          name: $("#name").value,
          targetAudience: $("#audience").value,
          description: $("#description").value,
          startsAt: $("#start").value,
          endsAt: $("#end").value,
          maxTimeIns: Number($("#ins").value),
          maxTimeOuts: $("#recordTimeOut").checked
            ? Number($("#outs").value)
            : 0,
        }),
      },
    );
    if (recordId) {
      const index = events.findIndex((entry) => String(entry.id) === recordId);
      events[index] = item;
    } else events.unshift(item);
    render();
    $("#dialog").close();
    TapTrack.toast(recordId ? "Event updated." : "Event created.", "success");
  } catch (error) {
    $("#error").textContent = error.message;
  }
});
(async () => {
  const { user } = await init("events");
  if (user.role !== "Superadmin" && user.peopleAccess !== "Both") {
    const unavailable =
      user.peopleAccess === "Students" ? "Employees" : "Students";
    $(`#audience option[value="${unavailable}"]`)?.remove();
  }
  events = await api("/api/events");
  render();
})();
