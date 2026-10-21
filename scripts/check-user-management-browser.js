// Verify the actual user-management page without using application accounts.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
for (const mode of ["success", "failure"]) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "taptrack-user-management-"));
  let page = read("client/user/user_management/index.html").replace(/<link[^>]*>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
  const fixture = `<script>
    const errors=[],toasts=[],requests=[];
    window.addEventListener('error',event=>errors.push(event.message));
    window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
    const escapeFixture=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
    window.TapTrack={
      $:selector=>document.querySelector(selector),escapeHtml:escapeFixture,
      personCell:person=>'<span>'+escapeFixture(person.name)+'</span>',
      emptyRow:(count,text)=>'<tr><td colspan="'+count+'">'+escapeFixture(text)+'</td></tr>',
      initDataTable:async()=>{},destroyDataTable:()=>{},toast:message=>toasts.push(message),
      init:async()=>({user:{role:'Administrator'}}),
      api:async(url)=>{
        requests.push(url);
        if(url==='/api/users')return[{id:7,fullName:'Fixture Staff',firstName:'Fixture',lastName:'Staff',username:'fixture',role:'Staff',permissionId:3,isActive:true}];
        if(url==='/api/user/permission-options'){
          if('${mode}'==='failure')throw Error('Fixture unavailable');
          return[{id:3,name:'Staff',isActive:true},{id:4,name:'Card Enrollment',isActive:true}];
        }
        throw Error('Unexpected request: '+url);
      }
    };
  </script>`;
  const check = `<pre id="report"></pre><script>
    const expect=(condition,message)=>{if(!condition)throw Error(message)};
    setTimeout(()=>{try{
      expect(errors.length===0,'Unhandled startup error: '+errors.join(','));
      expect(!requests.includes('/api/permissions'),'User management requested Superadmin-only permissions');
      if('${mode}'==='success'){
        expect(document.querySelector('#body').textContent.includes('Fixture Staff'),'Administrator could not load users');
        expect(!document.querySelector('#addBtn').disabled,'Add user remained disabled');
        document.querySelector('#addBtn').click();
        expect(document.querySelector('#dialog').open,'Add user did not open');
        const options=[...document.querySelector('#role').options].map(option=>option.textContent);
        expect(options.includes('Staff')&&options.includes('Card Enrollment'),'Assignable permissions did not load');
        expect(!options.includes('Superadmin')&&!options.includes('Administrator'),'Protected roles were offered');
      }else{
        expect(document.querySelector('#addBtn').disabled,'An unloaded form was available');
        expect(document.querySelector('#body').textContent.includes('could not be loaded'),'Startup failure not shown');
        expect(toasts.includes('Fixture unavailable'),'Startup failure not reported');
      }
      document.querySelector('#report').textContent=JSON.stringify({mode:'${mode}',administratorPage:true,assignableOptions:true,errorsHandled:true});
    }catch(error){document.querySelector('#report').textContent=JSON.stringify({error:error.stack})}},80);
  </script>`;
  page = page.replace("</body>", () => `${fixture}<script>${read("client/user/user_management/script.js")}</script>${check}</body>`);
  const file = path.join(directory, "check.html");
  fs.writeFileSync(file, page);
  const result = spawnSync(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless", "--no-sandbox", "--disable-gpu", "--in-process-gpu", "--no-first-run", "--disable-background-networking",
    `--user-data-dir=${path.join(directory, "profile")}`, "--virtual-time-budget=1500", "--dump-dom", pathToFileURL(file).href,
  ], { windowsHide: true, encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  const match = result.stdout.match(/<pre id="report">([^<]+)<\/pre>/);
  assert.ok(match, `No user-management ${mode} browser report`);
  const report = JSON.parse(match[1]);
  assert.equal(report.error, undefined, report.error);
  console.log(JSON.stringify(report));
}
