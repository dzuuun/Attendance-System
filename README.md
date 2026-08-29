# TapTrack Attendance

Express + Node.js + MySQL attendance for keyboard/HID NFC and barcode readers.

## Production database

TapTrack uses **MySQL 8.0 or newer** in production through the `mysql2` Node.js driver. The installation script creates the `attendance_system` database with the `utf8` character set and `utf8_general_ci` collation. MariaDB is not the production target.

Configure the production connection through `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `.env`. Use a dedicated MySQL account with access only to the TapTrack database.

```bash
mysql -u root -p < database.sql
cp .env.example .env
npm install
npm run dev
```

For phpMyAdmin or a hosting control panel, select an empty database and import `database.sql`. Open `http://localhost:4000/setup` after import to create the first administrator. Configure each reader to send Enter after the scanned value. Student and employee directories, university entrance logs, event attendance, library entrance logs, and Internet Section logs are stored separately.

## Two-scanner kiosk

The public kiosk supports two ordinary keyboard-wedge scanners without requiring prefixes. A local reader identifies which physical scanner supplied each ID:

- **Windows:** uses the Windows Raw Input API through the included PowerShell helper.
- **Raspberry Pi OS/Linux:** reads each scanner separately through `/dev/input/event*`.

On `/kiosk/entrance`, select **Assign** beside Time In and scan a card with the Time In device. Repeat for Time Out. Hardware mappings are stored locally in that kiosk terminal's browser and load without a user session.

On Raspberry Pi OS, give the account running Node access to input devices, then restart the session:

```bash
sudo usermod -aG input "$USER"
```

Identical scanners without serial numbers are identified by their physical USB paths. Keep each scanner connected to the same USB port.

## Attendance modes

- **University entrance** — everyday attendance. The assigned physical scanner records Time In or Time Out, and each person's state starts fresh each day.
- **Special event** — an administrator defines the event duration and the maximum Time In/Time Out scans allowed per attendee. Operators select the event at the scanner; records are isolated from daily entrance attendance and other events.

Open `/setup` after the first database import to create the initial administrator. Setup disables itself once an account exists.
