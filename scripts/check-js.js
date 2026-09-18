const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ignored = new Set([".git", "node_modules"]);
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(target);
  }
}
walk(process.cwd());
const failures = files.filter(
  (file) =>
    spawnSync(process.execPath, ["--check", file], { stdio: "inherit" })
      .status !== 0,
);
if (failures.length) process.exitCode = 1;
else console.log(`Checked ${files.length} JavaScript files.`);
