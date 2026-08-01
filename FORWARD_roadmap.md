# LOCATIUM — Ultra-Ultra-Micro Roadmap
## Free Public Service Edition · Hour-Block Detail · Pluggable Fast-LLM Architecture

**Baseline assumed complete:** Weeks 1–12 (auth, tile proxy, MapLibre viewer, PostGIS search, Week 5 heuristic scoring, role-based DB schema, Week 10 security checklist, Week 7 static PDF report).

**Format note:** every working day is split into 4 blocks (~2hrs each). Each block lists concrete, checkable micro-tasks — file names, function names, commands, test names — not vague goals. If a block finishes early, pull the next block's first task forward rather than leaving slack.

---

## 0. Two Standing Decisions Baked Into Every Week Below

### 0.1 Free / govt-website model (unchanged from before)
- No billing, no plans, no seat caps, no paid tiers — every feature free to every user
- Only gate anywhere: fair-use rate limiting (protects server capacity, not revenue)
- Public transparency page instead of MRR dashboard

### 0.2 Pluggable fast-LLM adapter (new — replaces hardcoded Claude/OpenAI calls)
Because you said you'd use "some other best and fast option," every LLM-touching feature (2.7 assistant, 2.8 narrative, 2.13 spatial copilot) goes through **one adapter interface**, never a direct SDK call:

```
llm_adapter/
  base.py          # abstract class: complete(prompt, context, max_tokens) -> LLMResponse
  groq_adapter.py       # e.g. Llama 3.3 70B / DeepSeek on Groq — very low latency
  together_adapter.py   # Together AI — wide model choice
  fireworks_adapter.py  # Fireworks AI — fast inference, good tool-calling support
  config.py         # picks active adapter from env var LLM_PROVIDER, one-line swap
```
Rule: **no feature code ever imports a provider SDK directly.** Everything calls `llm_adapter.complete(...)`. This means when you finalize which fast provider you're using, it's a config change, not a rewrite. Pick the actual provider in Week 18 Day 1 — flagged below.

Node backend mirrors this via `backend/src/services/llm/llm-adapter.js` (OpenAI-compatible: Groq, Together, Fireworks).

---

## PHASE 3.5 — SCORING HARDENING & INTELLIGENCE UPGRADE (Week 14+)

**Status baseline:** 2026-07-20 · Engine **`v3-investment`**

This phase closes every limitation identified in the scoring/intelligence audit. Items are grouped by priority; checkboxes reflect implementation in repo.

### Audit → fix mapping

| Original limitation | Resolution | Status |
|---------------------|------------|--------|
| Not true AI — rule-only insights | LLM narrative layer (`narrative-insights.service.js`) with rule-based fallback; PostGIS scores remain ground truth | ✅ Scaffold |
| Infrastructure saturates at 100 | Per-category log saturation: health / education / civic curves, weighted blend | ✅ Done |
| Environmental label confusing | UI: **Env. suitability** + tooltip “Higher = safer” | ✅ Done |
| Air quality = 0 placeholder | CPCB seed stations (`aqi_stations`) + blend with spatial proxy | ✅ Done |
| Govt offices = jails table | Electric stations, transformers, ITI within 5 km | ✅ Done |
| Zone fit coarse / binary | Continuous proximity + HSIIDC inside + `lu_lc` land use + controlled/development plan | ✅ Done |
| Same sector everywhere | Sector weight profiles (industrial/residential/commercial/agricultural) | ✅ Done |
| No land price / ROI | `circle_rates` + `land_transactions` → `land-value.service.js` | ✅ Done |
| No historical outcomes | `zone_outcomes` seed + `train_investment_model.py` | ✅ Scaffold |
| No formula transparency | `scoreBreakdown` API + `ScoreBreakdown.jsx` UI | ✅ Done |
| No comparables | `comparable-sites.service.js` — sites within 10 km scored | ✅ Done |
| No policy citations | `policy_documents` RAG corpus + retrieval in insights | ✅ Done |

### Quick wins (1–2 weeks) — **complete**

- [x] Rename Environmental → Environmental suitability + tooltip
- [x] Log-scaled infrastructure (separate curves per amenity class)
- [x] Formula breakdown in UI (`details.*.metrics.formula`, expandable breakdown)
- [x] Sector-specific composite weights
- [x] ML service on port **8002** (`ML_SERVICE_URL=http://127.0.0.1:8002`)

**Verify quick wins:**

```powershell
cd backend && npm test
$body = @{ lat = 28.45; lng = 76.9; sector = 'industrial' } | ConvertTo-Json -Compress
Invoke-RestMethod http://localhost:3002/api/analysis/score-location -Method Post -ContentType application/json -Body $body |
  Select-Object scoringVersion, overallScore, @{n='infra';e={$_.scores.infrastructure}}
```

### Medium term (Phase 4–5) — **implemented (seed data; production feeds TBD)**

| Task | Implementation | Production next step |
|------|----------------|---------------------|
| Real air quality | `aqi_stations` table + nearest-station blend | Ingest live CPCB API nightly |
| CLU / zoning | `zoning-context.service.js` — HSIIDC, `lu_lc`, controlled/DP layers | Add CLU status attribute table when sourced |
| Power & water utilities | Count water/sewer/electric/HVPNL lines + power assets in zone score | DIS/HVPNL live capacity API |
| Comparable parcels | `comparable-sites.service.js` | Expand `land_transactions` from registrar feed |
| Train XGBoost | `ml-service/scripts/train_investment_model.py` | Replace seed labels with real occupancy/lease data |

**Train model (dev):**

```powershell
cd ml-service
$env:ML_MIN_TRAINING_ROWS=30
python scripts/train_investment_model.py
uvicorn main:app --host 127.0.0.1 --port 8002
```

**Migrate new tables:**

```powershell
cd backend && npm run db:migrate
```

### True AI insights (Week 18+ roadmap) — **scaffold in place**

- [x] LLM adapter interface (`backend/src/services/llm/llm-adapter.js`) — Groq/OpenAI-compatible
- [x] Grounded narrative: structured JSON context → memo; never invent numbers
- [x] Rule-based fallback when `LLM_ENABLED` false or timeout
- [x] Policy RAG seed corpus (`policy_documents`) — keyword retrieval, citations in UI
- [x] Full `POST /api/assistant/ask` conversational widget (Week 18)
- [x] SSE streaming + map grounding (Week 18 Day 3–4)
- [ ] PDF narrative block (Week 19)

**Enable LLM narrative (optional):**

```env
LLM_ENABLED=true
GROQ_API_KEY=your_key
LLM_MODEL=llama-3.3-70b-versatile
LLM_BASE_URL=https://api.groq.com/openai/v1
```

### Key files (Phase 3.5)

| Concern | Path |
|---------|------|
| Scoring v3 formulae | `backend/src/services/scoring-engine.js` |
| AQI stations | `backend/db/scoring_extensions.sql`, `aqi.service.js` |
| Zoning context | `zoning-context.service.js` |
| Land value / market premium vs floor | `land-value.service.js` |
| Comparables | `comparable-sites.service.js` |
| LLM + narrative | `llm/llm-adapter.js`, `narrative-insights.service.js` |
| Policy RAG | `policy-rag.service.js` |
| Orchestrator (merge all) | `scoringOrchestrator.js` |

Full formulae and test guide: [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md).

---

## PHASE 4 — AI FOUNDATIONS (Weeks 13–16)

### WEEK 13 — ML Service Scaffolding

**Day 1**
- **09:00–11:00** — `mkdir ml-service && cd ml-service`; `python -m venv .venv`; create `requirements.txt` with `fastapi==0.11x`, `uvicorn`, `pydantic`; `pip install -r requirements.txt`; init git submodule or standalone repo (decide now, document choice in `ml-service/README.md`)
- **11:00–13:00** — write `main.py` with FastAPI app instance; add `GET /health` (returns `{"status":"ok"}`), `GET /ready` (checks DB connection pool + model registry reachable), `GET /version` (returns git SHA env var)
- **14:00–16:00** — write `Dockerfile`: stage 1 `python:3.11-slim` builder installs deps into venv, stage 2 copies venv + app code, `CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000"]`; build locally: `docker build -t locatium-ml:dev .`
- **16:00–18:00** — add `ml-service` block to root `docker-compose.yml` (image, ports `8000:8000`, env_file, depends_on postgres/redis); run `docker compose up -d ml-service`; curl `localhost:8000/health` and confirm 200

**Day 2**
- **09:00–11:00** — create `schemas.py`: Pydantic `MLResponse` model with fields `method: Literal["ml","heuristic"]`, `confidence: float`, `model_version: str`, `result: dict`; write 3 unit tests validating serialization
- **11:00–13:00** — write `docs/ml-response-contract.md` with the exact JSON shape + one example each for `ml` and `heuristic` responses; get it reviewed/signed off before writing more code (this contract is load-bearing for the rest of Phase 4)
- **14:00–16:00** — build stub endpoint `POST /score/dummy` in `routers/dummy.py`; always returns `method: "heuristic"`, `confidence: 1.0`, `model_version: "stub-v0"`
- **16:00–18:00** — write pytest for `/score/dummy`: assert status 200, assert schema matches `MLResponse`, assert `method == "heuristic"`

**Day 3**
- **09:00–11:00** — in Node backend, create `services/mlClient.js`; use `axios` or `node-fetch` with explicit `timeout: 2500` (ms); export `scoreDummy(payload)`
- **11:00–13:00** — write `services/fallbackScoring.js` wrapper around the existing Week 5 heuristic function — this becomes the single call site everything routes to on failure
- **14:00–16:00** — write `services/scoringOrchestrator.js`: tries `mlClient.scoreDummy()`, catches timeout/5xx/network error, falls to `fallbackScoring`, logs `{event: "ml_fallback_triggered", reason, endpoint}` on every fallback
- **16:00–18:00** — unit test `scoringOrchestrator` with a mocked `mlClient` that (a) succeeds, (b) times out, (c) throws 500 — assert correct branch taken each time

**Day 4**
- **09:00–11:00** — wire `POST /api/analysis/score-location` (Node route) to call `scoringOrchestrator`
- **11:00–13:00** — integration test: full request with `ml-service` container running → expect `method: "heuristic"` (still stub stage, expected)
- **14:00–16:00** — kill ml-service mid-suite (`docker compose stop ml-service`) and rerun the same integration test — confirm no 500, no hang, correct fallback response, correct log line emitted
- **16:00–18:00** — restart ml-service, confirm recovery on next request without a restart of the Node process (no stale circuit-breaker state stuck open)

**Day 5**
- **09:00–11:00** — write `docs/fallback-runbook.md`: what "fallback triggered" alerts mean, how to check if it's a real outage vs expected data-sparsity fallback
- **11:00–13:00** — team review of the response contract + fallback behavior before any real model gets built on top
- **14:00–16:00** — set up basic structured logging format (JSON, correlation ID field reserved for later observability work)
- **16:00–18:00** — Week 13 retro: confirm all 5 days' tests pass in CI (`pytest` + `npm test`), tag repo `phase4-week13-done`

### WEEK 14 — Feature Store + First Real Model (Investment Scoring)

**Day 1**
- **09:00–11:00** — write SQL for materialized view `zone_features`: joins distance-to-highway (PostGIS `ST_Distance` against roads layer), distance-to-rail, distance-to-airport
- **11:00–13:00** — add utility score column (from `Utilities` layer), population density (catchment radius `ST_Buffer` + census join), land type/zoning classification column
- **14:00–16:00** — add facility density column reusing existing Week 4 `/api/features/*` query logic exactly (do not reimplement — call the same SQL function or import the same query builder)
- **16:00–18:00** — `CREATE MATERIALIZED VIEW zone_features AS (...)`; run it; spot-check 5 known zones manually against expected values

**Day 2**
- **09:00–11:00** — write Redis caching wrapper `getZoneFeatures(zoneId)`: check Redis first (key `zone_features:{zoneId}`, TTL 3600s), fall to Postgres materialized view on miss, populate cache on read
- **11:00–13:00** — write nightly refresh script `refresh_zone_features.py` (`REFRESH MATERIALIZED VIEW CONCURRENTLY zone_features;`), wire into a cron container or existing job scheduler
- **14:00–16:00** — test refresh script manually: modify one underlying row, run refresh, confirm materialized view reflects the change, confirm Redis cache doesn't serve stale data past TTL
- **16:00–18:00** — document refresh cadence + manual trigger command in `docs/feature-store.md`

**Day 3**
- **09:00–11:00** — write `train_investment_model.py`: pulls `zone_features` + historical labeled outcomes table (`zone_outcomes`: occupancy_rate, price_appreciation, time_to_lease)
- **11:00–13:00** — check row count per district/sector combination; **expected result at this stage: below the 300-row threshold** — log this clearly, this is correct, not a bug
- **14:00–16:00** — write the XGBoost training function anyway (so it's ready for when data exists), train on whatever synthetic/seed data is available purely to validate the pipeline runs end-to-end
- **16:00–18:00** — log dummy training run to model registry (MLflow or a local JSON file `models/registry.json` with version, metrics, data snapshot hash, row count) — mark this version explicitly as `status: "not_deployed_insufficient_data"`

**Day 4**
- **09:00–11:00** — build `POST /score/investment` in ml-service; first line of the handler checks row-count-per-district against the 300 threshold from the registry metadata
- **11:00–13:00** — if below threshold: call the *same* heuristic formula used by Node's Week 5 scoring (port it into Python once, single source of truth referenced by both, or call back into Node via internal API — decide and document which, avoid two divergent implementations)
- **14:00–16:00** — if above threshold (future case): load model from registry, run prediction, attach `confidence` from model's internal metric
- **16:00–18:00** — every response, either branch, includes `model_version` — heuristic branch returns `"heuristic-v1"` explicitly, not null

**Day 5**
- **09:00–11:00** — wire Node's `/api/analysis/score-location` to call this real `/score/investment` endpoint instead of the dummy one
- **11:00–13:00** — frontend: add badge component `<MethodBadge method={response.method} />` rendering "✓ Verified formula" or "🤖 AI-predicted"
- **14:00–16:00** — integration test asserting badge renders correctly for both response types
- **16:00–18:00** — Week 14 retro + tag `phase4-week14-done`

### WEEK 15 — Land Price Prediction Model

**Day 1**
- **09:00–11:00** — source circle-rate data (govt open data portal if available; else create seed CSV manually for pilot districts) into `circle_rates` table
- **11:00–13:00** — source/seed comparable transaction data into `transactions` table (price, sqft, district, sector, zone_type, date)
- **14:00–16:00** — write `zone_price_features` materialized view joining district/tehsil/sector, proximity features (reuse Week 14 joins verbatim), stub urban-growth-trend column (nullable, filled in Week 16)
- **16:00–18:00** — spot-check view output against 5 manually-verified transaction records

**Day 2**
- **09:00–11:00** — write `train_price_model.py` using CatBoost (native categorical handling for district/zone_type — do not one-hot encode manually, let CatBoost handle it)
- **11:00–13:00** — implement quantile regression (train 3 models: p10, p50, p90) for confidence interval output instead of a single point estimate
- **14:00–16:00** — write local validation split (time-based split, not random — train on older transactions, validate on most recent, this matters for price data), compute R²
- **16:00–18:00** — log run to registry with R² value attached to metadata; note explicit fallback trigger condition: `R² < 0.70`

**Day 3**
- **09:00–11:00** — write the second fallback condition check: count comparables within 5km (`ST_DWithin`) — if `< 15`, trigger fallback regardless of R²
- **11:00–13:00** — build fallback function `circleRateEstimate(zoneId)`: plain SQL median of comparable transactions within 5km, same zone_type — no ML imports in this function at all, keep it provably independent
- **14:00–16:00** — unit test fallback function in isolation (no model, no registry needed to run this test — proves true independence)
- **16:00–18:00** — build undervalued-area flag logic: `predicted_p50 > current_listed_price * 1.15` (or circle rate, whichever exists) → flag `true`

**Day 4**
- **09:00–11:00** — build `POST /score/land-price` endpoint; response includes `predicted_price`, `confidence_interval: [p10, p90]`, `undervalued_flag`, `method`
- **11:00–13:00** — wire branch logic: check R² + comparable count → route to model or `circleRateEstimate` → label response `"circle-rate estimate"` vs `"ml-predicted"` as literal strings in the response, not just internal metadata
- **14:00–16:00** — wire Node's `GET /api/analysis/forecast?zoneId=` to call this endpoint
- **16:00–18:00** — frontend: render confidence interval as a range, not a single number (e.g. "₹18,500–22,000/sq yd"), never show point estimate alone

**Day 5**
- **09:00–11:00** — deliberately pick a data-sparse district (fewer than 15 comparables), run full request end to end, confirm fallback triggers and label is correct
- **11:00–13:00** — deliberately pick a data-rich district, confirm ML path triggers (if enough seed data exists) or confirm graceful "not enough real data yet" state is honest rather than faked
- **14:00–16:00** — write `docs/land-price-model.md`: fallback thresholds, known limitations, seed-data caveats
- **16:00–18:00** — Week 15 retro + tag `phase4-week15-done`

### WEEK 16 — Model Monitoring Dashboard + Phase 4 Wrap

**Day 1**
- **09:00–11:00** — install Evidently AI (or write a hand-rolled weekly stats job if you want to avoid the dependency) in ml-service
- **11:00–13:00** — write `drift_check.py`: compares live prediction distribution (last 7 days) against training-time distribution for both models
- **14:00–16:00** — define drift threshold (e.g. population stability index > 0.25 → flag); wire to auto-set a `degraded: true` flag in the model registry entry
- **16:00–18:00** — wire scoring endpoints to check `degraded` flag and force heuristic mode when true, regardless of confidence — auto-revert until human review

**Day 2**
- **09:00–11:00** — build `fallback_rate_tracker.py`: increments a Redis counter per endpoint per day whenever fallback triggers, separate counter for total requests
- **11:00–13:00** — expose `GET /internal/metrics/fallback-rate` returning per-endpoint daily percentages for the last 30 days
- **14:00–16:00** — build simple Grafana panel (or static HTML chart if Grafana isn't stood up yet) visualizing this — this is the single most important operational number in the whole ML layer, treat it accordingly
- **16:00–18:00** — set an alert threshold (e.g. fallback rate > 50% sustained for 1 hour → Slack notification, investigate)

**Day 3**
- **09:00–11:00** — build the simplified public version of this dashboard for the transparency page (Section 0.1): just "% of AI predictions vs verified formula used this week," no internal details
- **11:00–13:00** — write copy for the transparency page explaining *why* fallback happens (not enough data yet, not a flaw) — govt-transparency tone, plain language
- **14:00–16:00** — wire the public endpoint `GET /api/public/transparency-stats` (cached, rate-limited generously since it's public-facing)
- **16:00–18:00** — QA the public page rendering on mobile + desktop

**Day 4**
- **09:00–11:00** — full regression suite: map viewing works with ml-service stopped, search works, auth works
- **11:00–13:00** — full regression: both scoring endpoints (investment, land-price) tested against sparse and rich data scenarios
- **14:00–16:00** — load test both scoring endpoints at expected traffic (use `k6` or `locust`) — confirm 2.5s timeout budget is realistic under load, adjust if p95 latency is too close to the timeout
- **16:00–18:00** — fix any latency issues found (add caching, reduce feature-join complexity, etc.)

**Day 5**
- **09:00–11:00** — write up both shipped models in `docs/model-cards.md`: version, training data date, known limitations, intended use, explicit statement of what it should NOT be used for
- **11:00–13:00** — Phase 4 demo/walkthrough for the team: show badge switching live, show fallback triggering live, show dashboard
- **14:00–16:00** — retro: what to fix before Phase 5 (write concrete tickets, not vague notes)
- **16:00–18:00** — tag `phase4-complete`, cut a changelog entry

---

## PHASE 5 — PUBLIC PLATFORM FEATURES (Weeks 17–21)

### WEEK 17 — Department Workspaces

**Day 1**
- **09:00–11:00** — write migration: `departments (id, name, created_at)`, `department_memberships (department_id, user_id, role)`, `usage_counters (api_key_id, date, request_count)` — explicitly **no** `plans` table
- **11:00–13:00** — run migration on staging DB, verify FK constraints
- **14:00–16:00** — seed script: 2 test departments ("HARSAC Internal", "Urban Development Dept") with 2 test users each
- **16:00–18:00** — write model/ORM classes for the new tables, basic CRUD unit tests

**Day 2**
- **09:00–11:00** — add `api_keys` table (key_hash, department_id, created_at, revoked_at) — self-serve generation, no payment step anywhere in this flow
- **11:00–13:00** — build `POST /api/keys/generate` (auth required, no plan check)
- **14:00–16:00** — build rate-limit middleware keyed on API key (fallback to per-IP if no key present) — default limit e.g. 2000 req/day, stored as a constant, not read from a nonexistent plans table
- **16:00–18:00** — unit test middleware: under limit passes, over limit returns 429 with friendly JSON body + `Retry-After` header

**Day 3**
- **09:00–11:00** — build `GET /api/department/usage` — returns current usage vs the flat fair-use limit
- **11:00–13:00** — build `POST /api/department/invite` — no seat cap check anywhere in this function, grep the file afterward to confirm
- **14:00–16:00** — build `GET /api/department/members`
- **16:00–18:00** — integration test: invite flow, confirm new member inherits department access immediately, no billing webhook dependency

**Day 4**
- **09:00–11:00** — frontend: department switcher UI component for users belonging to multiple departments
- **11:00–13:00** — frontend: usage meter widget showing "X of 2000 requests today" — framed as informational, not a paywall countdown
- **14:00–16:00** — frontend: API key management page (generate, copy, revoke)
- **16:00–18:00** — manual QA pass on all department UI flows

**Day 5**
- **09:00–11:00** — codebase-wide grep for `plan`, `subscription`, `billing`, `stripe`, `razorpay` — confirm zero hits outside historical docs/changelog
- **11:00–13:00** — security review of API key generation/revocation flow
- **14:00–16:00** — load test rate-limit middleware specifically (burst traffic scenario) to confirm it doesn't become the bottleneck
- **16:00–18:00** — Week 17 retro + tag `phase5-week17-done`

### WEEK 18 — "Ask LOCATIUM" Conversational Assistant

**Day 1 — ⚠️ LLM provider decision happens here**
- **09:00–11:00** — finalize which fast LLM provider you're using (Groq/Llama or DeepSeek, Together AI, Fireworks AI — whichever tested fastest/cheapest for you); create account, get API key, store in secrets manager (never `.env` in prod, per Phase 6 rules pulled forward)
- **11:00–13:00** — implement `llm_adapter/base.py` abstract class (`complete(system_prompt, context, user_query, max_tokens) -> LLMResponse`)
- **14:00–16:00** — implement the concrete adapter for your chosen provider only (e.g. `groq_adapter.py`); write `config.py` reading `LLM_PROVIDER` env var to select it — even with one provider implemented, keep the interface generic so adding a second later is a new file, not a rewrite
- **16:00–18:00** — write a throwaway script hitting the adapter with a trivial prompt, confirm round-trip latency (this matters — "fast" was the whole point of the swap, measure it now as a baseline)

**Day 2**
- **09:00–11:00** — build retrieval layer: function `fetchGroundingContext(query, zoneId?)` pulling live data from `/api/features/*`, `/api/maps/*`, score endpoints relevant to the query
- **11:00–13:00** — write the system prompt: explicit instruction to only use numbers present in the provided context block, explicit instruction to say "I don't have that data" rather than guess
- **14:00–16:00** — write 5 adversarial test prompts designed to bait the model into using outside "knowledge" (e.g. asking about a fact plausible-sounding but not in context) — run them, check for hallucination
- **16:00–18:00** — tighten prompt based on adversarial test results, rerun until all 5 pass (model declines or asks for clarification instead of inventing)

**Day 3**
- **09:00–11:00** — build `POST /api/assistant/ask` with SSE streaming; wire through `llm_adapter`
- **11:00–13:00** — add explicit 4-second timeout on the full round trip (retrieval + LLM call); on timeout, emit an SSE event signaling frontend to fall back
- **14:00–16:00** — error-path test: kill network to LLM provider mid-request, confirm graceful SSE termination, no hung connection
- **16:00–18:00** — rate-limit this endpoint separately from general API (LLM calls cost more — protect budget even without billing, since it's still infra cost)

**Day 4**
- **09:00–11:00** — frontend: build chat widget component with streaming text render
- **11:00–13:00** — frontend: wire fallback — on timeout/error event, auto-swap widget to the guided FAQ + dropdown filter search UI (reuse existing Week 4 filter panel component, don't rebuild)
- **14:00–16:00** — add visible disclaimer text in the widget: "Answers are generated live from our data — verify against the map"
- **16:00–18:00** — cross-browser test the streaming UI (SSE support quirks)

**Day 5**
- **09:00–11:00** — full end-to-end test: ask 10 realistic questions, manually verify every number in every answer traces to a real API response
- **11:00–13:00** — measure and log latency distribution over these 10 (p50/p95) — confirm the "fast" provider choice is actually paying off vs a baseline you'd have gotten from a slower model
- **14:00–16:00** — write `docs/assistant-guardrails.md` documenting the anti-hallucination design for future maintainers
- **16:00–18:00** — Week 18 retro + tag `phase5-week18-done`

### WEEK 19 — Narrative Reports + Facility Gap Analysis

**Day 1**
- **09:00–11:00** — extend Week 7 PDF generator: after tables/scores are computed, call `llm_adapter.complete()` with a prompt containing exactly those computed values, asking for a 1–2 paragraph executive summary
- **11:00–13:00** — wrap this call in try/catch with a 4s timeout matching the assistant's pattern
- **14:00–16:00** — on failure: PDF generation continues without the narrative block, insert placeholder text "Narrative summary unavailable — showing data tables"
- **16:00–18:00** — test: force LLM failure, confirm PDF still downloads successfully and is fully valid (open it, check it's not corrupted)

**Day 2**
- **09:00–11:00** — since reports are unlimited/free (no "5/mo" cap), add report-generation-specific rate limiting (separate bucket from general API — PDF rendering + LLM call is the most compute-expensive single action in the app)
- **11:00–13:00** — build `GET /api/reports/:id/status` (queued/processing/done/failed states)
- **14:00–16:00** — build `GET /api/reports/:id/download`
- **16:00–18:00** — integration test full lifecycle: request → status polling → download

**Day 3**
- **09:00–11:00** — implement KMeans clustering (scikit-learn) in ml-service: input = facility density + population grid, output = underserved-pocket clusters
- **11:00–13:00** — also implement DBSCAN as an alternative, compare cluster quality on real data, pick whichever performs better for the actual data shape (document the choice + why)
- **14:00–16:00** — build fallback: grid-based density heatmap via `GROUP BY` grid-cell query — ship and test this independently of the clustering code
- **16:00–18:00** — build `GET /api/analysis/facility-gap?zoneId=`, wire fallback trigger (e.g. clustering job timeout or insufficient grid resolution)

**Day 4**
- **09:00–11:00** — frontend: heatmap overlay layer for facility-gap results on the map
- **11:00–13:00** — frontend: cluster boundary rendering when ML path is active vs plain grid cells when fallback is active — visually distinct, same badge pattern as scoring features
- **14:00–16:00** — test with ml-service down: confirm grid heatmap still renders correctly, no broken map layer
- **16:00–18:00** — performance test: facility-gap query against the largest district in the dataset, confirm acceptable latency

**Day 5**
- **09:00–11:00** — full report generation test with ml-service intentionally stopped — confirm PDF ships without narrative, cleanly labeled
- **11:00–13:00** — full facility-gap test in fallback-only mode
- **14:00–16:00** — write `docs/reports-and-gap-analysis.md`
- **16:00–18:00** — Week 19 retro + tag `phase5-week19-done`

### WEEK 20 — Notifications + Embeddable Widget

**Day 1**
- **09:00–11:00** — build `webhook_subscriptions` table (user_id, zone_id, watched_metric, created_at)
- **11:00–13:00** — build `POST /api/webhooks/subscribe`
- **14:00–16:00** — build background job `check_watched_zones.py`: compares latest score/risk against last-notified value per subscription, queues notification on change
- **16:00–18:00** — unit test the diff logic (no change → no notification; change above noise threshold → notification fires)

**Day 2**
- **09:00–11:00** — build email delivery (reuse existing mail service if one exists from auth flows, e.g. password reset emails — same transport)
- **11:00–13:00** — build `GET /api/notifications` for in-app history
- **14:00–16:00** — confirm no seat/plan gating anywhere in this flow — any signed-up user can watch unlimited zones, protected only by the general fair-use API limit
- **16:00–18:00** — integration test: simulate a score change on a watched zone, confirm notification fires end-to-end (job → DB → email)

**Day 3**
- **09:00–11:00** — scaffold embed: `embed.js` — lightweight script that injects an `<iframe>` pointed at a new `/embed/:zoneId` public route
- **11:00–13:00** — build `/embed/:zoneId` frontend route: stripped-down read-only mini-map, no auth required, no API key required (public-data posture)
- **14:00–16:00** — CORS config: explicitly allow cross-origin embedding for this route only (don't loosen CORS globally)
- **16:00–18:00** — test embed on a throwaway static HTML file hosted on a different local port, confirm it renders correctly

**Day 4**
- **09:00–11:00** — build embed customization options (size, layer selection) via URL query params
- **11:00–13:00** — build the "generate embed code" UI page — user picks a zone/view, gets copy-paste `<iframe>` snippet
- **14:00–16:00** — write public embed docs page
- **16:00–18:00** — rate-limit the public embed route separately (it has no auth, so it's the most exposed surface — needs its own protection)

**Day 5**
- **09:00–11:00** — abuse test: hammer the embed route from a script, confirm rate limiting kicks in without breaking legitimate embedded traffic
- **11:00–13:00** — full notification lifecycle test across a full day boundary (does the daily check job actually run on schedule)
- **14:00–16:00** — write `docs/notifications-and-embeds.md`
- **16:00–18:00** — Week 20 retro + tag `phase5-week20-done`

### WEEK 21 — Saved Searches, Favorites, Public Links + Phase 5 Wrap

**Day 1**
- **09:00–11:00** — build `saved_searches` and `favorites` tables + CRUD endpoints
- **11:00–13:00** — frontend: save/favorite buttons wired into existing search and zone-detail UI
- **14:00–16:00** — build `public_snapshot_links` table (zone_id/search_id, token, created_at, expires_at nullable)
- **16:00–18:00** — build `POST /api/links/create-snapshot` and `GET /s/:token` public no-login view

**Day 2**
- **09:00–11:00** — build zone comments/notes table scoped to department workspace
- **11:00–13:00** — build comment CRUD endpoints with department-membership authorization check
- **14:00–16:00** — frontend: comment thread UI on zone detail page
- **16:00–18:00** — integration test: user from Department A cannot see Department B's internal comments on a shared public zone

**Day 3**
- **09:00–11:00** — full regression: saved searches, favorites, public snapshot links, comments
- **11:00–13:00** — full regression: notifications, embed widget from Week 20
- **14:00–16:00** — full regression: assistant + reports from Weeks 18–19
- **16:00–18:00** — fix any regressions found

**Day 4**
- **09:00–11:00** — final grep sweep for any billing/plan-check code paths introduced accidentally during Phase 5
- **11:00–13:00** — verify every new endpoint added this phase respects the department fair-use rate limit correctly
- **14:00–16:00** — update public transparency page with new stats (assistant usage, reports generated, embeds created)
- **16:00–18:00** — accessibility spot-check on new UI components (comment threads, save buttons, embed generator)

**Day 5**
- **09:00–11:00** — Phase 5 demo/walkthrough for the team
- **11:00–13:00** — retro: concrete tickets for anything rough before Phase 6 hardening starts
- **14:00–16:00** — update `docs/model-cards.md` and `docs/assistant-guardrails.md` if anything changed since Phase 4
- **16:00–18:00** — tag `phase5-complete`, cut changelog entry

---

## PHASE 6 — SCALE & HARDEN (Weeks 22–26)

### WEEK 22 — Kubernetes Migration

**Day 1**
- **09:00–11:00** — write `k8s/backend-deployment.yaml`, `k8s/ml-service-deployment.yaml`, `k8s/frontend-deployment.yaml` (or Helm chart equivalents)
- **11:00–13:00** — write corresponding `Service` manifests for internal networking
- **14:00–16:00** — write `Ingress` config routing `/api/*` → backend, `/embed/*` and `/` → frontend
- **16:00–18:00** — `kubectl apply -f k8s/ -n staging`, debug pod startup issues (image pulls, env vars, secrets)

**Day 2**
- **09:00–11:00** — write HPA manifests: backend and ml-service scale on CPU + custom latency metric
- **11:00–13:00** — ml-service HPA configured with a higher memory floor (model loading footprint) and scaled independently from backend
- **14:00–16:00** — load test staging cluster, watch HPA trigger a scale-up event in real time, confirm new pods pass readiness before receiving traffic
- **16:00–18:00** — tune HPA thresholds based on what you observed (avoid flapping — too-sensitive triggers cause pod churn)

**Day 3**
- **09:00–11:00** — wire readiness probe to `/api/ready` (should check DB + Redis connectivity, not just process-alive)
- **11:00–13:00** — wire liveness probe to `/api/health` (should be cheap/fast, just process-alive)
- **14:00–16:00** — test failure injection: kill DB connection from inside a pod, confirm readiness probe correctly takes it out of the load balancer rotation
- **16:00–18:00** — document probe behavior in `docs/k8s-probes.md`

**Day 4**
- **09:00–11:00** — migrate staging environment fully — no services left on the old docker-compose staging setup
- **11:00–13:00** — run full smoke suite against the new staging cluster
- **14:00–16:00** — run the Phase 4 and Phase 5 regression suites against staging cluster specifically (not just local)
- **16:00–18:00** — fix any cluster-specific issues found (networking, DNS resolution between services, etc.)

**Day 5**
- **09:00–11:00** — write production migration plan document (order of operations, rollback plan if it goes wrong)
- **11:00–13:00** — dry-run the plan against a throwaway cluster
- **14:00–16:00** — get sign-off before touching real production
- **16:00–18:00** — Week 22 retro + tag `phase6-week22-done`

### WEEK 23 — CI/CD Pipeline

**Day 1**
- **09:00–11:00** — write `.github/workflows/ci.yml`: lint step (eslint for Node, ruff/flake8 for Python) across all three services
- **11:00–13:00** — add unit test step for each service, fail the pipeline on any test failure
- **14:00–16:00** — add Docker build step, tag images with `git rev-parse --short HEAD`
- **16:00–18:00** — add push-to-registry step (GHCR or ECR), test with a dummy commit

**Day 2**
- **09:00–11:00** — write auto-deploy-to-staging job triggered on merge to `main`
- **11:00–13:00** — wire `kubectl set image` (or Helm upgrade) commands into the deploy step
- **14:00–16:00** — write smoke test script (`smoke_test.sh`): health check, auth flow, tile fetch, one score endpoint — run against staging post-deploy
- **16:00–18:00** — make smoke test a required gate — pipeline fails/rolls back staging deploy if smoke tests fail

**Day 3**
- **09:00–11:00** — write manual-approval-gate step for production (GitHub Environments protection rule)
- **11:00–13:00** — implement blue-green deploy strategy (or canary — pick based on your k8s setup's traffic-shifting capability) for production
- **14:00–16:00** — write automated rollback trigger: monitor error rate/latency for 10 minutes post-deploy, auto-revert if SLO breached
- **16:00–18:00** — test the whole pipeline end-to-end with a trivial, safe change (e.g. a comment update) all the way to production

**Day 4**
- **09:00–11:00** — add dependency-scanning step (npm audit, pip-audit) as a CI gate, not just a manual periodic check
- **11:00–13:00** — configure Dependabot/Snyk for automated PR creation on vulnerable dependencies
- **14:00–16:00** — triage current dependency vulnerabilities found by the new scan, fix or explicitly accept-and-document each one
- **16:00–18:00** — document the full pipeline in `docs/ci-cd.md` with a diagram

**Day 5**
- **09:00–11:00** — deliberately break a test to confirm the pipeline actually fails the build (test the tester)
- **11:00–13:00** — deliberately trigger a bad deploy on staging to confirm rollback logic works
- **14:00–16:00** — fix any gaps found
- **16:00–18:00** — Week 23 retro + tag `phase6-week23-done`

### WEEK 24 — Infrastructure as Code + Secrets

**Day 1**
- **09:00–11:00** — write Terraform module for VPC/networking
- **11:00–13:00** — write Terraform module for managed Postgres with PostGIS extension enabled
- **14:00–16:00** — write Terraform module for managed Redis
- **16:00–18:00** — `terraform plan` against a scratch environment, review the diff carefully before applying

**Day 2**
- **09:00–11:00** — write Terraform module for the k8s cluster (or managed equivalent)
- **11:00–13:00** — write Terraform module for CDN + object storage (reports/exports bucket)
- **14:00–16:00** — write Terraform module for DNS/SSL (Let's Encrypt or cloud-managed cert)
- **16:00–18:00** — `terraform apply` full stack on a throwaway environment, verify every resource comes up correctly

**Day 3**
- **09:00–11:00** — set up Vault (or cloud Secrets Manager) instance
- **11:00–13:00** — migrate all production secrets (DB creds, Redis creds, LLM API key, JWT signing key) out of `.env` into Vault
- **14:00–16:00** — wire backend/ml-service to fetch secrets from Vault at startup (or via injected env from a sidecar) rather than reading a mounted `.env` file
- **16:00–18:00** — confirm `.env` files are explicitly gitignored and documented as local-dev-only in `README.md`

**Day 4**
- **09:00–11:00** — destroy the throwaway environment fully (`terraform destroy`), confirm clean teardown with no orphaned resources
- **11:00–13:00** — rebuild it from scratch again (`terraform apply`) purely to prove reproducibility, not because you need it
- **14:00–16:00** — document the full "spin up a new environment" runbook in `docs/new-environment.md`
- **16:00–18:00** — review IAM/access policies on all cloud resources — least-privilege check

**Day 5**
- **09:00–11:00** — apply the same Terraform stack to actual staging (replacing manually-created staging resources if any exist)
- **11:00–13:00** — verify staging still passes full regression + smoke suite after the IaC migration
- **14:00–16:00** — plan production IaC migration timing (likely a maintenance window)
- **16:00–18:00** — Week 24 retro + tag `phase6-week24-done`

### WEEK 25 — Observability Stack

**Day 1**
- **09:00–11:00** — deploy Prometheus + Grafana into the cluster
- **11:00–13:00** — instrument backend with `prom-client` (Node) — expose `/metrics` with request latency histograms, request counts by route
- **14:00–16:00** — instrument ml-service with `prometheus-client` (Python) — same pattern plus inference latency specifically
- **16:00–18:00** — build Grafana dashboard: API latency (p50/p95/p99), tile cache hit rate, ML inference latency, fallback-trigger rate (pull the Week 16 metric in here)

**Day 2**
- **09:00–11:00** — set up Sentry project for Node backend, wire SDK, test with a deliberate thrown error
- **11:00–13:00** — set up Sentry project for Python ml-service, wire SDK, test with a deliberate exception
- **14:00–16:00** — confirm source maps / stack traces are readable in Sentry, not minified garbage
- **16:00–18:00** — set up Sentry alert rules (new error type, error spike) → Slack integration

**Day 3**
- **09:00–11:00** — set up centralized logging (Loki, or CloudWatch/ELK depending on cloud) — ship structured JSON logs from all pods
- **11:00–13:00** — add correlation ID middleware: generate ID at request entry (backend), pass it through to ml-service calls via header, include in every log line on both sides
- **14:00–16:00** — build a Grafana/Kibana view to trace a single request's full journey by correlation ID across services
- **16:00–18:00** — test: trigger a request that touches both backend and ml-service, confirm you can trace it end-to-end by ID alone

**Day 4**
- **09:00–11:00** — set up external uptime monitor (UptimeRobot or Better Uptime) hitting `/api/health` from outside the cluster, 1-minute interval
- **11:00–13:00** — configure uptime alert → Slack/email
- **14:00–16:00** — set up alerting tiers: P1 (site down, health check failing) → PagerDuty-style escalation with phone/SMS; P2/P3 (elevated fallback rate, elevated latency) → Slack only
- **16:00–18:00** — write `docs/on-call-runbook.md`: what each alert means, first steps to check

**Day 5**
- **09:00–11:00** — fire a test P1 alert (simulate health check failure), confirm escalation path actually works end-to-end
- **11:00–13:00** — fire a test P2 alert (simulate elevated fallback rate), confirm Slack-only routing
- **14:00–16:00** — review all dashboards together as a team, confirm nothing important is unmonitored
- **16:00–18:00** — Week 25 retro + tag `phase6-week25-done`

### WEEK 26 — Security Hardening + Data Resilience

**Day 1**
- **09:00–11:00** — set up Cloudflare (or AWS WAF) in front of the public ingress
- **11:00–13:00** — configure WAF rate limiting rules (separate from application-level rate limiting — this is the outer perimeter layer)
- **14:00–16:00** — configure basic bot protection / challenge rules on the public embed route specifically (it's unauthenticated, highest exposure)
- **16:00–18:00** — load test through the WAF to confirm it doesn't add unacceptable latency to legitimate traffic

**Day 2**
- **09:00–11:00** — audit every analysis/admin route — confirm role checks are actually enforced in middleware, not just present in the DB schema
- **11:00–13:00** — write tests specifically for unauthorized access attempts (logged-in-but-wrong-role user hitting admin routes) — confirm 403, not silent data leak
- **14:00–16:00** — fix any routes found missing enforcement (per original plan, this was a known gap since Week 10 — close it definitively now)
- **16:00–18:00** — re-run the full auth/role test suite, confirm 100% pass

**Day 3**
- **09:00–11:00** — add CSP headers to frontend build config
- **11:00–13:00** — add XSS-hardening review of any place user input gets rendered (comments, saved search names) — confirm proper escaping/sanitization
- **14:00–16:00** — verify the dependency-scanning CI gate from Week 23 is still catching new issues, not stale
- **16:00–18:00** — fix any newly-surfaced dependency vulnerabilities

**Day 4**
- **09:00–11:00** — configure automated nightly Postgres backups with point-in-time recovery enabled
- **11:00–13:00** — verify backup files are actually landing in storage (don't assume — check)
- **14:00–16:00** — write the restore runbook step by step
- **16:00–18:00** — confirm Redis explicitly has no backup requirement documented (it's cache-only, fast warm-up on restart is the accepted behavior) — write this down so nobody "fixes" it unnecessarily later

**Day 5**
- **09:00–11:00** — execute an actual restore drill: spin up a scratch Postgres instance, restore from last night's backup
- **11:00–13:00** — verify data integrity post-restore (row counts, spot-check known records)
- **14:00–16:00** — document restore time (how long did it actually take — this number matters for your recovery-time expectations)
- **16:00–18:00** — Week 26 retro + tag `phase6-complete`

---

## PHASE 7 — PUBLIC LAUNCH (Weeks 27–28)

### WEEK 27 — Pilot + Final Feature Push

**Day 1**
- **09:00–11:00** — onboard pilot department #1 (department workspace, API keys, walkthrough of assistant/reports)
- **11:00–13:00** — onboard pilot department #2
- **14:00–16:00** — onboard pilot department #3 if ready
- **16:00–18:00** — set up a dedicated feedback channel (shared doc or Slack channel) for pilot users

**Day 2**
- **09:00–11:00** — collect and triage first-day pilot feedback
- **11:00–13:00** — fix any critical UX issues found immediately (don't let small friction compound across the pilot week)
- **14:00–16:00** — begin Sentinel-2 ingestion pipeline for satellite change detection (2.3) if not already live — free ESA imagery source setup
- **16:00–18:00** — write NDVI computation function against ingested tiles

**Day 3**
- **09:00–11:00** — continue satellite pipeline: monthly refresh job scheduling
- **11:00–13:00** — build environmental risk forecasting model (2.5) using the same tabular Random Forest approach as other Tier S features, reusing the NDVI + LULC + rainfall feature joins
- **14:00–16:00** — wire fallback: existing static `Environmental_Constraints` layer rule, same trigger logic as 2.3 (cloud cover, stale data)
- **16:00–18:00** — test both new features end-to-end with fallback forced (no satellite data available scenario)

**Day 4**
- **09:00–11:00** — full-team bug bash with pilot users in the room — everyone actively trying to break things for 2 hours
- **11:00–13:00** — triage bug list by severity, assign owners
- **14:00–16:00** — fix P0/P1 bugs found
- **16:00–18:00** — fix P0/P1 bugs found (continued — don't compress this, bug bashes always surface more than expected)

**Day 5**
- **09:00–11:00** — retest all bug-bash fixes
- **11:00–13:00** — final pilot feedback session, confirm departments are comfortable with the platform
- **14:00–16:00** — go/no-go review meeting for public launch
- **16:00–18:00** — Week 27 retro + tag `phase7-week27-done`

### WEEK 28 — Public Launch

**Day 1**
- **09:00–11:00** — accessibility pass: screen reader test on main navigation and map controls
- **11:00–13:00** — accessibility pass: color contrast check on all new UI (badges, dashboards, transparency page)
- **14:00–16:00** — keyboard-navigation test on the map interface and forms
- **16:00–18:00** — fix accessibility issues found

**Day 2**
- **09:00–11:00** — finalize OpenAPI/Swagger spec covering all public-facing endpoints
- **11:00–13:00** — stand up the public API docs portal
- **14:00–16:00** — build self-serve free API key signup flow (confirm zero payment step, per Section 0.1)
- **16:00–18:00** — test the full signup-to-first-API-call flow as a brand-new user would experience it

**Day 3**
- **09:00–11:00** — finalize public transparency page content: uptime history (pull from Week 25 monitor), usage stats, model accuracy stats, fallback rates
- **11:00–13:00** — publish the page, cross-check every number against the actual source dashboards (no rounding/spin — govt-transparency standard means the real numbers, good or bad)
- **14:00–16:00** — write launch announcement copy
- **16:00–18:00** — final proofread pass across all public-facing docs and pages

**Day 4**
- **09:00–11:00** — load test at expected public-launch traffic level (estimate based on comparable govt portal traffic, pad by 2–3x for safety)
- **11:00–13:00** — confirm HPA scales correctly under this synthetic load in staging
- **14:00–16:00** — confirm WAF and application rate limits hold under the same load without blocking legitimate traffic
- **16:00–18:00** — final production readiness checklist review (all Phase 6 items checked off)

**Day 5 — Launch Day**
- **09:00–10:00** — final production deploy via the blue-green pipeline built in Week 23
- **10:00–11:00** — post-deploy smoke test on production itself
- **11:00–12:00** — publish announcement, open public access
- **12:00–18:00** — active monitoring: dashboards open continuously, team on standby, rollback plan within reach, no other work scheduled — this block is monitoring, not building

---

## Standing Rules (apply every single day, not just once)

- Every ML endpoint response always includes `method`, `confidence`, `model_version` — grep for this before merging any new ML endpoint
- No core user flow (map viewing, search, auth) ever hard-depends on ml-service or the LLM adapter being up
- Every AI feature ships its rule-based fallback **first**, tested in isolation, before the ML/LLM layer is wired on top
- Every LLM-touching feature goes through `llm_adapter` — never a direct provider SDK import in feature code
- No feature, endpoint, or UI element anywhere is gated behind payment, plan, or seat count — the only gate is the fair-use rate limit, and its purpose is server protection, documented as such