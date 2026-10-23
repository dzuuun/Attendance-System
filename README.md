# TapTrack Attendance System

TapTrack is a Node.js, Express, and MySQL attendance system for Notre Dame of
Marbel University. It records university entrance attendance, event attendance,
library visits, and Internet Section visits through typed IDs, keyboard-wedge
RFID/barcode scanners and cameras.

## Features

- Daily university entrance Time In and Time Out records
- Events with configurable audiences and scan limits
- Multiple scanning stations sharing live event attendance
- Library and Internet Section entrance kiosks
- Student and employee directories with Excel import/export and photo uploads
- Card enrollment for students, employees, and alumni using a keyboard-style HID reader
- Academic hierarchy and academic-period maintenance
- Role-based module permissions and activity auditing
- Excel exports for entrance logs, events, corrections, and person logs
- Optional institutional Google sign-in

## Requirements

- Node.js 24 LTS, version 24.22.1 or newer within the 24.x line
- npm 11.21.1 or newer within the 11.x line
- MySQL 8.0 or newer
- A modern browser such as Chrome or Edge

TapTrack targets MySQL in production through the `mysql2` driver. The supplied
schema creates `attendance_system` using `utf8` and `utf8_general_ci`.

## Installation

```bash
npm ci
mysql -u root -p < database.sql
cp .env.example .env
npm run dev
```

Then open `http://localhost:4000/setup` and create the first administrator.
Setup disables itself after the first account is created. The database script
does not contain a default user or password.

For phpMyAdmin or a hosting control panel, import `database.sql`. The script
creates and selects the `attendance_system` database.

For production, use:

```bash
npm start
```

Run the application behind an HTTPS reverse proxy and a process manager.

For IIS with Application Request Routing, the included `web.config` publishes
the application at `http://SERVER-IP/attendance-system/`. See
[docs/iis-reverse-proxy.md](docs/iis-reverse-proxy.md) for the required IIS
modules and setup steps.

When certificate settings are configured directly in TapTrack, the application
serves HTTP on `PORT` and HTTPS on `HTTPS_PORT` simultaneously. Use HTTPS for
camera scanning because browsers block camera access from LAN HTTP origins.

## Environment variables

| Variable                  | Purpose                                    |
| ------------------------- | ------------------------------------------ |
| `PORT`                    | HTTP port; defaults to `4000`              |
| `HTTPS_PORT`              | HTTPS port; defaults to `4443`             |
| `DB_HOST`                 | MySQL server hostname                      |
| `DB_PORT`                 | MySQL port; defaults to `3306`             |
| `DB_USER`                 | MySQL account                              |
| `DB_PASSWORD`             | MySQL password                             |
| `DB_NAME`                 | Database; defaults to `attendance_system`  |
| `JWT_SECRET`              | 32+ character secret used to sign sessions |
| `GOOGLE_CLIENT_ID`        | Optional Google OAuth client ID            |
| `GOOGLE_CLIENT_SECRET`    | Optional Google OAuth client secret        |
| `GOOGLE_WORKSPACE_DOMAIN` | Allowed institutional Google domain        |
| `GOOGLE_REDIRECT_URI`     | Google OAuth callback URL                  |

Minimal local configuration:

```dotenv
PORT=4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=attendance_system
JWT_SECRET=replace-with-a-long-random-secret
```

## Main pages

| Path                        | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `/`                         | Public landing page                           |
| `/login`                    | Staff sign-in                                 |
| `/setup`                    | One-time administrator setup                  |
| `/overview`                 | Current-day university entrance overview      |
| `/attendance`               | University entrance logs and previous periods |
| `/events`                   | Events in the current academic period         |
| `/events/past`              | Past events by selected academic period       |
| `/library/entrance`         | Library entrance logs                         |
| `/library/internet-section` | Internet Section entrance logs                |
| `/maintenance/student`      | Student directory and card enrollment         |
| `/maintenance/employee`     | Employee directory        |
| `/user/permissions`         | Permission management                         |
| `/user/activity-log`        | Newest-first activity log                     |

Public kiosks:

- `/kiosk/entrance`
- `/kiosk/library`
- `/kiosk/internet-section`

The first time a kiosk browser is opened, it asks a Superadmin to verify the
device. Successful verification is stored as a secure, device-bound cookie that
is renewed while the kiosk is used, so succeeding visits do not ask for the password. Clearing the
browser's cookies or local storage makes it a new kiosk and requires verification.

In production, apply `database.sql` during deployment and use a database account
without schema-changing privileges. Runtime DDL is disabled unless
`ALLOW_RUNTIME_DDL=true` is explicitly configured.

## Permissions

User roles can receive access to these modules:

- Overview
- Attendance
- Events
- Library
- Maintenance
- User & Access

Student and Employee pages are both controlled by **Maintenance** access. There
is no separate directory-access permission. Maintenance users can access both
directories and their supporting academic records.

Events are tied to the account that created them. Event users see their own
current and past events. Administrator and Superadmin can see all events.

## Attendance behavior

### University entrance

University entrance attendance is separate from event attendance. Automatic
Time In/Time Out state starts fresh each calendar day. The Attendance page can
load earlier academic periods. Its Excel filename includes the export date.

### Events

Each event defines its schedule, accepted audience, maximum Time In scans, and
optional Time Out limit. Several terminals can scan the same event and recent
attendees refresh across stations.

Event owners can rectify a scan by updating its action/time or deleting it with
a required reason. Corrections remain in the audit history.

Event exports include attendance and corrections. Student rows use program,
department, and college codes. Employee rows use the department code. If both
students and employees attended, they receive separate workbook sheets;
otherwise, the workbook contains one `Attendance` sheet.

## Scanner setup

### Keyboard-wedge readers

A keyboard-wedge RFID or barcode scanner can type into the focused ID field.
Configure it to append Enter after every scanned value.

### Two-scanner university kiosk

The university kiosk supports one Time In scanner and one Time Out scanner on
the same terminal:

- Windows uses the included Raw Input PowerShell helper.
- Raspberry Pi OS/Linux uses the included evdev reader.

Assign the devices from `/kiosk/entrance`. The mapping is stored in that
terminal's browser and remains available without a signed-in user. Keep
identical scanners connected to the same USB ports.

Scanner changes require confirmation; Enter from a reader cannot save them.
Use **Clear** to remove incorrect mappings. If both slots are occupied,
**Replace scanners** lets the next physical reader replace that direction's
existing mappings. Assignment success is displayed as settings saved and does
not create an attendance record.

When only Time In scanners are assigned, entrance input records Time In only;
Time Out assignments work the same way. Repeated scans never switch direction.
This also applies if a keyboard scan arrives before the scanner bridge event or
the event stream disconnects. With both directions assigned, a short recovery
lookup identifies delayed reader events and preserves their assigned direction.
Unidentified input never chooses a direction automatically. Select Record for
deliberate manual entry.

On Raspberry Pi OS/Linux, grant the service account input-device access, then
restart its session:

```bash
sudo usermod -aG input "$USER"
```

Without the helper, a focused keyboard-wedge reader or camera can still scan,
but the browser cannot distinguish two identical keyboard devices.

## Card enrollment

To delegate enrollment, assign the **Card Enrollment** permission to the operator's account under User management. It grants only the Enroll card page, lookup of students, employees, and alumni, and card enrollment. It does not grant student editing, exports, attendance logs, or other maintenance areas. Custom permissions can select **Card enrollment only** under Maintenance, with all other access switched off.

Existing production databases must apply `docs/migrate-card-enrollment-permission.sql` and `docs/migrate-employee-alumni-card-id.sql` once before deploying this access option.

For an existing production database, apply `docs/migrate-student-card-id.sql` once before deploying. New databases include the column in `database.sql`.

Open **Enroll card** to browse the people list with profile photos and enrolled-card status. The table uses the same sorting and pagination controls as the other directories, showing 10 people per page. Optionally filter by ID, name, Students, Employees, or Alumni. Select **Enroll card** for the matching person, tap the card on the HID reader, then select **Save card** and confirm. The reader's Enter key is suppressed. The table shows whether a card is enrolled. Each student, employee, and alumni record enrolls its own physical card, and a card cannot be assigned to another record. Alumni card IDs are stored independently of their former student cards. Attendance accepts enrolled card IDs and existing ID numbers.

The Students directory also keeps its **Enroll card** action and enrolled-card indicator.

Entrance, Library, Internet Section, and event scan stations accept either an official ID number or an enrolled card number. Card numbers retain their leading zeroes. Both identifiers resolve to the same person and attendance logs retain the official ID number. Alumni enroll their own separate physical card.

## Imports, photos, and backups

### SQL Server student import

Administrators can select **Import SQL Server** on the Students page to preview and synchronize enrolled registrar records for a school year and semester. The import creates new students, updates matching student IDs, and—after an explicit confirmation—deactivates active local students missing from that source term. Configure the `MSSQL_*` variables in `.env` and use a least-privilege read-only account. The expected view shape and a starter view are in [docs/mssql-student-import-view.sql](docs/mssql-student-import-view.sql).

Student and employee records can be imported from Excel. Download the template
from the appropriate directory so its codes match the academic hierarchy.

Profile photos accept JPEG, PNG, and WebP. For bulk upload, name each image with
the corresponding ID number. Uploaded images are stored under
`uploads/profile-photos`.

Back up both MySQL and `uploads/profile-photos` regularly.

## Production checklist

- Use MySQL 8.0+ and a dedicated database account.
- Replace the development JWT secret with a long random value.
- Verify every new kiosk with a Superadmin account and review kiosk activity regularly.
- Serve TapTrack through HTTPS.
- Protect `.env` and uploaded profile photos.
- Confirm the current academic period before opening kiosks.
- Test scanners and cards on the production Windows or Raspberry Pi host.
- Verify the Google OAuth callback before enabling institutional sign-in.

## npm commands

```bash
npm run dev   # development server using Node watch mode
npm start     # production server
npm test      # security regression tests
npm run check # syntax-check all JavaScript files
```

Use the Node.js version in `.nvmrc` (or a newer patched 24.x release). The
minimum version includes the October 21, 2026 security fixes. Also update npm
with `npm install --global npm@11.21.1` after installing Node.js. npm rejects
older Node.js and npm versions through `engine-strict`; update both before
running `npm ci`.
For npm 11.21.1, also apply the temporary bundled-library security fix described
in [the October 23 security report](docs/security-updates-2026-10-23.md).
Development uses Node's built-in watch mode and does not require Nodemon.
Run `npm audit` when deploying dependency updates, and keep `package-lock.json`
with the application so deployments install the reviewed dependency versions.
