# LOCATIUM (Investmap) — project status

**Product name:** LOCATIUM  
**Repo folder:** `Investmap`  
**Purpose:** Haryana geospatial investment intelligence — official HARSAC layers, PostGIS analytics, location scoring, investor workflows, and ML-ready investment models.

**Last updated:** 2026-07-25  

Use this document for **what exists today**, **how scoring works**, and **how to test**. For the build roadmap see [`FORWARD-ROADMAP.md`](./FORWARD-ROADMAP.md) / [`FORWARD_roadmap.md`](../FORWARD_roadmap.md). Collector-rate load: [`COLLECTOR-RATES-IMPLEMENTATION.md`](./COLLECTOR-RATES-IMPLEMENTATION.md). **Land pricing end-state:** [`LAND-PRICING-SNAPSHOT-2026-07-23.md`](./LAND-PRICING-SNAPSHOT-2026-07-23.md). **Ask LOCATIUM:** [`assistant-guardrails.md`](./assistant-guardrails.md).

## Ask LOCATIUM (2026-07-25)

Map-grounded **investment copilot** (`POST /api/assistant/ask`):

- Fuzzy NLU — English + Hinglish, typos, jumbled word order, multi-intent
- Multi-turn chat history + session memory (district / budget / sector)
- Live grounding — score, distances, land ₹, ranked zones, policy, compare
- Clarifying questions when the ask is too vague
- Map actions + follow-up chips (fly-to, highlight, open Investor/Analysis)
- Works rule-based without an LLM key; optional Groq via `llm-adapter` (12s timeout for copilot)

UI: expandable **Ask LOCATIUM** widget + toolbar icon. Guardrails: [`assistant-guardrails.md`](./assistant-guardrails.md).

## Public Investor experience (2026-07-23)

Investor tab defaults to a **3-question guided flow** for normal users:

1. What do you want to build?  
2. What’s your land budget?  
3. Where should we search?

Results lead with a **Best match** card in plain English (“Worth a site visit” / “Compare further” / “Weak fit”), official rate + fee-inclusive land cost, and confidence tips. Pro tools (advanced filters, pipeline, CSV, portfolios) stay behind “Show pro tools”.

---

## Executive summary

| Layer | Status |
|-------|--------|
| Backend API (Express) | **Implemented** |
| HARSAC MapServer proxy + tile cache | **Implemented** |
| PostGIS vector tiles + feature search | **Implemented** |
| Auth (JWT + PostgreSQL) | **Implemented** |
| Frontend map viewer (MapLibre) | **Implemented** |
| Location scoring v2 (industry formulas) | **Implemented** |
| Location intelligence brief (rule-based insights) | **Implemented** |
| ML service (FastAPI) + orchestrator fallback | **Implemented** |
| XGBoost training scaffold | **Deployed `investment-v2`** — spatial + land features (`zone_features`); retrain after rate/comp imports |
| Investor portal routes + Intelligence UI | **Implemented (core)** |
| Investor opportunity ranking v3 (`investor-v3.2`) | **Complete** — INR budget fail-closed, stamp+reg acquisition, market premium vs floor; score-insights surfaces land ₹; PDF land block; score-batch attaches land; cache `v7` |
| ML investment model land features (`investment-v2`) | **Wired** — circle_rates + comps in `zone_features` / feature_engine / train; synthetic zone_outcomes demoted |
| Investor pipeline, portfolios, alerts | **Complete** |
| Plot inventory + ML re-rank + Redis cache | **Complete** |
| Collector / circle rates (22 districts) | **Loaded** — statewide circle rates + HSIIDC e-auction comps (11 districts) |
| Ask LOCATIUM (`/api/assistant/ask`) | **Complete** — fuzzy NLU copilot, multi-turn, map actions; LLM optional |

**Current scoring engine:** `v3-investment` — sector-weighted, sqrt-scaled infrastructure, CPCB AQI blend, zoning context, land value, comparables, policy RAG, optional LLM narrative.

---

## Technology stack

| Area | Choice |
|------|--------|
| Frontend | React 19, Vite 8, Tailwind CSS 3, TanStack Query, Zustand |
| Map | MapLibre GL JS + PostGIS MVT vector tiles |
| Backend | Node.js 18+, Express 4, PostgreSQL + PostGIS |
| ML service | Python 3.12, FastAPI, asyncpg, XGBoost (optional) |
| Official data | HARSAC `hsacggm.in` MapServer + imported PostGIS tables |
| Cache | In-memory tile cache + optional Redis |

---

## Repository layout

```
Investmap/
├── backend/           # locatium-api — Express, scoring, auth, investor routes
├── frontend/          # Vite + React + MapLibre dashboard
├── ml-service/        # FastAPI investment scoring + XGBoost training
├── docs/              # Status, week guides, ML contract, runbooks
├── docker-compose.yml # PostgreSQL + Redis
└── README.md          # Vision + long-term roadmap
```

---

## Build history (what was delivered)

### Phase 1–3 — Map platform (Weeks 1–8)

- MapLibre migration from ArcGIS (cached raster + vector MVT tiles).
- Layer registry aligned between backend and frontend (`layer-registry.js`).
- Auth: register/login/refresh, JWT, audit logs schema.
- Feature search, identify, geocode proxy, portal favorites/history.

### Phase 3 Week 4 — PostGIS analytics

- Spatial joins against hospitals, schools, roads, rail, forests, HSIIDC zones, utilities.
- Feature API and investor opportunity listing with spatial context.

### Phase 3 Week 5 — Deterministic scoring (v1)

- First heuristic: linear infrastructure counts, fixed 30/30/20/20 weights.
- **Limitation:** scores saturated at 100; flat ~60 when ML overwrote PostGIS.

### Phase 4 Week 13 — ML scaffolding

- `ml-service/` FastAPI: `/health`, `/ready`, `/score/investment`.
- Node: `mlClient.js`, `fallbackScoring.js`, `scoringOrchestrator.js`.
- ML timeout/500 → structured fallback with logging.
- Docs: [`WEEK13-ML-SCAFFOLDING.md`](./WEEK13-ML-SCAFFOLDING.md).

### Phase 4 Week 14 — Investment model

- `zone_features` materialized view + `zone_outcomes` table.
- Python heuristic port + `train_investment_model.py`.
- Frontend `MethodBadge` in Intelligence panel.
- Docs: [`WEEK14-INVESTMENT-MODEL.md`](./WEEK14-INVESTMENT-MODEL.md).

### Phase 4 Week 14+ — Scoring v3 + intelligence brief (2026-07-20)

**Problems fixed:**

| Issue | Fix |
|-------|-----|
| Every point ~60 | Orchestrator keeps PostGIS scores; ML only adjusts overall when trained |
| Flat infrastructure 100 | Sqrt-scaled amenity density (v3) differentiates dense vs ultra-dense |
| Jails as “govt offices” | Replaced with electric stations, transformers, ITI |
| Air quality always 0 | CPCB AQI blend when stations seeded; spatial proxy fallback |
| Binary zone bonuses | Continuous proximity functions per sector |
| Same weights all sectors | Sector-specific weight profiles |
| Opaque scores | `scoreBreakdown` + expandable UI formulae |
| Generic insight text | Rule-based brief + optional Groq LLM narrative (grounded on JSON) |
| Flat investor scores | `investor-v3` opportunity engine aligned to location scoring |

**Key files:**

| File | Role |
|------|------|
| `backend/src/services/scoring-engine.js` | **Single source of truth** for v3 formulae |
| `backend/src/services/analysis-scoring.service.js` | PostGIS feature extraction → engine |
| `backend/src/services/score-insights.service.js` | Rule-based location intelligence brief |
| `backend/src/services/narrative-insights.service.js` | Optional LLM narrative (Groq/OpenAI-compatible) |
| `backend/src/services/llm/llm-adapter.js` | LLM adapter (`GROQ_API_KEY`, `LLM_ENABLED=true`) |
| `backend/src/services/land-value.service.js` | Circle rates + estimated ₹/sq yd |
| `backend/src/services/comparable-sites.service.js` | Nearby comparable zones |
| `backend/src/services/policy-rag.service.js` | Policy document snippets |
| `backend/src/services/aqi.service.js` | CPCB AQI station blend |
| `backend/src/services/scoringOrchestrator.js` | PostGIS authoritative + enrichments + ML overlay |
| `backend/src/services/investor-opportunity.engine.js` | Investor opportunity formula (`investor-v3`) |
| `backend/src/services/investor-opportunities.service.js` | Zone ranking, compare, analysis |
| `ml-service/services/heuristic_scoring.py` | Python parity with Node engine |
| `frontend/src/analytics/ScoreBreakdown.jsx` | “How this score was calculated” UI |
| `frontend/src/panels/IntelligencePanel.jsx` | Overview / Analysis / **Investor** tabs |

**Full investor roadmap:** [`INVESTOR-TAB-ROADMAP.md`](./INVESTOR-TAB-ROADMAP.md)

---

### Phase 4 Week 14+ — Scoring v2 + intelligence brief (superseded by v3)

<details>
<summary>Historical v2 notes (reference only)</summary>

**Problems fixed (v2 era):**

| Issue | Fix |
|-------|-----|
| Every point ~60 | Orchestrator keeps PostGIS scores; ML only adjusts overall when trained |
| Flat infrastructure 100 | Log-saturating formula differentiates dense vs ultra-dense |
| Jails as “govt offices” | Replaced with electric stations, transformers, ITI |
| Air quality always 0 | Spatial proxy: urban + industrial + road-density |
| Binary zone bonuses | Continuous proximity functions per sector |
| Same weights all sectors | Sector-specific weight profiles |
| Opaque scores | `scoreBreakdown` + expandable UI formulae |
| Generic insight text | Rule-based brief: verdict, strengths, cautions, opportunities |

**Key files (v2):** same paths as v3; engine version was `v2-industry`.

</details>

---

## Scoring architecture

```
Map click (lat, lng, sector)
        │
        ▼
POST /api/analysis/score-location
        │
        ├─► PostGIS spatial queries (authoritative)
        │     hospitals, schools, ITI, civic assets
        │     road/rail/airport/metro/bus distances
        │     forest/flood/water/environmental layers
        │     HSIIDC, licensed colonies, utility networks
        │
        ├─► scoring-engine v3 (pure math)
        │     4 component scores + sector weights → overall
        │
        ├─► enrichments (parallel where possible)
        │     land value, comparables, policy RAG, optional LLM narrative
        │
        ├─► buildScoreInsights (rule-based narrative)
        │
        └─► mlClient (parallel, optional)
              method=ml + mlAdjusted → may override overall only
              failure → fallback:true, PostGIS still complete
```

---

## Scoring engine v3 — concepts & formulae

**Version string:** `v3-investment`  
**Supported sectors:** `industrial`, `residential`, `commercial`, `agricultural`  
**Bounds:** Haryana envelope (lat 27.3–30.95, lng 74.4–77.9)

### v3 changes from v2

| Area | v2 | v3 |
|------|----|----|
| Infrastructure density | Log saturation | **Sqrt-scaled** counts (better spread 7 vs 21 hospitals) |
| Air quality | Spatial proxy only | **CPCB AQI blend** when `aqi_stations` seeded; proxy fallback |
| Enrichments | Score only | Land value, comparables, policy RAG, optional LLM memo |
| Investor ranking | Simple infra/access blend | **`investor-v3`** composite (see Investor tab section) |

### Shared primitives

**Clamp:** all component scores ∈ [0, 100]

**Proximity score** (closer = better):

```
proximity(d, maxKm) = 100 × (1 − min(d / maxKm, 1))
```

**Risk from distance** (closer = higher risk):

```
risk(d, maxKm) = 100 × (1 − min(d / maxKm, 1))
```

**Log saturation** (prevents linear count overflow):

```
saturate(raw, half=55) = 100 × (1 − e^(−raw/55))
```

---

### Component 1 — Infrastructure

**Concept:** Social + civic amenity density within **5 km** — workforce, services, skill training.

**PostGIS tables:**

| Metric | Tables |
|--------|--------|
| Hospitals | `hospitals` |
| Schools | `govt_school`, `pm_shri_and_sanskriti_school`, `haryana_police_public_schools_point` |
| Civic assets | `electric_station`, `distribution_transformer` |
| ITI | `iti` |

**Formula:**

```
raw = hospitals×12 + schools×8 + civic×6 + ITI×10
infrastructure = sqrt-scaled saturate (v3) — see scoring-engine.js
```

---

### Component 2 — Accessibility

**Concept:** Multimodal logistics connectivity — sector-tuned weights.

**Distance layers:**

| Layer | Max search | Used in |
|-------|------------|---------|
| Roads | 20 km | All sectors |
| Rail | 30 km | All |
| Airport | 60 km | All |
| Municipal boundary | 50 km | Urban proxy |
| Metro stations | 25 km | rapid/delhi/proposed |
| Bus stops | 2 km radius count | Bonus |

**Industrial / agricultural weights:**

```
0.28×road + 0.27×rail + 0.20×airport + 0.15×urban + 0.05×metro + 0.05×busBonus
busBonus = min(busStops×4, 20)
```

**Residential / commercial weights:**

```
0.22×road + 0.18×rail + 0.15×airport + 0.20×urban + 0.15×metro + 0.10×busBonus
```

---

### Component 3 — Environmental suitability

**Concept:** **Higher score = safer site** (lower combined constraint risk).  
UI label: **“Env. suitability”** with tooltip explaining direction.

**Risk factors:**

| Factor | Max distance | Weight |
|--------|--------------|--------|
| Forest | 10 km | 32% |
| Low-lying / flood | 10 km | 24% |
| Water bodies | 5 km | 18% |
| Air-quality proxy | — | 26% |

**Air quality (v3):** CPCB station blend within search radius when `aqi_stations` populated; else spatial proxy:

```
airRisk = 0.35×risk(urbanKm, 15) + 0.35×risk(industrialKm, 8) + 0.30×min(roads×2.5, 35)
environmentalSuitability = 100 − (0.32×forest + 0.24×flood + 0.18×water + 0.26×airRisk)
```

`metrics.airQualitySource` = `"cpcb_blend"` or `"spatial_proxy"` — disclosed in insights.

---

### Component 4 — Zone fit

**Concept:** Land-use alignment for selected sector — continuous proximity, not binary ±10.

**Base:** 50 points

**All sectors:**

- Utility mesh: `(min(water+power features, 12) / 12) × 100 × 0.18`
- Transport mesh: `(min(roads, 15) / 15) × 100 × 0.12`
- Environmental penalty: `(envRisk / 100) × 28`

**Industrial:** +HSIIDC cluster proximity (up to ~22), −licensed colony adjacency  
**Residential:** +amenity saturation, −industrial adjacency, +planned colony context  
**Commercial:** +metro + light industrial catchment  
**Agricultural:** +irrigation utility + nearby water body bonus

**Utility tables:** `water_network`, `sewerage_line`, electric lines, `hvpnl_line`, power assets.

---

### Overall composite — sector weights

| Sector | Infra | Access | Env | Zone |
|--------|-------|--------|-----|------|
| Industrial | 0.20 | **0.35** | 0.25 | 0.20 |
| Residential | **0.35** | 0.25 | 0.25 | 0.15 |
| Commercial | 0.25 | **0.35** | 0.20 | 0.20 |
| Agricultural | 0.15 | 0.20 | **0.45** | 0.20 |

```
overall = Σ (componentScore × sectorWeight)
```

API returns `scoreBreakdown[]` with per-component formula, weight, and weighted contribution.

---

## Location intelligence brief (insights)

**Primary layer:** deterministic narrative from scored metrics (`score-insights.service.js`).

**Optional LLM layer:** when `LLM_ENABLED=true` and `GROQ_API_KEY` set, `narrative-insights.service.js` generates a grounded memo from the same JSON context (no invented scores).

| Field | Meaning |
|-------|---------|
| `verdict` | Strong / Moderate / Proceed with caution (thresholds 75 / 55) |
| `summary` | 2–3 sentence executive summary |
| `strengths` | Why the site works (infra, logistics, utilities) |
| `cautions` | EIA, forest, water, air, colony adjacency |
| `opportunities` | Next diligence steps by score band |
| `methodology` | Engine version + weight breakdown |
| `scoringVersion` | `v3-investment` |
| `landValue` | Circle rate / estimated ₹ per sq yd (when available) |
| `comparables` | Nearby scored sites |
| `policySnippets` | Policy RAG excerpts (when documents seeded) |

---

## Investor tab — opportunity ranking

**Purpose:** Rank official zones (HSIIDC, Karnal land bank, HSVP plots, licensed colonies) for investor shortlisting — distinct from point-level Analysis.

### Architecture

```
Investor tab filters (sector, risk, budget ₹, district, near-me)
        │
        ▼
GET /api/investor/opportunities
        │
        ├─► Fetch candidates from 4 PostGIS zone tables
        ├─► Pre-filter: district, zone type, near-me radius
        ├─► Parallel v3 score at each zone centroid (batch of 6)
        ├─► land-value.service → estimated land cost (₹)
        ├─► investor-opportunity.engine → investor-v3 composite
        └─► Return ranked list + mapHighlights (top 5)
```

### Opportunity formula (`investor-v3.2`)

```
opportunity = v3×0.32 + type×0.10 + landRoi×0.12 + zoneFit×0.10 + env×0.10
            + CLU×0.10 + utility×0.08 + availability×0.08
```

Land side: gov floor + comps → estimate → all-in (stamp 5% + reg 1%). Budget is **INR-only**.  
Enrichment: `investor-zone-enrichment.service.js` (batch scoring, cache `v7`, policy RAG, checklist, financial preview, land-aware insights).  
End-state detail: [`LAND-PRICING-SNAPSHOT-2026-07-23.md`](./LAND-PRICING-SNAPSHOT-2026-07-23.md).

| Budget band | INR range |
|-------------|-----------|
| Low | &lt; ₹5 crore |
| Medium | ₹5–25 crore |
| High | &gt; ₹25 crore |

**Verdict:** ≥75 shortlist · ≥55 review · &lt;55 hold

### Investor UI features (Phase A)

| Feature | Status |
|---------|--------|
| Sector / risk / budget / zone type filters | ✅ |
| District filter | ✅ |
| Near map center (25 km) | ✅ |
| Expandable score explain | ✅ |
| Compare matrix (2–4 zones) | ✅ |
| Map highlight circles (top 5) | ✅ |
| Deep analysis → Analysis tab | ✅ |
| Save filter set | ✅ |
| PDF / email / bookmark (selected zone) | ✅ |
| Pipeline kanban UI | ✅ |

### Pipeline (Phase B scaffold)

Table: `investor_pipeline` — stages `discovered` → `shortlisted` → `due_diligence` → `negotiation` → `closed` | `passed`

API: `GET/POST /api/portal/pipeline`, `DELETE /api/portal/pipeline/:id`

See [`INVESTOR-TAB-ROADMAP.md`](./INVESTOR-TAB-ROADMAP.md) for Phases C–E (plot inventory, financial model, ML re-rank).

---

## ML integration

| Endpoint | Purpose |
|----------|---------|
| `POST /score/investment` | Heuristic or XGBoost overall adjustment |
| Node `scoringOrchestrator` | Parallel ML + PostGIS; merge rules |

**Merge rule:** PostGIS `scores`, `details`, `scoreBreakdown` are **always** kept. ML overrides `overallScore` only when `method === 'ml'` and `mlAdjusted === true`.

**Train model:**

```powershell
cd ml-service
python scripts/train_investment_model.py
# needs zone_outcomes rows; dev: ML_MIN_TRAINING_ROWS=30
```

---

## API endpoints (implemented)

### Analysis

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/analysis/score-location` | Full v3 score + insights + breakdown + enrichments |
| POST | `/api/analysis/score-batch` | Up to 100 locations |

### Investor

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/investor/opportunities` | Ranked zones + `mapHighlights` |
| GET | `/api/investor/zones/:id/analysis` | Zone profile + benchmarks |
| GET | `/api/investor/zones/compare` | 2–4 zone matrix |
| GET | `/api/investor/reports/:zoneId` | PDF report |
| POST | `/api/investor/reports/email` | Email PDF |

### Portal (authenticated)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST/DELETE | `/api/portal/saved-searches` | Saved investor filter sets |
| GET/POST/DELETE | `/api/portal/favorites` | Zone bookmarks |
| GET/POST/DELETE | `/api/portal/pipeline` | Investor pipeline stages |
| GET/POST/DELETE | `/api/portal/history` | Analysis history |

---

## Local run (verified dev setup)

**Terminal 1 — Database (optional Docker):**

```powershell
docker compose up -d
cd backend
npm run db:migrate
```

**Terminal 2 — Backend:**

```powershell
cd backend
npm run dev
# Default PORT=3002 in .env
```

**Terminal 3 — ML service:**

```powershell
cd ml-service
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8002
```

**Terminal 4 — Frontend:**

```powershell
cd frontend
npm run dev
# Investmap often on 5174 if 5173 is occupied by another project
```

### URLs

| Service | URL |
|---------|-----|
| Frontend (LOCATIUM) | http://localhost:5174 |
| Backend API | http://localhost:3002 |
| ML service | http://127.0.0.1:8002 |
| Health | http://localhost:3002/api/health |

**Login (dev):** `analyst@locatium.in` / `sas@123456789`

**Env:**

```env
# backend/.env
PORT=3002
DATABASE_URL=postgresql://...@127.0.0.1:5432/investmap
ML_SERVICE_URL=http://127.0.0.1:8002
LLM_ENABLED=true
GROQ_API_KEY=...          # never commit
LLM_MODEL=llama-3.3-70b-versatile
LLM_BASE_URL=https://api.groq.com/openai/v1
INVESTOR_ALERTS_ENABLED=true
INVESTOR_ALERT_INTERVAL_MS=3600000
INVESTOR_SCORE_CACHE_TTL_SEC=3600
REDIS_URL=redis://127.0.0.1:6379

# frontend/.env
VITE_API_URL=http://localhost:3002
```

---

## Testing

### Backend unit tests

```powershell
cd backend
npm test
# scoring-engine + scoring-orchestrator + investor-opportunity.engine
```

### ML tests

```powershell
cd ml-service
python -m pytest -q
```

### Live score (PowerShell)

```powershell
$body = @{ lat = 28.45; lng = 76.9; sector = 'industrial' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "http://localhost:3002/api/analysis/score-location" `
  -Method Post -ContentType "application/json" -Body $body |
  Select-Object overallScore, scoringVersion, @{n='insights';e={$_.insights.verdict}}
```

### Investor API smoke

```powershell
Invoke-RestMethod "http://localhost:3002/api/investor/opportunities?sector=industrial&limit=5" |
  Select-Object opportunityVersion, count, @{n='top';e={$_.opportunities[0].name}}
```

### UI smoke

1. Open http://localhost:5174  
2. Log in → click map points in Gurugram / Karnal  
3. Intelligence → **Overview** or **Analysis**  
4. Confirm: varied scores, intelligence brief, expandable **How this score was calculated**  
5. Intelligence → **Investor** → set filters → ranked zones + map circles  
6. Expand **Why this score** → compare 2 zones → **Deep analysis** switches to Analysis tab

---

## Frontend intelligence UI

| Component | Location |
|-----------|----------|
| `ScoreInsightsBlock` | Overview + Analysis tabs |
| `ScoreBreakdown` | Expandable formulae per component |
| `MethodBadge` | Heuristic / ML / fallback indicator |
| `ScoreGauge` | Env. suitability tooltip (? icon) |

---

## Remaining limitations (honest)

1. **Air quality** — CPCB blend when stations seeded; many areas still use spatial proxy only.  
2. **ML model** — XGBoost needs sufficient `zone_outcomes` training rows.  
3. **LLM narrative** — optional; falls back to rule-based insights if Groq unavailable.  
4. **Land price / ROI** — circle rates loaded for 22 districts; market comps from HSIIDC e-auction reserves (Jamabandi deeds still thin). Budget filter is INR-only.  
5. **Investor ranking latency** — first cold load scores all zones; Redis cache makes repeat loads fast (`elapsedMs` in API).  
6. **Alert job** — set `INVESTOR_ALERTS_ENABLED=true` on backend for hourly email checks.  
7. **First tile load** — HARSAC cache miss can be slow.  
8. **Concurrent DB load** — heavy parallel scoring may need pool tuning in production.

---

## Document index

| Document | Contents |
|----------|----------|
| **INVESTOR-TAB-ROADMAP.md** | Investor tab phases A–E, formulae, test plan |
| **PROJECT-STATUS.md** (this file) | Full status, scoring v3 maths, investor tab, test guide |
| **WEEK13-ML-SCAFFOLDING.md** | ML service setup + orchestrator |
| **WEEK14-INVESTMENT-MODEL.md** | zone_features, XGBoost, investment endpoint |
| **FORWARD-ROADMAP.md** | Production + ML roadmap |
| **STEP-BY-STEP-BUILD.md** | Historical build walkthrough |
| **docs/ml-response-contract.md** | ML ↔ Node response shape |
| **docs/fallback-runbook.md** | ML fallback operations |

---

## Key files reference

| Concern | File |
|---------|------|
| Scoring formulae | `backend/src/services/scoring-engine.js` |
| PostGIS queries | `backend/src/services/analysis-scoring.service.js` |
| Insights narrative | `backend/src/services/score-insights.service.js` |
| LLM narrative | `backend/src/services/narrative-insights.service.js` |
| Investor opportunity | `backend/src/services/investor-opportunity.engine.js` |
| Investor ranking | `backend/src/services/investor-opportunities.service.js` |
| Land value | `backend/src/services/land-value.service.js` |
| ML merge | `backend/src/services/scoringOrchestrator.js` |
| Python parity | `ml-service/services/heuristic_scoring.py` |
| `IntelligencePanel` | Overview + Analysis + **Investor** tabs |
| Score breakdown UI | `frontend/src/analytics/ScoreBreakdown.jsx` |
| Layer registry | `backend/src/config/layer-registry.js` |
