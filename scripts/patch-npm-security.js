// Temporary fix for CVE-2026-111997 in npm 11.21.1's bundled ip-address.
// Run with write access to the npm installation; see the dated security report.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function patch() {
  const inferredRoot = process.env.npm_execpath
    ? path.resolve(path.dirname(process.env.npm_execpath), "..")
    : path.join(path.dirname(process.execPath), "node_modules/npm");
  const npmRoot = fs.realpathSync(process.argv[2] || inferredRoot);
  const manifest = (directory) =>
    JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  const semver = require(path.join(npmRoot, "node_modules/semver"));
  if (manifest(npmRoot).name !== "npm" ||
      !semver.satisfies(manifest(npmRoot).version, ">=11.21.1 <12"))
    throw new Error("Update npm to 11.21.1 before applying this npm 11 patch.");

  const socks = path.dirname(require.resolve("socks/package.json", { paths: [npmRoot] }));
  const target = fs.realpathSync(path.dirname(
    require.resolve("ip-address/package.json", { paths: [socks] }),
  ));
  if (!target.startsWith(npmRoot + path.sep) || manifest(target).name !== "ip-address")
    throw new Error("The resolved library is outside this npm installation.");
  const previous = manifest(target).version;
  if (semver.gte(previous, "10.7.4")) {
    console.log(`npm's ip-address ${previous} already includes this fix.`);
    return;
  }
  if (!semver.satisfies(previous, "10.x"))
    throw new Error("This patch supports npm's ip-address 10.x dependency only.");

  const replacement = `${target}.patched-${process.pid}`;
  const backup = `${target}.backup-${process.pid}`;
  if (fs.existsSync(replacement) || fs.existsSync(backup))
    throw new Error("A previous library replacement must be reviewed first.");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "taptrack-npm-security-"));
  let backedUp = false;
  try {
    execFileSync(process.execPath, [
      path.join(npmRoot, "bin/npm-cli.js"), "install", "--prefix", temporary,
      "ip-address@10.7.4", "--registry=https://registry.npmjs.org",
      "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false",
    ], { stdio: "inherit" });
    const downloaded = path.join(temporary, "node_modules/ip-address");
    if (manifest(downloaded).name !== "ip-address" || manifest(downloaded).version !== "10.7.4")
      throw new Error("The downloaded package did not match the security patch.");
    fs.cpSync(downloaded, replacement, { recursive: true, errorOnExist: true, force: false });
    fs.renameSync(target, backup);
    backedUp = true;
    fs.renameSync(replacement, target);
    const { Address4, Address6 } = require(target);
    if (!Address4.isValid("192.0.2.1") || !Address6.isValid("2001:db8::1") ||
        Address6.isValid("%".repeat(100000) + "\n"))
      throw new Error("Patched IP address validation failed.");
    backedUp = false;
    fs.rmSync(backup, { recursive: true, force: true });
    console.log(`Patched npm's ip-address ${previous} to 10.7.4.`);
  } catch (error) {
    if (backedUp) {
      fs.rmSync(target, { recursive: true, force: true });
      fs.renameSync(backup, target);
    }
    throw error;
  } finally {
    fs.rmSync(replacement, { recursive: true, force: true });
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  patch();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
