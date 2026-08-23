# TapTrack Attendance

Express + Node.js + MySQL attendance for keyboard/HID NFC and barcode readers.

```bash
mysql -u root -p < database.sql
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`. Configure the reader to send Enter after the scanned value. The database has separate `students` and `employees` tables, plus an `attendance` scan log.

Open `/setup` after the first database import to create the initial administrator. Setup disables itself once an account exists.
