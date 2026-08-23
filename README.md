# TapTrack Attendance

Express + Node.js + MySQL attendance for keyboard/HID NFC and barcode readers.

```bash
mysql -u root -p < database.sql
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`. Configure the reader to send Enter after the scanned value. Student and employee directories and attendance logs are stored separately in `students`, `employees`, `student_attendance`, and `employee_attendance`.

## Attendance modes

- **University entrance** — everyday attendance. Each person's scans alternate between Time In and Time Out, and their state starts fresh each day.
- **Special event** — an administrator defines the event duration and the maximum Time In/Time Out scans allowed per attendee. Operators select the event at the scanner; records are isolated from daily entrance attendance and other events.

Open `/setup` after the first database import to create the initial administrator. Setup disables itself once an account exists.
