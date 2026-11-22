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
- Demo login creates a private throwaway investor account per browser (`DEMO_ISOLATED`, default on).
  Only set `DEMO_ISOLATED=false` if you want the old single shared `demo@locatium.app` account,
  which must then be provisioned with `npm run db:bootstrap`.

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
- Demo login can issue only an `investor` token, never an admin token. Each visitor gets an
  isolated account, so pipelines, portfolios, reports and copilot memory are never shared;
  expired demo accounts are purged automatically.
- Ranking, zone analysis and batch scoring require a token, and full-district scans are limited
  to `HEAVY_WORK_CONCURRENCY` (default 2) at once, one per user, so a single caller cannot
  exhaust the database pool.
- The API sends baseline security headers (nosniff, frame deny, no-referrer, CSP, HSTS in production).
- Email delivery needs `SMTP_HOST` / `SMTP_FROM`. Without them, verification / reset / report
  emails are written to `backend/email-outbox/` instead of being sent.
- Reports and alerts are emailed **only to the signed-in user's own verified email**, with no
  free-text message, capped by `EMAIL_REPORT_DAILY_LIMIT` (default 10/day). Guests cannot email.
- Ask LOCATIUM is capped per user per day (`ASSISTANT_DAILY_LIMIT`, default 60; guests
  `ASSISTANT_DEMO_DAILY_LIMIT`, default 20) with a friendly bilingual message at the limit.
- Access tokens last 15 minutes; the frontend renews them with the refresh token. Password
  reset, password change and account deletion revoke every refresh token.
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

## Real users: accounts, email, legal, ops

Accounts: visitors start as private guests. **Create account** upgrades the guest account in place
(saved work is kept), sends a verify link, and unlocks emailed reports and alerts. Users can reset
their password, change it, and delete their account from Settings → Account. Sign-ups can be closed
with `ALLOW_PUBLIC_REGISTRATION=false`. Account tables are created automatically at API start
(`db/accounts.sql`); `npm run db:migrate` also includes them.

Before inviting real users:

1. Set SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) in `backend/.env`
   with a sender domain that has SPF, DKIM and DMARC. Without it, nobody receives verify/reset links.
2. Set `VITE_OPERATOR_NAME` and `VITE_CONTACT_EMAIL` in Vercel (shown on `/terms` and `/privacy`),
   then have both pages reviewed by a lawyer. They are a plain-language starting draft.
3. Get written permission from the data owners (HARSAC, HSIIDC, revenue department) to show their
   layers and rates publicly.
4. Schedule backups once: `backend\scripts\register-daily-backup.ps1` (daily 03:00, keeps 7;
   add `-CopyTo E:\locatium-backups` for a second copy).
5. Optional alerts: set `ALERT_WEBHOOK_URL` (Slack / Discord / ntfy) to get a message on server
   errors, and add a free uptime monitor (e.g. UptimeRobot) on `<API URL>/health`.

Housekeeping runs daily inside the API: report/outbox files older than
`REPORT_FILE_RETENTION_DAYS` (14) are deleted from disk (PDFs stay in PostgreSQL), expired tokens and
old usage counters are removed, and audit logs older than 365 days are purged.

## Free hosting (no VM): Neon + Render + Vercel

Runs 24/7 without this PC. Every feature works as before: the 371-point check against the full
database gave identical scores, and zone ranking, plot check, search, identify and the copilot
returned the same results.

| Part | Where | Free limit used |
|------|-------|-----------------|
| Frontend + 22 map-only layers (`frontend/public/tiles/*.pmtiles`, 229 MB) | Vercel (project `locatium`) | static files |
| API (`backend/`) | Render free web service (`render.yaml`) | sleeps after ~15 min; kept awake by `.github/workflows/keep-awake.yml` |
| Database: compact PostGIS (`backend/backups/locatium-lean.dump` → about 438 MB) | Neon free project | 0.5 GB |
| ML service | not deployed (`ML_SERVICE_URL=disabled`) — scores come from the formula, as users already see | — |

How the database was made small (details in `backend/db/compact-for-free-hosting.sql`):
map-only layers moved to static tile files; 1.3 M power-line segments and 330 k transformers
became weighted density points used only for counting; shapes snapped to ~10 cm and
simplified at ~1 m. To rebuild after a data update: run that SQL on a copy of the full
database, then `backend/scripts/build-static-tiles.sh` for the tile files.

### Steps (once)

1. **Push the code.** On this PC, PowerShell, folder
   `C:\Users\91798.SASMITPC\OneDrive\Documents\PROJECTS\Investmap`, GitHub account
   `sasmit-yadav`, branch `ship-readiness`:
   ```powershell
   git add -A
   git commit -m "Free hosting: compact database, static map tiles, Render blueprint"
   git push -u origin ship-readiness
   git checkout main
   git merge ship-readiness
   git push origin main
   ```
2. **Create the database.** In the browser, <https://console.neon.tech>, sign in with GitHub
   (`sasmit-yadav`). New project: name `locatium`, Postgres 17, region **AWS Asia Pacific
   (Singapore)**. On the project dashboard click **Connect** and copy two strings: the
   **direct** one (host without `-pooler`) and the **pooled** one (host with `-pooler`).
3. **Load the data.** On this PC, PowerShell, folder
   `C:\Users\91798.SASMITPC\OneDrive\Documents\PROJECTS\Investmap\backend`, no git needed
   (paste your **direct** Neon string between the quotes):
   ```powershell
   $neon = "postgresql://...direct string...?sslmode=require"
   & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --no-owner --no-privileges --dbname $neon backups\locatium-lean.dump
   ```
   Lines saying an object "already exists" are harmless.
4. **Start the API.** In the browser, <https://dashboard.render.com>, sign in with GitHub
   (`sasmit-yadav`). **New → Blueprint**, repository `sasmit-yadav/locatium`, branch `main`.
   Fill the empty values: `DATABASE_URL` = the **pooled** Neon string, `GROQ_API_KEY`, and the
   `SMTP_*` values. Deploy. Copy the service URL (e.g. `https://locatium-api.onrender.com`) and
   check `<that URL>/ready` shows `"database":"up"`.
5. **Point the website at it.** On this PC, PowerShell, folder
   `C:\Users\91798.SASMITPC\OneDrive\Documents\PROJECTS\Investmap\frontend`, your Vercel login
   (project `locatium` is already linked), branch `main`:
   ```powershell
   vercel env rm VITE_API_URL production --yes
   vercel env add VITE_API_URL production      # paste the Render URL
   vercel env add VITE_OPERATOR_NAME production
   vercel env add VITE_CONTACT_EMAIL production
   vercel --prod
   ```
6. **Keep it awake.** In the browser, <https://github.com/sasmit-yadav/locatium/settings/variables/actions>,
   **New repository variable**: name `API_URL`, value = the Render URL.
7. Stop using `ops\tunnel\Start-Locatium.ps1` for the public site; this PC can be switched off.

Notes: the first request after the API or database has slept takes longer (the keep-awake
ping avoids most of it). Room left in the 0.5 GB database is about 60 MB, mainly used by
saved report PDFs. If Render's free plan does not allow outgoing SMTP, use an email provider
that offers SMTP on port 2525 or an HTTP API.
