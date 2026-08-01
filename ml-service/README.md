# LOCATIUM ML Service

Standalone Python service (lives in the monorepo, not a git submodule) that powers ML-assisted scoring with deterministic fallbacks.

## Quick start

```bash
cd ml-service
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Health: `GET http://localhost:8000/health`

## Docker

From repo root:

```bash
docker compose up -d ml-service
curl http://localhost:8000/health
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Optional Postgres URL for `/ready` DB check |
| `GIT_SHA` | `dev` | Shown by `/version` |
| `LOG_LEVEL` | `info` | Logging verbosity |

## Land pricing features

`feature_engine.extract_location_features` now includes gov collector floor + attributable comps:

| Feature | Source |
|---------|--------|
| `circle_rate_median_inr` | `circle_rates` (excludes `haryana_seed`) |
| `comps_median_inr` / `comps_count` | `land_transactions` within 10 km / 36 mo |
| `market_premium_vs_floor` | (comps − floor) / floor |

Train after refreshing the feature store:

```bash
cd backend && npm run refresh:zone-features
cd ../ml-service && python scripts/train_investment_model.py
```

Model artifact: `investment-v2.joblib` (`feature_set: spatial_v1+land_v1`).
