# TapTrack Attendance

Express + Node.js + MySQL attendance for keyboard/HID NFC and barcode readers.

```bash
mysql -u root -p < database.sql
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`. Configure each reader to send Enter after the scanned value. Student and employee directories and attendance logs are stored separately in `students`, `employees`, `student_attendance`, and `employee_attendance`.

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
