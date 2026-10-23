# Technology security review - 23 October 2026

This review checked the installed runtime, application lockfile, npm's bundled
libraries, Android runtime dependencies, and the configured database version.
Advisory results describe known vulnerabilities at the review date; they do not
establish whether a system has been attacked or compromised.

## Applied changes

- Updated this computer's system-wide Node.js from 24.14.0 to 24.22.1. The
  official Windows installer and validation runtime were checked against the
  published SHA256 hashes; the installer had a valid OpenJS Foundation signature.
  This addresses the October 21 security release, including CVE-2026-111497.
- Updated the installed npm CLI from 11.9.0 to 11.21.1 to replace vulnerable
  bundled tar, HTTP-cache, glob, and HTTP-client libraries.
- Patched npm's bundled ip-address from 10.7.2 to 10.7.4 for CVE-2026-111997.
  npm 11.21.1 and 12.2.1 still bundle the affected version. This is a local
  dependency patch, not a change included in npm 11.21.1 upstream.
- Removed unused Nodemon. Both server commands already use Node directly,
  including built-in watch mode for development. The initial Nodemon 1.19.4
  dependency tree had 14 npm audit findings; updating Nodemon alone retained
  the unpatched braces vulnerability. Removal eliminates that dependency tree.
- Added Node.js and npm minimum versions to package.json, engine-strict to
  .npmrc, and the reviewed Node.js version to .nvmrc. Updated the lockfile.

## Apply on another application server

Install the official Node.js 24.22.1 release, or a newer patched 24.x release.
Then run, with write access to the npm installation:

```text
npm install --global npm@11.21.1
node scripts/patch-npm-security.js
npm ci
npm audit
npm test
npm run check
```

On Windows, use an Administrator PowerShell for the system-wide npm update
and patch. For a custom npm location, pass its package directory explicitly:

```powershell
node scripts/patch-npm-security.js "C:/Program Files/nodejs/node_modules/npm"
```

The patch script downloads only ip-address 10.7.4 through npm's normal integrity
verification, disables package scripts, verifies the package and IP parsing,
and restores the previous library if replacement fails. Reinstalling npm can
restore the vulnerable bundled version; reapply the patch until an upstream
npm release includes ip-address 10.7.4 or newer. Review this workaround again
when moving to another npm release line.

Restart any existing application processes after updating Node.js. Updating
files on disk does not replace the runtime inside an already running process.

## Database update still required

The configured database is XAMPP's MariaDB 10.4.24, not MySQL 8. MariaDB 10.4
has been unsupported since 18 June 2024, and 10.4.24 predates later security
fixes in the same release line. The local instance contains 17 application
databases, so a replacement affects applications beyond TapTrack.

No database binaries, configuration, schemas, or records were changed by this
review. A database upgrade requires the owners and dependencies of the shared
instance to be identified first. Prepare and restore-test full backups,
including users, grants, routines, triggers, and events; validate TapTrack and
the other applications against an isolated, currently patched supported
MariaDB LTS instance; then schedule the cutover with rollback available. Do not
overwrite XAMPP's binaries or reuse its live data directory with a new major
version as an untested replacement.

## Advisory verification and application checks

- Application npm audit: zero reported vulnerabilities after removal of Nodemon.
- Installed npm: 143 bundled library versions checked against OSV after the
  CLI update and ip-address patch; no findings.
- Android: 33 resolved runtime artifacts checked against OSV; no findings.
- OSV application scan: 188 locked packages checked. Two SheetJS entries were
  reviewed against the primary advisory version ranges. They affect versions
  below 0.19.3 and 0.20.2 respectively; this project uses 0.20.3 from the official
  SheetJS CDN and is outside both affected ranges. No additional applicable
  application advisories were found in that check.
- Application verification on Node.js 24.22.1: 79 tests and all seven isolated
  browser scripts passed. Syntax checks passed for all 145 JavaScript files.

## Sources

- [Node.js October 21 security advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Node.js 24.22.1 release and published hashes](https://nodejs.org/en/blog/release/v24.22.1)
- [npm 11.21.1 release](https://github.com/npm/cli/releases/tag/v11.21.1)
- [Unpatched braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- [ip-address advisory and fixed version](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5)
- [MariaDB maintenance policy](https://mariadb.org/about/)
- [MariaDB security fixes](https://mariadb.com/docs/server/security/cve/community-server)
- [SheetJS prototype pollution affected versions](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
- [SheetJS ReDoS affected versions](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)
