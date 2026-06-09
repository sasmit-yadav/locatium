# LOCATIUM (Investmap) — project status

**Product name:** LOCATIUM  
**Repo folder:** `Investmap`  
**Purpose:** Web map viewer and API for official Haryana geospatial layers (HARSAC / MSME MapServer), with a path toward location intelligence (search, scoring, ML).

**Last updated:** 2026-06-05  

Use this document for **what exists today**. For **what to build next**, see [`FORWARD-ROADMAP.md`](./FORWARD-ROADMAP.md). For **how to run each layer**, see [`STEP-BY-STEP-BUILD.md`](./STEP-BY-STEP-BUILD.md).

---

## Executive summary

| Layer | Status |
|-------|--------|
| Backend API (Express) | **Implemented** |
| HARSAC MapServer proxy + tile cache | **Implemented** |
| Auth (JWT + PostgreSQL schema) | **Implemented** (DB must be running) |
| Frontend map viewer | **Implemented** (MapLibre + cached tiles) |
| Feature search / PostGIS analytics | **Implemented** (Week 4 complete) |
| Investor / ML / admin portals | **Planned** (README vision only) |

---

## Technology stack (as implemented)

| Area | Choice |
|------|--------|
| Frontend | React 19, Vite 8, Tailwind CSS 3 |
| Map client | **MapLibre GL JS** (migrated from ArcGIS Maps SDK, 2026-06-04) |
| Basemaps | OpenFreeMap styles + OpenStreetMap raster (no API key) |
| Backend | Node.js 18+, Express 4 |
| Official data | HARSAC `hsacggm.in` MapServer (9 services in README; **8** exposed in app) |
| Cache | In-memory tile cache + optional **Redis** |
| Database | PostgreSQL + PostGIS schema (`backend/db/schema.sql`) |
| Geocode (API only) | Nominatim proxy (`GET /api/geocode/search`) |

---

## Repository layout

```
Investmap/
├── backend/          # locatium-api — Express, maps proxy, auth
├── frontend/         # Vite + React + MapLibre map UI
├── docs/             # This file, roadmap, step-by-step build guide
├── docker-compose.yml # PostgreSQL + Redis for local dev
├── README.md         # Vision / 12-week roadmap (partly aspirational)
└── map_new/          # Legacy GIS assets (not used by current React app)
```

---

## Backend — implemented

### Core

- Express app: `backend/src/app.js`, entry `backend/src/server.js`
- Health: `GET /health`, `GET /api/health` (process alive)
- Readiness: `GET /ready`, `GET /api/ready` (requires PostgreSQL)
- CORS from `CORS_ORIGINS`
- Rate limiting on map/geocode routes

### Authentication (`/api/auth`)

- `POST /register`, `POST /login`, `POST /refresh`, `POST /logout`
- `GET /profile` (Bearer access token)
- Requires `DATABASE_URL` and JWT secrets in `backend/.env`
- Schema: `backend/db/schema.sql`, migrate via `npm run db:migrate`

### Maps — operational layer slugs

Registered in `backend/src/config/maps-registry.js` (must match `frontend/src/config/layers.js`):

| Slug | HARSAC service |
|------|----------------|
| `administrative` | Administrative_Boundaries |
| `base-layers` | Base_Reference_Layers |
| `constituencies` | Constituency_Boundaries |
| `environmental` | Environmental_Constraints |
| `cadastral` | Haryana_Cadastral |
| `social-infrastructure` | Social_Infrastructure |
| `transportation` | Transportation_Infrastructure |
| `utilities` | Utilities |

**Note:** `investment-zones` was removed from the product list intentionally (see build guide changelog).

### Maps — HTTP API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/maps/status` | Token configured + HARSAC reachable |
| `GET /api/tiles/list` | Layer slug list |
| `GET /api/tiles/:layer/:z/:x/:y.png` | **Cached PNG tiles** (memory → Redis → HARSAC export) |
| `GET /api/tiles/:layer/metadata.json` | Tile metadata |
| `GET /api/maps/:layerKey?bbox=...` | GeoJSON / query proxy for bbox |
| `GET /api/maps/:layerKey/info` | MapServer service info |
| `POST /api/maps/identify` | Batch identify for visible layers |
| `GET /api/mapservice/:slug/*` | ArcGIS REST proxy (legacy; **not used by frontend after MapLibre migration**) |
| `GET /tiles/:layer/:z/:x/:y.png` | Legacy path (same handler as `/api/tiles`) |

### Geocode

- `GET /api/geocode/search?q=` — OpenStreetMap Nominatim proxy

### Configuration

- Template: `backend/.env.example`
- Required for maps: `MAP_SERVER_TOKEN` **or** `MAP_SERVER_USERNAME` + `MAP_SERVER_PASSWORD`
- Recommended: `REDIS_URL=redis://localhost:6379` for tile performance

---

## Frontend — implemented

### Shell

- `frontend/src/App.jsx` — layout, layer state, identify panel, maps status banner
- `frontend/src/components/AppChrome.jsx` — header, about
- `frontend/src/components/ControlPanel.jsx` — layer toggles, opacity, basemap picker
- `frontend/src/components/PlaceSearch.jsx` — local Haryana place list (`haryanaPlaces.js`)
- `frontend/src/components/IdentifyPanel.jsx` — click identify results

### Map (current — MapLibre)

- `frontend/src/components/MapLibreMapView.jsx`
- **Basemap:** OpenFreeMap / OSM (`frontend/src/config/basemaps.js`)
- **Overlays:** raster tiles from `GET /api/tiles/{slug}/{z}/{x}/{y}.png`
- **Lazy layers:** overlay source/layer added when user first enables a layer
- **Identify:** map click → `POST /api/maps/identify` (unchanged)
- **Default:** only `administrative` layer on at load

### Dev proxy

- `frontend/vite.config.js` proxies `/api` → `VITE_API_URL` (default `http://localhost:3001`)
- `frontend/src/config/api.js` — in DEV, tile URLs use browser origin so requests hit Vite proxy

---

## MapLibre migration (2026-06-04)

**Before:** ArcGIS `MapImageLayer` → `/api/mapservice/...` (dynamic HARSAC export per pan; slow).

**After:** MapLibre raster sources → `/api/tiles/...` (cached tiles; much faster repeat views).

**Removed dependency:** `@arcgis/core` from `frontend/package.json`.

**Kept on backend:** `/api/mapservice` proxy (optional tools / future); identify still uses HARSAC REST via backend.

---

## Step 1 — Dev stack (Postgres + Redis)

See **[STEP-1-DEV-SETUP.md](./STEP-1-DEV-SETUP.md)**. From repo root: `.\scripts\setup-dev.ps1` then `cd backend && npm run dev:verify`.

---

## Local run checklist

**Terminal 1 — API**

```powershell
cd backend
Copy-Item .env.example .env   # first time; set HARSAC credentials
npm install
npm run dev
```

**Terminal 2 — UI**

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

**Optional — faster tiles**

```powershell
# repo root
docker compose up -d
# set REDIS_URL in backend/.env, restart API
```

**URLs**

- Frontend: http://localhost:5173  
- Backend: http://localhost:3001  
- Maps status: http://localhost:3001/api/maps/status  

---

## Verify (smoke tests)

- [ ] `GET /api/health` → 200, `"status":"ok"`
- [ ] `GET /api/maps/status` → `"ok":true` when HARSAC token valid
- [ ] `GET /api/tiles/administrative/9/356/243.png` → PNG (may be slow first time; fast on repeat)
- [ ] Frontend map loads basemap + administrative overlay
- [ ] Toggle a second layer → tiles appear
- [ ] Click map with a layer on → Identify panel populates
- [ ] Place search → map flies to location
- [ ] With Docker + migrate: `GET /api/ready` → database `"up"`

---

## Explicitly not implemented yet

These appear in `README.md` but **have no routes or UI** in the repo:

- `/api/analysis/*` (scoring, proximity, risk)
- `/api/investor/*` (opportunities, reports)
- `/api/admin/*`, `/api/public/*`
- Map legend component
- UI wired to `/api/geocode/search` (local gazetteer used instead)
- PostGIS-backed vector tiles (Martin / pg_tileserv)
- Python / ML pipeline
- Production deploy, CI/CD, monitoring

---

## Known limitations

1. **First tile load** in a new area can still be slow (HARSAC export on cache miss).
2. **PostgreSQL** must run for auth and `/api/ready`; map tiles work without DB.
3. **README.md** now has an [Implementation status](../README.md#-implementation-status-accurate-as-of-2026-06-04) section aligned with this file; the 12-week checklist below it is partly design-only.
4. **`frontend/dist/`** may exist from old ArcGIS builds; run `npm run build` after pull to refresh.
5. **No git repository** was detected in the project folder at last check — initialize if you need version control.

---

## Key files reference

| Concern | File |
|---------|------|
| Layer registry (API) | `backend/src/config/maps-registry.js` |
| Layer list (UI) | `frontend/src/config/layers.js` |
| Tile proxy logic | `backend/src/services/maps-proxy.service.js` |
| Map component | `frontend/src/components/MapLibreMapView.jsx` |
| Identify client | `frontend/src/services/mapsIdentify.js` |
| Env template (API) | `backend/.env.example` |
| Env template (UI) | `frontend/.env.example` |

---

## Document index

| Document | Contents |
|----------|----------|
| **PROJECT-STATUS.md** (this file) | Accurate snapshot of what is built |
| **FORWARD-ROADMAP.md** | Step-by-step plan from here to production + ML |
| **STEP-BY-STEP-BUILD.md** | Historical build walkthrough (some Step 5 text still mentions ArcGIS; superseded by MapLibre notes above) |
| **README.md** | Vision, personas, long-term API design |
