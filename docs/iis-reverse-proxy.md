# IIS reverse proxy beside the Credentials Dispenser

TapTrack is published from the existing IIS site at:

```text
http://SERVER-IP/attendance-system/
```

The Credentials Dispenser keeps its existing routes. Only URLs beginning with
`/attendance-system` are forwarded to TapTrack on `127.0.0.1:4000`.

## Prerequisites

Install IIS URL Rewrite 2.1 and Application Request Routing (ARR) 3. In IIS
Manager, select the server, open **Application Request Routing Cache**, choose
**Server Proxy Settings**, enable **Proxy**, and apply the change.

## Merge the rules into the shared IIS site

Do not change the existing site's physical path to the TapTrack repository.
Open the `web.config` used by the site that already hosts the Credentials
Dispenser and merge the two rules from TapTrack's `web.config` into its
`configuration/system.webServer/rewrite/rules` element.

Place the TapTrack rules before a dispenser catch-all rule. Do not add a
`<clear />` element because that would remove the dispenser's rules.

The resulting rule order should be:

1. `TapTrack canonical application path`
2. `TapTrack prefixed reverse proxy`
3. Existing Credentials Dispenser rules

## TapTrack environment

Run TapTrack separately as a Node.js process and configure:

```dotenv
NODE_ENV=production
PORT=4000
PUBLIC_BASE_PATH=/attendance-system
ALLOW_INSECURE_HTTP=true
```

Use `ALLOW_INSECURE_HTTP=true` only for a plain-HTTP isolated LAN. Prefer an
IIS HTTPS binding for production. Do not expose port 4000 through the firewall;
only IIS should connect to it.

If Google sign-in is enabled, configure its public callback as:

```dotenv
GOOGLE_REDIRECT_URI=https://SERVER-IP/attendance-system/api/auth/google/callback
```

After starting TapTrack, verify both applications independently:

```text
http://SERVER-IP/attendance-system/
http://SERVER-IP/<existing-dispenser-path>
```
