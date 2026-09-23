# TapTrack Attendance System

TapTrack is a Node.js, Express, and MySQL attendance system for Notre Dame of
Marbel University. It records university entrance attendance, event attendance,
library visits, and Internet Section visits through typed IDs, keyboard-wedge
RFID/barcode scanners, cameras, or supported NFC writers.

## Features

- Daily university entrance Time In and Time Out records
- Events with configurable audiences and scan limits
- Multiple scanning stations sharing live event attendance
- Library and Internet Section entrance kiosks
- Student and employee directories with Excel import/export and photo uploads
- NFC card enrollment that writes only the person's ID number
- Academic hierarchy and academic-period maintenance
- Role-based module permissions and activity auditing
- Excel exports for entrance logs, events, corrections, and person logs
- Optional institutional Google sign-in

## Requirements

- Node.js 20 or newer
- npm
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
| `NFC_WRITER_COMMAND`      | Executable for NFC read/write operations   |
| `NFC_WRITER_ARGS`         | JSON array of fixed executable arguments   |

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
| `/maintenance/employee`     | Employee directory and card enrollment        |
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
current and past events. Administrator and Superadmin can see all events. NFC
card enrollment controls are added to the page only for Administrator and
Superadmin users.

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

On Raspberry Pi OS/Linux, grant the service account input-device access, then
restart its session:

```bash
sudo usermod -aG input "$USER"
```

Without the helper, a focused keyboard-wedge reader or camera can still scan,
but the browser cannot distinguish two identical keyboard devices.

## NFC card enrollment

TapTrack writes only the exact database identifier as plain text:

- College student: `2026123` or `20261234`
- Elementary/JHS/SHS student: 12-digit LRN
- Employee: `P2026123` or `P20261234`

No name, course, department, or JSON metadata is stored. TapTrack requires a
card read before writing and verifies the value after writing.

The included ACR122U helper assumes blank, initialized NTAG213-compatible Type
2 cards and requires Python with `pyscard`. Confirm the exact card technology
before deployment; 13.56 MHz is a frequency, not a memory format.

Raspberry Pi OS/Linux example:

```dotenv
NFC_WRITER_COMMAND=/usr/bin/python3
NFC_WRITER_ARGS=["/absolute/path/to/Attendance System/scanner/acr122u-ntag213.py"]
```

Windows example:

```dotenv
NFC_WRITER_COMMAND=C:\Python312\python.exe
NFC_WRITER_ARGS=["C:\\TapTrack\\scanner\\acr122u-ntag213.py"]
```

`NFC_WRITER_ARGS` must be valid JSON. TapTrack starts the command without a
shell, invokes it with `--read` or `--write`, sends the identifier through
standard input while writing, and expects a final JSON response line. See
`scanner/nfc-writer.js` and `scanner/acr122u-ntag213.py` for the protocol.

Do not permanently lock cards until the card model, layout, recovery process,
and replacement workflow have been tested.

### NFC writer on a client PC

Install this project, Node.js, Python, pyscard, and the NFC reader driver on
each enrollment PC. Configure that PC's .env with its local Python command,
the included helper path, and the exact central TapTrack URL:

\`\`\`dotenv
NFC_WRITER_COMMAND=C:\\Python312\\python.exe
NFC_WRITER_ARGS=["C:\\\\TapTrack\\\\scanner\\\\acr122u-ntag213.py"]
NFC_BRIDGE_PORT=47831
NFC_BRIDGE_ALLOWED_ORIGINS=http://192.168.1.10:4000
\`\`\`

Start the local bridge on that client PC before opening card enrollment:

\`\`\`powershell
npm run nfc-bridge
\`\`\`

The bridge listens only on 127.0.0.1; it is not exposed to other network
devices. Add every exact server URL users may open (comma-separated) to
NFC_BRIDGE_ALLOWED_ORIGINS.

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
- Test scanners and NFC cards on the production Windows or Raspberry Pi host.
- Verify the Google OAuth callback before enabling institutional sign-in.

## npm commands

```bash
npm run dev   # development server using Node watch mode
npm start     # production server
npm test      # security regression tests
npm run check # syntax-check all JavaScript files
```
