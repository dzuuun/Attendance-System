(() => {
  const { api, escapeHtml, formatDate, formatTime, loadXlsx } = TapTrack;
  let selected, periods;
  document.body.insertAdjacentHTML("beforeend", `<dialog id="personLogExportDialog" class="satp-modal"><form id="personLogExportForm"><div class="modal-head"><div><span class="modal-kicker">PERSON LOGS</span><h2>Export attendance</h2></div><button type="button" class="close-button" aria-label="Close">×</button></div><div class="form-grid"><div class="full rounded-xl border border-[#d8e3dd] bg-[#f7faf8] p-4"><strong id="personLogExportName" class="block text-sm text-[#183128]"></strong><small id="personLogExportIdentity" class="mt-1 block text-xs text-[#65736c]"></small></div><label class="full">Academic period<select id="personLogAcademicPeriod" required><option value="">Select academic period</option></select></label><label class="full">Data to export<select id="personLogSource" required><option value="" disabled selected>Select log type</option><option value="university">University entrance</option><option value="events">Events attended</option><option value="library">Library entrance</option><option value="internet">Internet Section entrance</option></select></label><div class="full form-grid !p-0" id="personLogDateField" hidden><label>Beginning date<input id="personLogDateFrom" type="date"></label><label>Ending date<input id="personLogDateTo" type="date"></label></div></div><p id="personLogExportError" class="form-error"></p><div class="modal-actions"><button type="button" value="cancel" class="secondary-button">Cancel</button><button type="submit" class="primary-button">Export</button></div></form></dialog>`);
  const dialog = document.querySelector("#personLogExportDialog"), form = document.querySelector("#personLogExportForm"), period = document.querySelector("#personLogAcademicPeriod");
  const names = { university: "University Entrance", events: "Events Attended", library: "Library Entrance", internet: "Internet Section Entrance" };
  TapTrack.enhanceSearchableSelect(period);
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const safe = (v) => String(v || "person").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  const identity = (p) => [p.idNumber,p.name,p.type,p.course || "",p.department || ""];
  async function loadPeriods() {
    periods ||= await api("/api/academic-periods");
    period.innerHTML = '<option value="">Select academic period</option>' + periods.map((p) => `<option value="${p.id}">${escapeHtml(p.schoolYear)} · ${escapeHtml(p.term)}${p.isCurrent ? " (Current)" : ""}</option>`).join("");
    period.value = String(periods.find((p) => p.isCurrent)?.id || periods[0]?.id || "");
    period.searchableSelectSync?.();
  }
  function eventData(person, records) {
    const grouped = new Map();
    records.forEach((r) => { if (!grouped.has(r.eventId)) grouped.set(r.eventId,{...r,ins:[],outs:[]}); grouped.get(r.eventId)[r.action === "Time In" ? "ins" : "outs"].push(r.timestamp); });
    const events=[...grouped.values()], ni=Math.max(1,...events.map(e=>e.ins.length)), no=Math.max(1,...events.map(e=>e.outs.length));
    const headers=["ID Number","Full Name","Type","Course","Department","Event","Event Start","Event End",...Array.from({length:ni},(_,i)=>`Time In ${i+1}`),...Array.from({length:no},(_,i)=>`Time Out ${i+1}`)];
    return {headers,rows:events.map(e=>[...identity(person),e.eventName,`${formatDate(e.startsAt)} ${formatTime(e.startsAt)}`,`${formatDate(e.endsAt)} ${formatTime(e.endsAt)}`,...Array.from({length:ni},(_,i)=>e.ins[i]?`${formatDate(e.ins[i])} ${formatTime(e.ins[i])}`:""),...Array.from({length:no},(_,i)=>e.outs[i]?`${formatDate(e.outs[i])} ${formatTime(e.outs[i])}`:"")])};
  }
  function entranceData(person, records, source) {
    return {headers:["ID Number","Full Name","Type","Course","Department","Log Type","Date","Time","Action"],rows:records.map(r=>[...identity(person),names[source],formatDate(r.timestamp),formatTime(r.timestamp),r.action])};
  }
  async function exportLogs() {
    const source=document.querySelector("#personLogSource").value, periodId=period.value, from=document.querySelector("#personLogDateFrom").value, to=document.querySelector("#personLogDateTo").value;
    const badDates=source==="university"&&(!from||!to||from>to), error=document.querySelector("#personLogExportError");
    if(!selected||!periodId||!source||badDates){error.textContent=badDates?"Select a valid beginning and ending date.":"Select an academic period and the data to export.";return;}
    const submit=form.querySelector('button[type="submit"]'); submit.disabled=true; submit.textContent="Preparing…";
    try {
      const dates=source==="university"?`&dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`:"";
      const payload=await api(`/api/person-logs/${selected.type}/${selected.id}?source=${source}&academicPeriodId=${encodeURIComponent(periodId)}${dates}`);
      await loadXlsx();
      const data=source==="events"?eventData(payload.person,payload.records):entranceData(payload.person,payload.records,source);
      const sheet=XLSX.utils.aoa_to_sheet([data.headers,...data.rows]); sheet["!cols"]=data.headers.map(h=>({wch:h==="Full Name"||h==="Event"?30:h==="Course"||h==="Department"?24:18}));
      const book=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,sheet,source==="events"?"Events Attended":"Entrance Logs");
      XLSX.writeFile(book,`${safe(payload.person.name)}_${safe(payload.academicPeriod.schoolYear+"_"+payload.academicPeriod.term)}_${safe(names[source])}${source==="university"?`_${from}_to_${to}`:""}.xlsx`);
      dialog.close(); TapTrack.toast(`${names[source]} exported for ${payload.person.name}.`,"success");
    } catch(e){error.textContent=e.message;} finally{submit.disabled=false;submit.textContent="Export";}
  }
  document.addEventListener("click", async (event) => {
    const trigger=event.target.closest(".person-log-export");
    if(trigger){
      selected={id:trigger.dataset.personId,type:trigger.dataset.personType,name:trigger.dataset.personName,idNumber:trigger.dataset.idNumber}; form.reset();
      document.querySelector("#personLogDateField").hidden=true; document.querySelector("#personLogDateFrom").required=false; document.querySelector("#personLogDateTo").required=false; document.querySelector("#personLogDateFrom").value=today(); document.querySelector("#personLogDateTo").value=today();
      document.querySelector("#personLogExportName").textContent=selected.name; document.querySelector("#personLogExportIdentity").textContent=`${selected.idNumber} · ${selected.type==="student"?"Student":"Employee"}`; document.querySelector("#personLogExportError").textContent=""; dialog.showModal();
      try{await loadPeriods();}catch(e){document.querySelector("#personLogExportError").textContent=e.message;} return;
    }
    if(event.target.closest("#personLogExportDialog .close-button, #personLogExportDialog button[value=cancel]")&&dialog.open)dialog.close();
  });
  form.addEventListener("submit",(e)=>{e.preventDefault();exportLogs();});
  document.querySelector("#personLogSource").addEventListener("change",(e)=>{const show=e.target.value==="university";document.querySelector("#personLogDateField").hidden=!show;document.querySelector("#personLogDateFrom").required=show;document.querySelector("#personLogDateTo").required=show;});
  dialog.addEventListener("close",()=>{form.reset();selected=null;document.querySelector("#personLogExportError").textContent="";});
})();
