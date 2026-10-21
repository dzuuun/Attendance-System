// Exercise the real entrance page with fake API replies and an isolated Chrome profile.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "taptrack-kiosk-check-"));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let page = read("client/kiosk/index.html")
  .replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(/<link[^>]*>/g, "");
const css = ["client/kiosk/style.css", "client/kiosk/last-log.css", "client/kiosk/fullscreen.css", "client/queue-status.css"]
  .map(read).join("\n").replace(/@import[^;]+;/g, "");
const prelude = `<script>
window.taptrackUrl = value => value;
localStorage.setItem('taptrack_kiosk_sound', 'false');
localStorage.removeItem('taptrack_kiosk_scanner_assignments');
window.AudioContext = undefined; window.webkitAudioContext = undefined;
window.setInterval = () => 0;
window.errors = [];
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const requests = [], finishes = [];
const rawScans = [];
let scannerSequence = 0;
const types = ['Student','Employee','Alumnus'];
window.fetch = async (url, options = {}) => {
  if (url.startsWith('/api/kiosk/scanners/lookup?')) {
    const query = new URLSearchParams(url.split('?')[1]);
    return {ok:true,json:async()=>({scans:rawScans.filter(scan=>scan.sequence>Number(query.get('after'))&&scan.idNumber===query.get('value')),lastScanSequence:scannerSequence,scanEpoch:'test-server'})};
  }
  if (url === '/api/kiosk/scan') {
    const data = JSON.parse(options.body);
    const index = requests.push(data) - 1;
    return new Promise(resolve => finishes[index] = () => resolve({ok:true, json:async()=>({
      id: index + 1, idNumber: data.idNumber, name: types[index] || 'Person',
      type: types[index] || 'Student', action:data.action === 'Auto' ? 'Time In' : data.action,
      timestamp:'2026-10-21T08:00:00Z', program:'Test program', department:'Test office',
    })}));
  }
  let data = {};
  if (url === '/api/kiosk/gates') data = [{id:1,name:'Main Entrance',campus:'Main'}];
  if (url.startsWith('/api/kiosk/scans?')) data = {records:[],stats:{total:0,in:0,out:0}};
  if (url === '/api/kiosk/heartbeat') data = {enabled:true};
  if (url === '/api/kiosk/commands/poll') data = {commands:[]};
  if (url === '/api/kiosk/scanners') data = {available:false,connected:false,platform:'web'};
  return {ok:true,json:async()=>data};
};
const bridgeListeners = {};
window.EventSource = class { addEventListener(name, callback) { bridgeListeners[name] = callback; } };
const captureScan = data => {
  const scan={...data,sequence:++scannerSequence,epoch:'test-server'};
  rawScans.push(scan);
  return scan;
};
const deliverScan = data => bridgeListeners.scan({data:JSON.stringify(data)});
const bridge = (name, data) => bridgeListeners[name]({data:JSON.stringify(name==='scan'?captureScan(data):{...data,lastScanSequence:scannerSequence,scanEpoch:'test-server'})});
</script>`;
const check = `<pre id="report"></pre><script>
const pause = () => new Promise(resolve => setTimeout(resolve, 30));
const expect = (condition, message) => { if (!condition) throw Error(message); };
const enter = () => document.querySelector('#kioskInput').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true,cancelable:true}));
const saveAssignment = () => document.querySelector('#scannerAssignmentReview [data-review-save]').click();
(async () => {
try {
  await pause();
  const field = document.querySelector('#kioskInput');
  expect(document.querySelector('#bridgeStatusBox'), 'Scanner status panel is missing');
  expect(document.querySelector('#attendanceQueuePanel').hidden, 'Queue should be hidden while idle');
  bridge('status', {available:false,connected:false,platform:'web'});
  const steady = ['.kiosk-header','.kiosk-main-panel','.kiosk-footer'].map(selector => ({
    element:document.querySelector(selector),
    html:document.querySelector(selector).outerHTML,
    rect:document.querySelector(selector).getBoundingClientRect().toJSON(),
  }));
  const mutations=[];
  const watcher=new MutationObserver(records=>{
    for(const record of records){
      const element=record.target instanceof Element?record.target:record.target.parentElement;
      if(element.isConnected&&!element.closest('#kioskResult,.session-stats-bar,.recent-feed-card'))mutations.push(element.id||element.className);
    }
  });
  watcher.observe(document.querySelector('main.kiosk'),{subtree:true,childList:true,attributes:true,characterData:true});
  const checkSteady=()=>steady.forEach(({element,html,rect})=>{
    expect(element.outerHTML===html,'A scan changed the header, input panel, or footer');
    const current=element.getBoundingClientRect();
    expect(['x','y','width','height'].every(key=>Math.abs(current[key]-rect[key])<1),'A scan shifted the surrounding panels');
  });
  field.value = '000111'; enter(); await pause();
  expect(requests.length === 1 && requests[0].idNumber === '000111', 'First HID card was lost');
  expect(field.value === '', 'Completed input must be consumed immediately');
  expect(!document.querySelector('#submitScanBtn').disabled, 'Scanning must not change the input panel controls');
  expect(document.querySelector('#attendanceQueuePanel').closest('#kioskResult'), 'Progress must stay in the white result card');
  checkSteady();
  field.value = '000222'; enter(); await pause();
  expect(requests.length === 2 && requests[1].idNumber === '000222', 'Enter must capture the next card during a save');
  field.value = '0003'; finishes[0](); await pause();
  expect(field.value === '0003', 'Earlier response erased the next card');
  const firstRow=document.querySelector('#recentScansList .feed-item');
  const firstPhoto=firstRow.querySelector('img');
  finishes[1](); await pause();
  expect(field.value === '0003', 'Second response erased the next card');
  expect(document.querySelectorAll('#recentScansList .feed-item')[1]===firstRow,'Existing scan row was rebuilt');
  expect(firstRow.querySelector('img')===firstPhoto,'Existing scan photo was rebuilt');
  field.value += '33'; enter(); await pause();
  expect(requests[2].idNumber === '000333', 'Partial third card was corrupted');
  finishes[2](); await pause();
  expect(document.querySelector('#attendeeDetails').textContent.includes('Alumnus'), 'Alumni result was not rendered');
  expect(document.querySelector('#attendanceQueuePanel').hidden, 'Queue did not return to idle');
  checkSteady();
  watcher.disconnect();
  expect(mutations.length===0,'Scan changed unrelated UI: '+mutations.join(', '));
  bridge('status', {available:true,connected:true,platform:'win32'});
  document.querySelector('[data-pair="Time In"]').click();
  bridge('scan', {idNumber:'PAIR',deviceId:'reader-1',name:'HID reader'});
  field.value = 'PAIR'; enter(); await new Promise(resolve=>setTimeout(resolve,300));
  expect(requests.length === 3, 'Pairing must not record attendance');
  expect(document.querySelector('#scannerAssignmentReview').open, 'Pairing must require confirmation');
  expect(!JSON.parse(localStorage.getItem('taptrack_kiosk_scanner_assignments')||'{}')['Time In']?.length, 'Pairing saved before confirmation');
  saveAssignment(); await pause();
  expect(document.querySelector('#resultKicker').textContent==='SCANNER SETTINGS SAVED', 'Pairing must not claim attendance was recorded: '+document.querySelector('#resultKicker').textContent+'; '+document.querySelector('#resultTitle').textContent+'; '+errors.join('; ') );
  bridge('scan', {idNumber:'000444',deviceId:'reader-1',name:'HID reader'});
  field.value = '000444'; enter(); await pause();
  expect(requests.length === 4 && requests[3].action === 'Time In', 'Assigned HID direction was lost');
  finishes[3](); await new Promise(resolve=>setTimeout(resolve,300));
  expect(requests.length === 4, 'Keyboard echo recorded attendance twice');
  bridge('status', {available:true,connected:false,platform:'win32'});
  field.value = '000555'; enter(); await pause();
  expect(requests[4]?.action === 'Time In', 'Offline bridge changed a Time In scanner to Auto');
  finishes[4](); await pause();
  bridge('status', {available:true,connected:true,platform:'win32'});
  field.value = '000666'; enter(); await new Promise(resolve=>setTimeout(resolve,300));
  expect(requests[5]?.action === 'Time In', 'Late bridge changed a Time In scanner to Auto');
  bridge('scan', {idNumber:'000666',deviceId:'reader-1',name:'HID reader'});
  finishes[5](); await pause();
  expect(requests.length === 6, 'Late bridge recorded a keyboard echo twice');
  document.querySelector('[data-pair="Time Out"]').click();
  bridge('scan', {idNumber:'PAIR-OUT',deviceId:'reader-1',name:'HID reader'});
  saveAssignment(); await pause();
  bridge('status', {available:true,connected:false,platform:'win32'});
  field.value = '000777'; enter(); await pause();
  expect(requests[6]?.action === 'Time Out', 'Time Out-only scanner changed direction');
  finishes[6](); await pause();
  bridge('status', {available:true,connected:true,platform:'win32'});
  document.querySelector('[data-pair="Time In"]').click();
  bridge('scan', {idNumber:'PAIR-IN',deviceId:'reader-2',name:'Second HID reader'});
  saveAssignment(); await pause();
  field.value = '000888'; enter(); await new Promise(resolve=>setTimeout(resolve,300));
  expect(requests.length === 7, 'Unidentified scan used Auto with both directions assigned');
  bridge('scan', {idNumber:'000888',deviceId:'reader-2',name:'Second HID reader'});
  await pause();
  expect(requests[7]?.action === 'Time In', 'Identified Time In scanner lost its direction');
  finishes[7](); await pause();
  bridge('status', {available:true,connected:false,platform:'win32'});
  field.value = '000999'; enter(); await pause();
  expect(requests.length === 8, 'Disconnected directional scanners used Auto');
  field.value = '000999'; document.querySelector('#submitScanBtn').click(); await pause();
  expect(requests[8]?.action === 'Auto', 'Deliberate manual Record entry stopped working');
  finishes[8](); await pause();
  bridge('status', {available:true,connected:true,platform:'win32'});
  field.value = '001000'; enter(); await new Promise(resolve=>setTimeout(resolve,300));
  expect(requests.length===9,'A missing immediate event must not choose Auto');
  expect(document.querySelector('#resultTitle').textContent==='Reading Scanner','Late reader must show a pending state');
  const recoveredIn=captureScan({idNumber:'001000',deviceId:'reader-2',name:'Second HID reader'});
  await new Promise(resolve=>setTimeout(resolve,450));
  expect(requests[9]?.action==='Time In','HTTP recovery lost the Time In assignment');
  finishes[9](); await pause();
  deliverScan(recoveredIn); await pause();
  expect(requests.length===10,'A recovered reader event was recorded twice');
  bridge('error', {});
  captureScan({idNumber:'001111',deviceId:'reader-1',name:'HID reader'});
  field.value = '001111'; enter(); await pause();
  expect(requests[10]?.action==='Time Out','Disconnected stream did not recover the Time Out reader');
  finishes[10](); await pause();
  localScannerAssignments={'Time In':[{deviceId:'keyboard-1',name:'Keyboard'},{deviceId:'keyboard-2',name:'Keyboard'}],'Time Out':[{deviceId:'reader-1',name:'HID reader'}]};
  saveScannerAssignments(); renderScannerStatus({});
  expect(document.querySelector('[data-pair="Time In"]').textContent==='Replace scanners','Full slots must allow replacement');
  const requestRepair=()=>{
    const url=new URL(location.href);url.searchParams.set('scannerAction','Time In');url.searchParams.set('scannerDevice','reader-fixed');
    history.replaceState(null,'',url.href);reviewScannerAssignmentLink();
  };
  requestRepair();
  const repairDialog=document.querySelector('#scannerAssignmentReview');
  expect(repairDialog.open,'Repair link must open a confirmation');
  const entered=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});repairDialog.dispatchEvent(entered);
  expect(entered.defaultPrevented&&repairDialog.open,'Scanner Enter must not confirm assignment changes');
  repairDialog.querySelector('[data-review-cancel]').click();await pause();
  expect(localScannerAssignments['Time In'].length===2,'Cancel changed existing assignments');
  requestRepair();saveAssignment();await pause();
  expect(localScannerAssignments['Time In'].length===1&&localScannerAssignments['Time In'][0].deviceId==='reader-fixed','Repair did not replace incorrect keyboard mappings');
  expect(localScannerAssignments['Time Out'][0].deviceId==='reader-1','Repair changed the other lane');
  expect(requests.length===11,'Repair must not record attendance');
  bridge('scan',{idNumber:'001222',deviceId:'reader-fixed',name:'HID reader'});await pause();
  expect(requests[11]?.action==='Time In','Repaired physical reader did not record Time In');
  finishes[11]();await pause();
  document.querySelector('[data-clear-scanners="Time In"]').click();
  saveAssignment();await pause();
  expect(localScannerAssignments['Time In'].length===0&&localScannerAssignments['Time Out'][0].deviceId==='reader-1','Clear must only remove the selected lane');
  for(let index=0;index<12;index++){
    const list=document.querySelector('#recentScansList');
    const before=[...list.querySelectorAll('.feed-item')];
    const photos=before.map(row=>row.querySelector('img'));
    addRecentScan({name:'Added '+index,idNumber:'R'+index,type:'Student',action:'Time In',timestamp:'2026-10-21T08:00:00Z'});
    const after=[...list.querySelectorAll('.feed-item')];
    expect(after.length===Math.min(before.length+1,10),'Recent list must retain ten rows');
    expect(after[0].textContent.includes('Added '+index),'New scan was not prepended');
    for(let oldIndex=0;oldIndex<Math.min(before.length,9);oldIndex++){
      expect(after[oldIndex+1]===before[oldIndex],'Prepending rebuilt an existing row');
      expect(after[oldIndex+1].querySelector('img')===photos[oldIndex],'Prepending replaced an existing photo');
    }
    if(before.length===10)expect(!before[9].isConnected,'Oldest overflow row was not removed');
  }
  expect(errors.length === 0, errors.join('; '));
  document.querySelector('#report').textContent = JSON.stringify({loaded:true,cards:requests.map(r=>r.idNumber),incorrectKeyboardAssignmentsReplaced:true,assignmentConfirmationRequired:true,scannerEnterCannotConfirm:true,otherLanePreserved:true,settingsDoNotClaimAttendance:true,delayedReaderRecovered:true,disconnectedStreamRecovered:true,recoveredEventRecordedOnce:true,singleLaneDirectionPreserved:true,lateBridgeDirectionPreserved:true,dualLaneRequiresIdentification:true,manualRecordAvailable:true,enterWhileSaving:true,partialInputPreserved:true,pairingConsumed:true,keyboardEchoSuppressed:true,updatesLimitedToResultAndBottom:true,surroundingLayoutStable:true,existingRowsAndPhotosPreserved:true,newRowsPrepended:true,tenRowLimit:true});
} catch(error) { document.querySelector('#report').textContent = JSON.stringify({error:error.stack}); }
})();
</script>`;
page = page.replace("</head>", () => `<style>${css}*,*::before,*::after{transition:none!important}</style>` + prelude + "</head>").replace("</body>", () =>
  `<script>${read("client/kiosk/scan-queue.js")}</script><script>${read("client/kiosk/script.js")}</script>${check}</body>`,
);
const file = path.join(directory, "check.html");
fs.writeFileSync(file, page);
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const result = spawnSync(chrome, [
  "--headless", "--no-sandbox", "--disable-gpu", "--in-process-gpu", "--no-first-run", "--disable-background-networking",
  `--user-data-dir=${path.join(directory, "profile")}`, "--window-size=1587,914", "--virtual-time-budget=4500", "--dump-dom", pathToFileURL(file).href,
], { windowsHide: true, encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
if (result.error) throw result.error;
const match = result.stdout.match(/<pre id="report">([^<]+)<\/pre>/);
assert.ok(match, "Browser did not return a kiosk report");
const report = JSON.parse(match[1].replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&"));
assert.equal(report.error, undefined, report.error);
assert.deepEqual(report.cards, ["000111", "000222", "000333", "000444", "000555", "000666", "000777", "000888", "000999", "001000", "001111", "001222"]);
console.log(JSON.stringify(report));
