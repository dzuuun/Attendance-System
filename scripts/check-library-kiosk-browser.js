// Uses fake API data and temporary Chrome profiles; never records real attendance.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "taptrack-library-hid-"));
const prelude = `<script>
window.taptrackUrl = value => value;
localStorage.setItem('taptrack_library_kiosk_sound','false');
window.setInterval = () => 0;
const requests=[],finishes=[],errors=[];
window.addEventListener('error',event=>errors.push(event.message));
window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
window.fetch=async(url,options={})=>{
  if(url.endsWith('/scan')) {
    const data=JSON.parse(options.body),index=requests.push({url,...data})-1;
    const person=Math.floor(index/2);
    return new Promise(resolve=>finishes[index]=()=>resolve({ok:true,json:async()=>({
      id:index+1,idNumber:['2023007','P2023007','A2010007'][person],
      name:['Student Test','Employee Test','Alumni Test'][person],type:['Student','Employee','Alumnus'][person],
      timestamp:'2026-10-21T08:00:00Z',action:'Time In'
    })}));
  }
  return {ok:true,json:async()=>url.endsWith('/scans')?{scans:[],stats:{}}:url.endsWith('/heartbeat')?{enabled:true}:{commands:[]}};
};
</script>`;
const check = `<pre id="report"></pre><script>
const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
const expect=(condition,message)=>{if(!condition)throw Error(message)};
const field=document.querySelector('#kioskInput');
const enter=()=>field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
(async()=>{try{
  await pause();
  field.value='2023007';enter();await pause();
  expect(requests.length===1,'ID number was not captured');expect(field.value==='','ID input was not consumed');
  field.value='00012345';enter();await pause();
  expect(requests.length===2,'Card number Enter was blocked by pending save');
  field.value='NEXT';finishes[0]();await pause();
  const firstRow=document.querySelector('#recentScansList .feed-item'),firstPhoto=firstRow.querySelector('img');
  finishes[1]();await pause();expect(field.value==='NEXT','Earlier save erased pending input');
  expect(document.querySelectorAll('#recentScansList .feed-item')[1]===firstRow,'Existing row was rebuilt');
  expect(firstRow.querySelector('img')===firstPhoto,'Existing photo was rebuilt');
  for(const value of ['P2023007','00aa9876','A2010007','00bb7777']){
    field.value=value;enter();await pause();finishes[requests.length-1]();await pause();
  }
  expect(errors.length===0,errors.join('; '));
  expect(document.querySelector('#attendeeDetails').textContent.includes('Alumnus'),'Alumni card result was not rendered');
  for(let index=0;index<12;index++){
    const list=document.querySelector('#recentScansList'),before=[...list.querySelectorAll('.feed-item')];
    addRecent({name:'Added '+index,idNumber:'R'+index,type:'Student',timestamp:'2026-10-21T08:00:00Z'});
    const after=[...list.querySelectorAll('.feed-item')];
    expect(after.length===Math.min(before.length+1,10),'Wrong row limit');
    for(let oldIndex=0;oldIndex<Math.min(before.length,9);oldIndex++)expect(after[oldIndex+1]===before[oldIndex],'Existing row was replaced');
    if(before.length===10)expect(!before[9].isConnected,'Oldest overflow row was not removed');
  }
  document.querySelector('#report').textContent=JSON.stringify({requests:requests.map(r=>({url:r.url,value:r.idNumber})),hidEnter:true,partialInputPreserved:true,existingRowsAndPhotosPreserved:true,newRowsPrepended:true,tenRowLimit:true});
}catch(error){document.querySelector('#report').textContent=JSON.stringify({error:error.stack})}})();
</script>`;
for (const location of ["library", "internet-section"]) {
  const page = read("client/library-kiosk/index.html")
    .replace(/<link[^>]*>/g, "").replace(/<script[\s\S]*?<\/script>/g, "")
    .replace("</head>", () => prelude + "</head>")
    .replace("</body>", () => `<script>${read("client/kiosk/scan-queue.js")}</script><script>${read("client/library-kiosk/script.js")}</script>${check}</body>`);
  const file = path.join(directory, `${location}.html`);
  fs.writeFileSync(file, page);
  const result = spawnSync(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless", "--no-sandbox", "--disable-gpu", "--in-process-gpu", "--no-first-run", "--disable-background-networking",
    `--user-data-dir=${path.join(directory, location + "-profile")}`, "--virtual-time-budget=2000", "--dump-dom", pathToFileURL(file).href,
  ], { windowsHide: true, encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  const match = result.stdout.match(/<pre id="report">([^<]+)<\/pre>/);
  assert.ok(match, "No kiosk browser report");
  const report = JSON.parse(match[1]);
  assert.equal(report.error, undefined, report.error);
  assert.deepEqual(report.requests.map((r) => r.value), ["2023007", "00012345", "P2023007", "00AA9876", "A2010007", "00BB7777"]);
  assert.ok(report.requests.every((r) => r.url === `/api/library-kiosk/${location === "library" ? "library" : "internet"}/scan`));
  console.log(JSON.stringify({ location, ...report }));
}
