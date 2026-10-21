// Exercise the actual people directories with isolated fixture data.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const shared = read("client/shared-ui.js");
const tableStart = shared.indexOf("  function destroyDataTable(");
const tableEnd = shared.indexOf("  async function api(", tableStart);
const personStart = shared.indexOf("  const initials =");
const personEnd = shared.indexOf("  function clock()", personStart);
const confirmationStart = shared.indexOf("  const confirmedModalForms");
const confirmationEnd = shared.indexOf('  document.addEventListener(\n    "keydown",', shared.indexOf("      dialog.showModal();", confirmationStart));
const tableScripts = ["node_modules/datatables.net/js/dataTables.min.js", "node_modules/datatables.net-responsive/js/dataTables.responsive.min.js"]
  .map((file) => `<script>${read(file)}</script>`).join("");

for (const resource of ["student", "employee", "alumni"]) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `taptrack-${resource}-enrollment-`));
  let page = read(`client/maintenance/${resource}/index.html`).replace(/<link[^>]*>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
  const fixture = `<script>
  window.taptrackUrl=value=>value;
  const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>');
  const fixturePeople=[{id:1,idNumber:'ID001',name:'Person One',firstName:'Person',lastName:'One',photoUrl:photo,cardId:null,isActive:true,departmentCode:'MIS',departmentId:1,contact:'',programCode:'BSIT',programId:1,graduationYear:2025,studentIsActive:false},{id:2,idNumber:'ID002',name:'Person Two',firstName:'Person',lastName:'Two',photoUrl:null,cardId:null,isActive:true,departmentCode:'MIS',departmentId:1,contact:'',programCode:'BSIT',programId:1,graduationYear:2025,studentIsActive:false}];
  const writes=[];let finishSave;
  const fixtureEscapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  window.TapTrack={
    $:selector=>document.querySelector(selector),escapeHtml:fixtureEscapeHtml,
    init:async()=>({user:{role:'Administrator'}}),toast:()=>{},uploadProfilePhoto:async()=>{},enhanceSearchableSelect:()=>{},
    emptyRow:(count,text)=>'<tr class="empty-row"><td colspan="'+count+'">'+text+'</td></tr>',
    api:async(url,options={})=>{
      if(options.method==='PATCH'){
        writes.push({url,body:JSON.parse(options.body)});
        return new Promise(resolve=>finishSave=()=>resolve({cardId:JSON.parse(options.body).cardId}));
      }
      if(url==='/api/${resource}')return fixturePeople;
      if(url==='/api/employee_department'||url==='/api/program-options')return[{id:1,code:'MIS',name:'Test',isActive:true}];
      if(url==='/api/section-options')return[];
      throw Error('Unexpected request: '+url);
    }
  };
  (function(){const api=TapTrack.api,toast=TapTrack.toast,$=TapTrack.$;
    ${shared.slice(personStart, personEnd)}
    const dataTablesReady=Promise.resolve(window.DataTable);
    ${shared.slice(tableStart, tableEnd)}
    Object.assign(TapTrack,{personCell,personName,initDataTable,destroyDataTable,initCardEnrollmentDialog});
  })();
  (function(){let pendingConfirmedSave=null;${shared.slice(confirmationStart, confirmationEnd)}})();
  </script>`;
  const check = `<pre id="report"></pre><script>
  const pause=(ms=40)=>new Promise(resolve=>setTimeout(resolve,ms));
  const expect=(value,message)=>{if(!value)throw Error(message)};
  (async()=>{try{
    await pause(150);
    expect(document.querySelectorAll('#body > tr').length===2,'Directory did not load');
    expect([...document.querySelectorAll('thead th')].some(th=>th.textContent==='CARD'),'Card status column missing');
    expect(!document.querySelector('#form #cardId'),'Card ID must not be editable in the ordinary form');
    const manage=id=>document.querySelector('.person-manage-trigger[data-id="'+id+'"]').click();
    manage(1);expect(!!document.querySelector('.event-action-popup .edit'),'Existing edit action missing');
    document.querySelector('.event-action-popup .card-enroll').click();
    const dialog=document.querySelector('#cardDialog'),field=document.querySelector('#enrollmentCardId');
    expect(dialog.open&&!document.querySelector('#dialog').open,'Enrollment opened the record editor');
    expect(!document.querySelector('#cardPersonPhoto').hidden&&document.querySelector('#cardPersonPhoto').src===photo,'Photo missing');
    const scan=value=>{
      for(const character of value){field.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:character,bubbles:true}));field.setRangeText(character,field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new InputEvent('input',{inputType:'insertText',data:character,bubbles:true}));}
      for(const eventType of ['keydown','keypress','keyup'])expect(!field.dispatchEvent(new KeyboardEvent(eventType,{key:'Enter',bubbles:true,cancelable:true})),'Reader Enter not blocked');
    };
    scan('00012345');field.setSelectionRange(field.value.length,field.value.length);scan('00098765');
    expect(field.value==='00098765'&&writes.length===0,'Repeated scans appended or saved');
    document.querySelector('#saveCardBtn').click();expect(document.querySelector('#recordConfirmationDialog').open&&writes.length===0,'Save confirmation missing');
    document.querySelector('#recordConfirmationCancel').click();expect(field.value==='00098765','Cancel lost the card');
    scan('00012345');document.querySelector('#saveCardBtn').click();document.querySelector('#recordConfirmationSubmit').click();await pause();
    expect(dialog.open&&field.disabled&&document.querySelector('#saveCardBtn').disabled,'Pending save was not guarded');
    document.querySelector('#cardDialog .close-button').click();
    expect(dialog.open,'The enrollment modal closed during a pending save');
    expect(!dialog.dispatchEvent(new Event('cancel',{cancelable:true})),'Escape can close a pending enrollment');
    // Programmatically dispatch the switch that previously corrupted the student table.
    manage(2);document.querySelector('.event-action-popup .card-enroll').click();
    expect(document.querySelector('#cardStudentName').textContent.includes('Person One'),'Pending enrollment switched to another person');
    expect(!fixturePeople[1].cardId&&writes.length===1,'Pending enrollment touched the next person');
    finishSave();await pause();
    expect(writes.length===1&&writes[0].url==='/api/${resource}/1/card'&&writes[0].body.cardId==='00012345','Incorrect enrollment request');
    expect(!dialog.open&&document.querySelector('#body > tr').textContent.includes('Enrolled'),'Status not updated');
    expect(fixturePeople[0].cardId==='00012345'&&!fixturePeople[1].cardId,'Saved card was assigned to the wrong in-memory record');
    manage(2);document.querySelector('.event-action-popup .card-enroll').click();
    expect(document.querySelector('#cardPersonPhoto').hidden&&!document.querySelector('#cardPersonPhoto').hasAttribute('src'),'Previous photo leaked into the next person');
    expect(field.value==='','Previous card leaked into the next person');
    document.querySelector('#cardDialog .close-button').click();
    manage(1);document.querySelector('.event-action-popup .card-enroll').click();
    expect(document.querySelector('#cardCurrentStatus').textContent.includes('00012345'),'Current card missing');
    document.querySelector('#report').textContent=JSON.stringify({resource:'${resource}',photo:true,cardStatus:true,confirmation:true,scanReplacement:true,separateModal:true,pendingSaveCannotSwitchPerson:true});
  }catch(error){document.querySelector('#report').textContent=JSON.stringify({error:error.stack})}})();
  </script>`;
  const script = resource === "employee" ? "client/maintenance/directory.js" : `client/maintenance/${resource}/script.js`;
  page = page.replace("</body>", () => `${tableScripts}${fixture}<script>${read(script)}</script>${check}</body>`);
  const file = path.join(directory, "check.html");
  fs.writeFileSync(file, page);
  const result = spawnSync(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless", "--no-sandbox", "--disable-gpu", "--in-process-gpu", "--no-first-run", "--disable-background-networking",
    `--user-data-dir=${path.join(directory, "profile")}`, "--virtual-time-budget=2000", "--dump-dom", pathToFileURL(file).href,
  ], { windowsHide: true, encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  const match = result.stdout.match(/<pre id="report">([^<]+)<\/pre>/);
  assert.ok(match, `No ${resource} browser report`);
  const report = JSON.parse(match[1]);
  assert.equal(report.error, undefined, report.error);
  console.log(JSON.stringify(report));
}
