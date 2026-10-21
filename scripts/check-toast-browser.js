// A headless browser check; never uses the user's Chrome profile or app account.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawnSync } = require("child_process");
const assert = require("assert/strict");

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "taptrack-toast-check-"));
try {
  const source = fs.readFileSync(path.join(__dirname, "../client/shared-ui.js"), "utf8");
  const start = source.indexOf("  function toast(");
  const end = source.indexOf("  function toastAfterReload(", start);
  assert.ok(start >= 0 && end > start);
  const css = fs.readFileSync(path.join(__dirname, "../client/page-shell.css"), "utf8");
  const html = `<!doctype html><meta charset="utf-8"><style>${css}</style>
    <dialog id="modal"><h2>Enrollment dialog</h2><button id="inside">Read card</button></dialog><pre id="report"></pre>
    <script>${source.slice(start, end)}
    document.querySelector('#modal').showModal();
    document.querySelector('#inside').focus();
    toast('Outside the modal', 'error');
    setTimeout(() => {
      const container = document.querySelector('#toastContainer');
      const button = container.querySelector('button');
      const bounds = button.getBoundingClientRect();
      const toastBounds = container.getBoundingClientRect();
      const modalBounds = document.querySelector('#modal').getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      const report = {
        outside: toastBounds.bottom < modalBounds.top || toastBounds.left > modalBounds.right || toastBounds.top > modalBounds.bottom || toastBounds.right < modalBounds.left,
        topLayer: container.matches(':popover-open'),
        top: Math.round(container.getBoundingClientRect().top),
        clickable: !!hit?.closest('#toastContainer'),
        modalOpen: document.querySelector('#modal').open,
        focusPreserved: document.activeElement.id === 'inside',
      };
      document.querySelector('#modal').close();
      setTimeout(() => {
        report.survivesModalClose = container.parentElement === document.body && container.matches(':popover-open');
        button.click();
        setTimeout(() => {
          report.dismissed = !container.childElementCount && !container.matches(':popover-open');
          document.querySelector('#report').textContent = JSON.stringify(report);
        }, 220);
      }, 20);
    }, 100);
    </script>`;
  const file = path.join(directory, "check.html");
  fs.writeFileSync(file, html);
  const result = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--in-process-gpu", "--no-first-run", "--disable-background-networking",
    `--user-data-dir=${path.join(directory, "profile")}`, "--window-size=1280,900", "--virtual-time-budget=1000", "--dump-dom", pathToFileURL(file).href],
  { windowsHide: true, encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  const match = result.stdout.match(/<pre id="report">([^<]+)<\/pre>/);
  assert.ok(match, "Browser did not return a toast report");
  const report = JSON.parse(match[1]);
  console.log(JSON.stringify(report));
  assert.deepEqual(report, { outside: true, topLayer: true, top: 22, clickable: true, modalOpen: true, focusPreserved: true, survivesModalClose: true, dismissed: true });
} finally {
  const resolved = path.resolve(directory);
  const tempRoot = path.resolve(os.tmpdir()) + path.sep;
  if (resolved.startsWith(tempRoot) && path.basename(resolved).startsWith("taptrack-toast-check-"))
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
