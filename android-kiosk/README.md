# TapTrack Android Entrance Kiosk

A focused Android kiosk for University Entrance attendance. It records scans
through the existing TapTrack server and deliberately has no recent-scans list.

## Included

- Typed IDs and USB/Bluetooth keyboard-wedge scanners
- Camera barcode scanning
- Native NFC scanning on Android devices with NFC hardware
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

## Native NFC cards

The app reads the same NTAG213/Type 2 card layout used by TapTrack enrollment:
the plain ID stored in pages 4–7. It also accepts a standard NDEF text record
containing a valid TapTrack ID, which supports enrolled NTAG215 cards. Enable
NFC in Android Settings, then tap the card against the phone or tablet. No USB
NFC reader or client bridge is needed.
