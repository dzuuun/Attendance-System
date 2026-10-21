// Verify recovery from another kiosk's cookie using fake replies and isolated profiles.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "taptrack-kiosk-pairing-"));
const source = fs.readFileSync(path.join(__dirname, "../client/kiosk-pairing.js"), "utf8");
for (const mode of ["entrance", "library", "internet-section"]) {
  const expectedId = mode === "entrance" ? "entrance-device-12345678" : "library-device-12345678";
  const html = `<!doctype html><meta charset="utf-8"><form id="kioskForm"><input id="kioskInput"></form><pre id="report"></pre><script>
  // Model the deployed HTTP origin while loading this fixture from a local file.
  window.testLocation={href:'https://taptrack.test/kiosk/${mode}',origin:'https://taptrack.test',pathname:'/kiosk/${mode}'};
  localStorage.setItem('taptrack_kiosk_id','entrance-device-12345678');
  localStorage.setItem('taptrack_library_kiosk_id','library-device-12345678');
  let paired=false,pairs=0,scans=0,disabled=false;const urls=[];
  window.fetch=async(url,options={})=>{
    urls.push(String(url));
    if(String(url).startsWith('/api/kiosk/pair')){paired=true;pairs++;return new Response(JSON.stringify({verified:true}),{status:200})}
    if(String(url).endsWith('/scan'))scans++;
    if(disabled)return new Response(JSON.stringify({message:'This kiosk has been disabled by central management.'}),{status:403});
    if(!paired)return new Response(JSON.stringify({message:'This enrollment belongs to another kiosk.'}),{status:403});
    return new Response(JSON.stringify({enabled:true}),{status:200});
  };
  </script><script>${source.replaceAll("location.", "window.testLocation.")}</script><script>
  const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
  (async()=>{try{
    const navigationBlocked=!document.querySelector('#kioskForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    if(!navigationBlocked)throw Error('HID Enter can navigate the kiosk form');
    const heartbeat=fetch('/api/kiosk/heartbeat',{method:'POST',body:JSON.stringify({kioskId:window.taptrackKioskId})});
    const scan=fetch('/api/library-kiosk/library/scan',{method:'POST',body:JSON.stringify({kioskId:window.taptrackKioskId,idNumber:'00012345'})});
    await pause();
    const form=document.querySelector('.kiosk-verification-card');
    if(!form)throw Error('Missing kiosk verification prompt');
    form.elements.username.value='test-superadmin';form.elements.password.value='test-only-password';form.requestSubmit();
    const [heartResult,scanResult]=await Promise.all([heartbeat,scan]);
    await fetch('/api/library-kiosk/library/scans');
    const queryUrl=urls.find(url=>url.includes('/scans?'));
    disabled=true;const disabledResult=await fetch('/api/kiosk/heartbeat',{method:'POST',body:JSON.stringify({kioskId:window.taptrackKioskId})});
    document.querySelector('#report').textContent=JSON.stringify({id:window.taptrackKioskId,pairs,scans,heartbeatStatus:heartResult.status,scanStatus:scanResult.status,queryId:new URL(queryUrl,location.href).searchParams.get('kioskId'),disabledStatus:disabledResult.status,extraPrompt:!!document.querySelector('.kiosk-verification-card')});
  }catch(error){document.querySelector('#report').textContent=JSON.stringify({error:error.stack})}})();
  </script>`;
  const folder = path.join(directory, "kiosk");
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${mode}.html`);
  fs.writeFileSync(file, html);
  const result = spawnSync(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless", "--no-sandbox", "--disable-gpu", "--in-process-gpu", "--no-first-run", "--disable-background-networking",
    `--user-data-dir=${path.join(directory, mode + "-profile")}`, "--virtual-time-budget=1500", "--dump-dom", pathToFileURL(file).href,
  ], { windowsHide: true, encoding: "utf8", timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
  if (result.error) throw result.error;
  const match = result.stdout.match(/<pre id="report">([^<]+)<\/pre>/);
  assert.ok(match, "No pairing browser report");
  const report = JSON.parse(match[1]);
  assert.equal(report.error, undefined, report.error);
  assert.deepEqual(report, { id: expectedId, pairs: 1, scans: 1, heartbeatStatus: 200, scanStatus: 409, queryId: expectedId, disabledStatus: 403, extraPrompt: false });
  console.log(JSON.stringify({ mode, ...report }));
}
