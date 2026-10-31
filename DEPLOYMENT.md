# LOCATIUM zero-cost showcase deployment

The full 3.08 GB PostGIS database remains on the Windows PC. Vercel serves the
frontend and a Cloudflare Quick Tunnel forwards HTTPS traffic to only the Node
API on `127.0.0.1:3002`. PostgreSQL (`5432`) and ML (`8002`) are never exposed.

## Start the public showcase

Prerequisites:

- PostgreSQL is running locally with the complete `investmap` database.
- `backend/.env` contains the database URL and two different JWT secrets.
- Python and Node dependencies are installed.
- `cloudflared` and the authenticated Vercel CLI are on `PATH`.
- The `demo@locatium.app` investor was provisioned with `npm run db:bootstrap`.

From PowerShell at the repository root:

```powershell
.\ops\tunnel\Start-Locatium.ps1
```

The launcher:

1. verifies that PostgreSQL is local and ports are free;
2. starts ML and waits for its readiness endpoint;
3. starts the production-mode API on loopback;
4. creates an HTTPS Quick Tunnel to the API only;
5. updates Vercel's production `VITE_API_URL`, redeploys, and runs public smoke
   checks;
6. monitors the API and tunnel until the window is closed.

To test without changing Vercel:

```powershell
.\ops\tunnel\Start-Locatium.ps1 -SkipDeploy -NoMonitor
```

Stop background mode with:

```powershell
.\ops\tunnel\Stop-Locatium.ps1
```

## Availability

The Vercel URL remains `https://locatium-eta.vercel.app`. A Quick Tunnel gets a
new API hostname after each restart, and the launcher automatically rebuilds
Vercel with it. The showcase is reachable only while this PC, PostgreSQL, the
launcher, and the internet connection remain on.

For a stable API hostname, use a named Cloudflare Tunnel with a domain managed
in Cloudflare. The tunnel is free, but obtaining a domain may not be. A tunnel
cannot make a sleeping or powered-off PC always available.

For placement days:

- connect the PC to power and Ethernet when possible;
- disable sleep while plugged in;
- launch LOCATIUM before sharing the link;
- keep the launcher window open;
- retain `backend/backups/locatium-20260911-174543.dump` privately.

## Security boundaries

- The API binds to `127.0.0.1`; LAN clients cannot bypass Cloudflare.
- Cloudflare ingress forwards only to port `3002`.
- CORS permits only `https://locatium-eta.vercel.app`.
- Demo login can issue only an `investor` token, never an admin token.
- Ask LOCATIUM Confirm writes pipeline, saved searches, alerts, and reports
  through authenticated APIs. Read-only chips (fly-to, facility-gap overlay,
  land-price band) stay in the browser.
- Public surfaces: `/embed/:zoneId` and `GET /api/public/transparency`.
- Reports, assistant calls, saved searches, portfolios, and other mutations
  require authentication.
- Reports are scoped to their owner and stored in PostgreSQL.
- Database dumps, environment files, runtime logs, and process metadata are
  ignored by Git.
- Never add database, JWT, LLM, SMTP, or tunnel credentials to `VITE_*`.
