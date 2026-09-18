# Kiosk control agent

Install this optional local companion on each managed computer to enable central browser restart, reboot, and shutdown. A browser kiosk alone can report its status and reload/navigate, but it cannot control the operating system.

Set these environment variables and run `node scanner/kiosk-control-agent.js`:

```powershell
$env:KIOSK_SERVER='https://taptrack.example.edu'
$env:KIOSK_ID='the kiosk ID shown in Kiosk management'
$env:KIOSK_TYPE='entrance'
$env:KIOSK_SUPERADMIN_USERNAME='superadmin username (first run only)'
$env:KIOSK_SUPERADMIN_PASSWORD='superadmin password (first run only)'
$env:KIOSK_LOCATION='Gate 1 — Main Campus'
node scanner/kiosk-control-agent.js
```

On its first run, the agent exchanges those credentials for a device-bound
session saved in `scanner/.kiosk-session.json`. Remove the two credential
environment variables after enrollment; later runs reuse the saved session.

For persistent operation, configure it as a Windows Task Scheduler task or a system service. The agent reports hostname, IP, MAC address, and uptime. Its MAC address lets the central dashboard send Wake-on-LAN magic packets; Wake-on-LAN must also be enabled in the kiosk BIOS and network adapter.
