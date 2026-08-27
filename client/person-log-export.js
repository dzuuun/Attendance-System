(() => {
  const { api, escapeHtml, formatDate, formatTime, loadXlsx } = TapTrack;
  let selected = null;
  document.body.insertAdjacentHTML("beforeend", `<dialog id="personLogExportDialog" class="satp-modal"><form id="personLogExportForm"><div class="modal-head"><div><span class="modal-kicker">PERSON LOGS</span><h2>Export attendance</h2></div><button type="button" class="close-button" aria-label="Close">×</button></div><div class="form-grid"><div class="full rounded-xl border border-[#d8e3dd] bg-[#f7faf8] p-4"><strong id="personLogExportName" class="block text-sm text-[#183128]"></strong><small id="personLogExportIdentity" class="mt-1 block text-xs text-[#65736c]"></small></div><label class="full">Data to export<select id="personLogSource" required><option value="" disabled selected>Select log type</option><option value="university">University entrance</option><option value="events">Events attended</option><option value="library">Library entrance</option><option value="internet">Internet Section entrance</option></select></label><div class="full form-grid !p-0" id="personLogDateField" hidden><label>Beginning date<input id="personLogDateFrom" type="date"></label><label>Ending date<input id="personLogDateTo" type="date"></label></div></div><p id="personLogExportError" class="form-error"></p><div class="modal-actions"><button type="button" value="cancel" class="secondary-button">Cancel</button><button type="submit" class="primary-button">Export</button></div></form></dialog>`);
  const dialog = document.querySelector("#personLogExportDialog");
  const form = document.querySelector("#personLogExportForm");
  const sourceNames = { university: "University Entrance", events: "Events Attended", library: "Library Entrance", internet: "Internet Section Entrance" };
  const today = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const safeName = (value) => String(value || "person").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  const identity = (person) => [person.idNumber, person.name, person.type, person.course || "", person.department || ""];
  function eventRows(person, records) {
    const grouped = new Map();
    records.forEach((record) => {
      if (!grouped.has(record.eventId)) grouped.set(record.eventId, { name: record.eventName, startsAt: record.startsAt, endsAt: record.endsAt, ins: [], outs: [] });
      grouped.get(record.eventId)[record.action === "Time In" ? "ins" : "outs"].push(record.timestamp);
    });
    const events = [...grouped.values()];
    const maxIns = Math.max(1, ...events.map((event) => event.ins.length));
    const maxOuts = Math.max(1, ...events.map((event) => event.outs.length));
    const headers = ["ID Number","Full Name","Type","Course","Department","Event","Event Start","Event End",...Array.from({length:maxIns},(_,i)=>`Time In ${i+1}`),...Array.from({length:maxOuts},(_,i)=>`Time Out ${i+1}`)];
    const rows = events.map((event) => [...identity(person),event.name,`${formatDate(event.startsAt)} ${formatTime(event.startsAt)}`,`${formatDate(event.endsAt)} ${formatTime(event.endsAt)}`,...Array.from({length:maxIns},(_,i)=>event.ins[i]?`${formatDate(event.ins[i])} ${formatTime(event.ins[i])}`:""),...Array.from({length:maxOuts},(_,i)=>event.outs[i]?`${formatDate(event.outs[i])} ${formatTime(event.outs[i])}`:"")]);
    return { headers, rows };
  }
  function entranceRows(person, records, source) {
    const headers = ["ID Number","Full Name","Type","Course","Department","Log Type","Date","Time","Action"];
    return { headers, rows: records.map((record) => [...identity(person),sourceNames[source],formatDate(record.timestamp),formatTime(record.timestamp),record.action]) };
  }
  async function exportLogs() {
    const source = document.querySelector("#personLogSource").value;
    const dateFrom = document.querySelector("#personLogDateFrom").value, dateTo = document.querySelector("#personLogDateTo").value;
    if (!selected || !source || (source === "university" && (!dateFrom || !dateTo || dateFrom > dateTo))) { document.querySelector("#personLogExportError").textContent = source === "university" ? "Select a valid beginning and ending date." : "Select the data to export."; return; }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = "Preparing…";
    try {
      const dateQuery = source === "university" ? `&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}` : "";
      const payload = await api(`/api/person-logs/${selected.type}/${selected.id}?source=${source}${dateQuery}`);
      await loadXlsx();
      const data = source === "events" ? eventRows(payload.person, payload.records) : entranceRows(payload.person, payload.records, source);
      const sheet = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]);
      sheet["!cols"] = data.headers.map((header) => ({ wch: header === "Full Name" || header === "Event" ? 30 : header === "Course" || header === "Department" ? 24 : 18 }));
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, source === "events" ? "Events Attended" : "Entrance Logs");
      XLSX.writeFile(book, `${safeName(payload.person.name)}_${safeName(sourceNames[source])}${source === "university" ? `_${dateFrom}_to_${dateTo}` : ""}.xlsx`);
      dialog.close(); TapTrack.toast(`${sourceNames[source]} exported for ${payload.person.name}.`, "success");
    } catch (error) { document.querySelector("#personLogExportError").textContent = error.message; }
    finally { submit.disabled = false; submit.textContent = "Export"; }
  }
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".person-log-export");
    if (trigger) {
      selected = { id: trigger.dataset.personId, type: trigger.dataset.personType, name: trigger.dataset.personName, idNumber: trigger.dataset.idNumber };
      form.reset(); document.querySelector("#personLogDateField").hidden = true; document.querySelector("#personLogDateFrom").required = false; document.querySelector("#personLogDateTo").required = false; document.querySelector("#personLogDateFrom").value = today(); document.querySelector("#personLogDateTo").value = today(); document.querySelector("#personLogExportName").textContent = selected.name; document.querySelector("#personLogExportIdentity").textContent = `${selected.idNumber} · ${selected.type === "student" ? "Student" : "Employee"}`; document.querySelector("#personLogExportError").textContent = ""; dialog.showModal(); return;
    }
    if (event.target.closest("#personLogExportDialog .close-button, #personLogExportDialog button[value=cancel]")) { if (dialog.open) dialog.close(); }
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); exportLogs(); });
  document.querySelector("#personLogSource").addEventListener("change", (event) => {
    const university = event.target.value === "university";
    document.querySelector("#personLogDateField").hidden = !university;
    document.querySelector("#personLogDateFrom").required = university;
    document.querySelector("#personLogDateTo").required = university;
    if (university && !document.querySelector("#personLogDateFrom").value) document.querySelector("#personLogDateFrom").value = today();
    if (university && !document.querySelector("#personLogDateTo").value) document.querySelector("#personLogDateTo").value = today();
  });
  dialog.addEventListener("close", () => { form.reset(); selected = null; document.querySelector("#personLogExportError").textContent = ""; });
})();
