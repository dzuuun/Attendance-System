// Exercise directory browsing and card confirmation with fake people in an isolated browser.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const shared = read("client/shared-ui.js");
const confirmationStart = shared.indexOf("  const confirmedModalForms");
const confirmationEnd = shared.indexOf('  document.addEventListener(\n    "keydown",', shared.indexOf("      dialog.showModal();", confirmationStart));
const personStart = shared.indexOf("  const initials =");
const personEnd = shared.indexOf("  function clock()", personStart);
const tableStart = shared.indexOf("  function destroyDataTable(");
const tableEnd = shared.indexOf("  async function api(", tableStart);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "taptrack-card-directory-"));
let page = read("client/maintenance/card-enrollment/index.html").replace(/<link[^>]*>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
const tableScripts = ["node_modules/datatables.net/js/dataTables.min.js", "node_modules/datatables.net-responsive/js/dataTables.responsive.min.js"]
  .map((file) => `<script>${read(file)}</script>`).join("");
const styles = ["client/dashboard/style.css", "client/dashboard/events.css", "node_modules/datatables.net-dt/css/dataTables.dataTables.min.css", "node_modules/datatables.net-responsive-dt/css/responsive.dataTables.min.css", "client/page-shell.css"]
  .map((file) => `<style>${read(file).replace(/@import[^;]+;/g, "")}</style>`).join("");
page = page.replace("</head>", () => `${styles}${tableScripts}</head>`);
const prelude = `<script>
window.taptrackUrl = value => value.startsWith('/uploads/') ? '/attendance-system'+value : value;
const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>');
const rows=Array.from({length:65},(_,index)=>({id:index+1,idNumber:'ID'+String(index+1).padStart(3,'0'),name:'Person'+String(index+1).padStart(3,'0'),type:['student','employee','alumni'][index%3],cardId:null,photoUrl:index%2===0?photo:null}));
const requests=[],writes=[];
const fixtureEscapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
window.TapTrack={
  $:selector=>document.querySelector(selector),escapeHtml:fixtureEscapeHtml,
  emptyRow:(columns,text)=>'<tr><td colspan="'+columns+'">'+text+'</td></tr>',
  init:async()=>{},toast:()=>{},
  api:async(url,options={})=>{
    requests.push(url);
    if(options.method==='PATCH'){
      const cardId=JSON.parse(options.body).cardId;writes.push({url,cardId});
      const [type,id]=url.split('/').slice(-3,-1);
      rows.find(person=>person.type===type&&person.id===Number(id)).cardId=cardId;return{cardId};
    }
    const params=new URL(url,'https://taptrack.test').searchParams;
    const term=(params.get('search')||'').toLowerCase(),type=params.get('type')||'all',start=Number(params.get('start')),length=Number(params.get('length'));
    const filtered=rows.filter(person=>(type==='all'||person.type===type)&&(person.name.toLowerCase().includes(term)||person.idNumber.toLowerCase().includes(term)));
    const key=params.get('orderBy'),sign=params.get('direction')==='desc'?-1:1;
    filtered.sort((a,b)=>String(a[key]||'').localeCompare(String(b[key]||''))*sign);
    return{draw:Number(params.get('draw')),data:filtered.slice(start,start+length),recordsTotal:rows.filter(person=>type==='all'||person.type===type).length,recordsFiltered:filtered.length};
  },
};
(function(){${shared.slice(personStart, personEnd)}window.TapTrack.personCell=personCell;})();
(function(){const dataTablesReady=Promise.resolve(window.DataTable);${shared.slice(tableStart, tableEnd)}window.TapTrack.initDataTable=initDataTable;window.TapTrack.initCardEnrollmentInput=initCardEnrollmentInput;})();
(function(){let pendingConfirmedSave=null;${shared.slice(confirmationStart, confirmationEnd)}})();
</script>`;
const check = `<pre id="report"></pre><script>
const pause=(ms=30)=>new Promise(resolve=>setTimeout(resolve,ms));
const expect=(condition,message)=>{if(!condition)throw Error(message)};
const tableRows=()=>[...document.querySelectorAll('#body > tr')];
(async()=>{try{
  await pause();
  expect(tableRows().length===10,'People were not listed automatically: '+document.querySelector('#searchStatus').textContent);
  expect(!!document.querySelector('.dt-container table.dataTable'),'Shared DataTable styling missing');
  expect(new URL(requests[0],'https://taptrack.test').searchParams.get('search')==='','Initial listing required a search');
  expect(!!tableRows()[0].querySelector('.avatar img'),'Profile photo missing from the table');
  expect(!tableRows()[1].querySelector('.avatar img'),'Missing-photo fallback should use initials');
  expect(document.querySelector('.dt-info').textContent.includes('of 65 entries'),'Shared record count incorrect');
  document.querySelector('.dt-paging-button.next').click();await pause();
  expect(tableRows().length===10&&tableRows()[0].textContent.includes('ID011'),'Next page failed');
  document.querySelector('.dt-paging-button.last').click();await pause();
  expect(tableRows().length===5&&tableRows()[0].textContent.includes('ID061'),'Last page failed');
  document.querySelector('.dt-paging-button.first').click();await pause();
  const table=new DataTable(document.querySelector('#body').closest('table'));
  table.order([[0,'desc']]).draw();await pause();
  expect(tableRows()[0].textContent.includes('ID065'),'Server sorting failed');
  table.order([[1,'asc']]).draw();await pause();
  const type=document.querySelector('#personType');type.value='employee';type.dispatchEvent(new Event('change'));await pause();
  expect(tableRows().length===10&&tableRows().every(row=>row.cells[2].textContent==='Employee')&&document.querySelector('.dt-info').textContent.includes('of 22 entries'),'Person type filter failed');
  type.value='all';type.dispatchEvent(new Event('change'));await pause();
  document.querySelector('[data-enroll="student:1"]').click();
  expect(document.querySelector('#cardDialog').open,'Enrollment modal did not open');
  expect(!document.querySelector('#cardPersonPhoto').hidden&&document.querySelector('#cardPersonPhoto').src===photo,'Profile photo missing from the modal');
  const field=document.querySelector('#enrollmentCardId');field.value='00012345';field.dispatchEvent(new Event('input',{bubbles:true}));
  const finishScan=()=>{for(const eventType of ['keydown','keypress','keyup'])expect(!field.dispatchEvent(new KeyboardEvent(eventType,{key:'Enter',bubbles:true,cancelable:true})),'Reader Enter was not blocked')};
  const typeScan=value=>{for(const character of value){field.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:character,bubbles:true,cancelable:true}));field.setRangeText(character,field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new InputEvent('input',{inputType:'insertText',data:character,bubbles:true}));}finishScan()};
  finishScan();typeScan('00012345');
  expect(field.value==='00012345','Scanning twice appended the card ID');
  field.setSelectionRange(field.value.length,field.value.length);typeScan('0848004675');
  expect(field.value==='0848004675','A new card did not replace the entire previous value after clicking the input');
  typeScan('00012345');
  expect(writes.length===0,'Reader Enter saved a card');
  document.querySelector('#saveCardBtn').click();expect(document.querySelector('#recordConfirmationDialog').open&&writes.length===0,'Confirmation was skipped');
  document.querySelector('#recordConfirmationCancel').click();expect(field.value==='00012345','Cancel discarded the scanned card');
  typeScan('00012345');expect(field.value==='00012345','Rescanning after cancel appended the card ID');
  document.querySelector('#saveCardBtn').click();document.querySelector('#recordConfirmationSubmit').click();await pause();
  expect(writes.length===1&&tableRows()[0].textContent.includes('Enrolled'),'Confirmed card was not saved');
  document.querySelector('[data-enroll="employee:2"]').click();
  expect(document.querySelector('#cardPersonPhoto').hidden&&!document.querySelector('#cardPersonPhoto').hasAttribute('src'),'Previous person photo leaked into a profile without a photo');
  document.querySelector('#cardDialog .close-button').click();
  const search=document.querySelector('#search');search.value='Person060';search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await pause();
  expect(tableRows().length===1&&tableRows()[0].textContent.includes('ID060'),'Optional search failed');
  search.value='';search.dispatchEvent(new Event('input'));await pause(350);
  expect(tableRows().length===10,'Clearing the filter did not restore the directory');
  table.page(1).draw('page');await pause();document.querySelector('[data-enroll="employee:11"]').click();
  field.value='00098765';field.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#saveCardBtn').click();document.querySelector('#recordConfirmationSubmit').click();await pause();
  expect(table.page()===1&&tableRows()[0].textContent.includes('ID011')&&tableRows()[0].textContent.includes('Enrolled'),'Saving reset the current table page');
  document.querySelector('#report').textContent=JSON.stringify({sharedDataTable:true,initialListing:true,pagination:true,sorting:true,typeFilter:true,photosInTableAndModal:true,missingPhotoFallback:true,confirmationRequired:true,readerEnterBlocked:true,rescansReplaceEntireValue:true,optionalSearch:true,pagePreservedOnSave:true});
}catch(error){document.querySelector('#report').textContent=JSON.stringify({error:error.stack})}})();
</script>`;
page = page.replace("</body>", () => `${prelude}<script>${read("client/maintenance/card-enrollment/script.js")}</script>${check}</body>`);
const file = path.join(directory, "check.html");
fs.writeFileSync(file, page);
const result = spawnSync(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--headless", "--no-sandbox", "--disable-gpu", "--in-process-gpu", "--no-first-run", "--disable-background-networking",
  `--user-data-dir=${path.join(directory, "profile")}`, "--virtual-time-budget=2000", "--dump-dom", pathToFileURL(file).href,
], { windowsHide: true, encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
if (result.error) throw result.error;
const match = result.stdout.match(/<pre id="report">([^<]+)<\/pre>/);
assert.ok(match, "No card enrollment browser report");
const report = JSON.parse(match[1]);
assert.equal(report.error, undefined, report.error);
console.log(JSON.stringify(report));
