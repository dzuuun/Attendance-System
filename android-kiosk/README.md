# TapTrack Android Entrance Kiosk

A focused Android kiosk for University Entrance attendance. It records scans
through the existing TapTrack server and deliberately has no recent-scans list.

## Included

- Typed IDs and USB/Bluetooth keyboard-wedge scanners
- Built-in Android NFC scanning of the card's UID, without reading or writing card contents
- Camera barcode scanning
- Gate selection from TapTrack Maintenance > Gates
- Person name, ID, type, action, and timestamp after each scan
- Local duplicate-scan suppression and server-side duplicate protection
- HTTP support for an internal university-network deployment; HTTPS is still
  preferred whenever it is available

## Build and configure

1. Open the `android-kiosk` folder in Android Studio.
2. Let Android Studio download the declared Gradle dependencies.
3. Build and install the `app` variant on an Android tablet or phone.
4. In the app, tap **Server settings** and enter the university server URL,
   for example `http://172.18.130.103:4000` or `https://172.18.130.103:4443`.
5. On first use, a **Superadmin** must enter their username and password to
   authorize the device. The app retains the server-issued kiosk
   enrollment token, so this is not required again unless the device is
   disabled/revoked or pointed to another server.
6. Select the assigned gate. Gates are managed in TapTrack Maintenance.

The scanner must append Enter after its ID value. Each tablet retains its own
server URL and selected gate.

## Read card UIDs with Android

On an NFC-capable device, enable NFC in Android settings and keep the entrance
kiosk open. Tap a compatible card on the device's NFC antenna. The app reads
the UID, checks its enrolled card number through the kiosk attendance API, and
displays both values. The card must already be enrolled against
the appropriate student, employee, or alumni record.

Tap a card and the app reads its UID automatically. No HID matching dialog,
manual card-number entry, or per-card setup is required on Android.

The app sends the complete raw UID as `cardUid` to `POST /api/kiosk/scan`.
The server checks decimal HID representations (full UID or first/last four bytes,
in either byte order, including leading zeroes) against the card numbers already
enrolled in the students, employees, and alumni tables. It records attendance
only when exactly one active person's enrolled card matches, and returns the
stored card number for display. Unknown or ambiguous cards show an error; they
never open a manual input dialog or fall back to matching an official ID.

Install the updated APK and restart/deploy the updated attendance server together.
The raw-UID lookup requires the updated API. Existing card enrollments do not need
to be changed. USB/Bluetooth HID and manually entered official IDs continue to use
the existing exact ID/card lookup. Previous Android matching preferences are no
longer used.

A card held against the device is ignored until removed. The existing five-second
duplicate protection also applies after a successful attendance record. Remove
the card and tap again once the previous scan has finished saving. Cards without
a UID show an error instead of submitting an empty identifier.

NFC hardware is optional: devices without it can continue to use keyboard entry,
camera scanning, or a USB/Bluetooth HID reader. The physical card must be
compatible with the device's NFC radio. Scanning pauses when the app leaves the
foreground and does not submit scans while a settings or verification dialog is
open.

Implementation references: [Android reader mode](https://developer.android.com/reference/android/nfc/NfcAdapter#enableReaderMode(android.app.Activity,%20android.nfc.NfcAdapter.ReaderCallback,%20int,%20android.os.Bundle))
and [tag identifiers](https://developer.android.com/reference/android/nfc/Tag#getId()).
