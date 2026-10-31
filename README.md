# LOCATIUM

Haryana geospatial investment intelligence — official HARSAC layers, PostGIS analytics, location scoring, investor shortlisting, and **Ask LOCATIUM**, an in-map copilot that can score a pin, rank zones, walk diligence, and actually save or email a report when you tap Confirm.

**Stack:** React + MapLibre · Node.js + Express + PostGIS · optional FastAPI ML

**Public showcase:** `https://locatium-eta.vercel.app` (frontend). Postgres and ML stay on the private machine; see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

**Docs index:** [`docs/README.md`](./docs/README.md)

---

## Quick start

### Prerequisites

- Node.js 18+
- PostgreSQL with PostGIS
- (Optional) Redis for tile / score / answer cache
- (Optional) Python 3.12 for `ml-service`
- HARSAC MapServer credentials for live tiles (`MAP_SERVER_TOKEN` or username/password in `backend/.env`)

### Backend

```powershell
cd backend
Copy-Item .env.example .env   # edit DATABASE_URL and JWT secrets
npm install
npm run db:migrate
npm run dev
```

Default in `.env.example` is port **3001**. This repo’s verified local / showcase setup uses **3002** (`PORT=3002` in `backend/.env`, `VITE_API_URL=http://localhost:3002` in `frontend/.env`).

### Frontend

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

App: `http://localhost:5173` (or the next free Vite port).

### ML (optional)

```powershell
cd ml-service
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8002
```

Set `ML_SERVICE_URL=http://127.0.0.1:8002`. If the ML process is down, scoring still returns PostGIS v3 results.

### Login

| Mode | How |
|------|-----|
| **Showcase / demo** | `POST /api/auth/demo` when `DEMO_MODE=true` — each browser gets its own private throwaway `investor` account (expires after `DEMO_TTL_DAYS`, default 7). `DEMO_ISOLATED=false` falls back to the single shared `DEMO_USER_EMAIL` account |
| **Local register** | `POST /api/auth/register` |
| **Admin bootstrap** | `npm run db:bootstrap` with `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` in `backend/.env` (never commit those values) |

There is no documented shared password. Older docs that mentioned one are obsolete.

---

## Verify

```powershell
cd backend
npm test                        # scoring, investor engine, copilot, model health, load guard (102 tests)
npm run verify                  # DB, JWT, ports
node scripts/test-api-smoke.js  # backend must be running
```

If the API is on 3002:

```powershell
$env:API_URL='http://localhost:3002'; node scripts/test-api-smoke.js
```

---

CI (`.github/workflows/ci.yml`) runs the backend tests, frontend lint + build, and the ML
service tests on every push. Manual QA scripts (fuzz, IDOR, load, parity) live in
`backend/scripts/qa/`.

## What is built

| Area | Status |
|------|--------|
| Welcome screen + full English / हिंदी switch for everyday users | Done |
| **Check my plot** — plain Good/Average/Weak summary, land price with source + date, total cost calculator (stamp duty by buyer and urban/rural, registration, loan EMI), verify-before-you-buy checklist, English/Hindi PDF | Done |
| Place search — villages (incl. hadbast no.), towns, HSVP sectors and plots, e.g. “sector 46 gurugram” | Done |
| Map viewer (HARSAC layers, identify, basemaps, facility finder) | Done |
| Spatial scoring **v3-investment** + formula breakdown | Done |
| ML overlay (`investment-v2`) | **Experimental, shown only** — trained on 30 synthetic labels derived from its own input features, so it never changes a score unless `ML_OVERRIDE_ENABLED=true` |
| Investor ranking **investor-v3.2**, compare, pipeline, portfolios, PDF/email | Done |
| Land ₹ — 22-district circle rates + HSIIDC comps (current band) | Done |
| Forward land outlook — compounds *published* collector-rate revisions, capped to the history depth | Done (returns `insufficient_history` where rate history is thin) |
| Facility-gap overlay (`GET /api/analysis/facility-gap`) | Done |
| Public transparency + embed zone card `/embed/:zoneId` | Done |
| **Ask LOCATIUM** — bilingual, voice in, grounded, Confirm executes mutations | Done |
| Admin console — health, users, analytics, audit, **model health** (ML uptime, scoring fallback rate, LLM health, data freshness) | Done |
| Kubernetes, Terraform, Grafana, trained price models (CatBoost), Jamabandi scrape, Bhashini TTS, department workspaces | **Not built** — see [`FORWARD_roadmap.md`](./FORWARD_roadmap.md) |

Scoring, investor, and copilot detail: [`docs/PROJECT-STATUS.md`](./docs/PROJECT-STATUS.md) · [`docs/ASSISTANT-UPGRADE.md`](./docs/ASSISTANT-UPGRADE.md).

---

## API overview

```
GET  /health | /ready
POST /api/auth/login | /register | /demo | /refresh | /logout
GET  /api/auth/profile
PUT  /api/auth/profile

GET  /api/tiles/:layer/:z/:x/:y.png
POST /api/maps/identify
GET  /api/features/search | /nearby | /statistics

POST /api/analysis/score-location | /score-batch      # score-batch: auth, ≤25 points, one at a time per user
GET  /api/analysis/forecast          # current p10/p50/p90 band; ?horizon=1,3,5 adds an outlook
GET  /api/analysis/facility-gap
GET  /api/analysis/plot-summary       # plain bilingual summary (?lat&lng&sector&lang=en|hi)
GET  /api/analysis/plot-report        # PDF, auth (&area&buyer&areaType&lang)
POST /api/analysis/acquisition-cost   # land + stamp duty + registration + EMI
GET  /api/analysis/buyer-checklist    # ?lang=en|hi
GET  /api/features/places?q=          # ranked village / sector / plot search

GET  /api/investor/opportunities | /compare-zones | /districts   # ranking + zone analysis need a token; district scans are concurrency-bounded
POST /api/investor/generate-report | /email-report

GET|POST /api/portal/pipeline | /saved-searches | /portfolios | /notifications
GET  /api/portal/share/:token
GET  /api/public/transparency
GET  /api/public/zones/:zoneId/card

POST /api/assistant/ask              # SSE or JSON; auth required
POST /api/assistant/action           # Confirm → real mutation
POST /api/assistant/voice
GET  /api/assistant/capabilities
GET|PUT|DELETE /api/assistant/memory
GET  /api/assistant/metrics          # admin only

GET  /api/admin/layer-status | /user-statistics | /data-analytics | /audit-logs
GET  /api/admin/model-health         # ML + scoring + LLM + data freshness verdict
```

---

## Project structure

```
Investmap/
├── backend/            # Express API, PostGIS, copilot, PDF reports
├── frontend/           # React dashboard + MapLibre + Ask LOCATIUM widget
├── ml-service/         # FastAPI investment scoring (optional)
├── docs/               # Status, copilot, investor, historical week notes
├── deploy/             # Production compose, Caddy, PostGIS image
├── ops/tunnel/         # Showcase launcher (Vercel + Cloudflare Quick Tunnel)
├── DEPLOYMENT.md       # How the public showcase actually runs
├── FORWARD_roadmap.md  # Phases 4–6: shipped vs remaining
└── roadmap.md          # Original 12-week plan (historical below the status table)
```

---

**LOCATIUM** — smart location decisions, powered by spatial intelligence.
