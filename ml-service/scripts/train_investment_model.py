#!/usr/bin/env python3
"""Train investment XGBoost model from zone_features + zone_outcomes (spatial + land ₹)."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import asyncpg
import joblib
import numpy as np
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor

from services.heuristic_scoring import feature_vector
from services.registry import REGISTRY_PATH, load_registry, save_registry

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
MIN_ROWS = int(os.getenv("ML_MIN_TRAINING_ROWS", "25"))
MODEL_VERSION = "investment-v2"
ARTIFACT = "investment-v2.joblib"


async def fetch_training_rows() -> list[dict]:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required for training")

    conn = await asyncpg.connect(database_url)
    try:
        rows = await conn.fetch(
            """
            SELECT
              zf.dist_road_km, zf.dist_rail_km, zf.dist_airport_km, zf.dist_industrial_km,
              zf.dist_forest_km, zf.dist_flood_km,
              zf.hospitals_5km, zf.schools_5km, zf.utilities_2km, zf.roads_3km,
              zf.circle_rate_median_inr, zf.circle_rate_sample_count,
              zf.comps_median_inr, zf.comps_count,
              zo.label_score, zf.district, zf.zone_id
            FROM zone_features zf
            JOIN zone_outcomes zo ON zo.zone_id = zf.zone_id
            WHERE zo.label_score IS NOT NULL
            """
        )
        return [dict(row) for row in rows]
    finally:
        await conn.close()


def rows_to_matrix(rows: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    features = []
    labels = []
    for row in rows:
        circle = row.get("circle_rate_median_inr")
        comps = row.get("comps_median_inr")
        premium = None
        if circle is not None and comps is not None and float(circle) > 0:
            premium = (float(comps) - float(circle)) / float(circle)
        feature_map = {
            "dist_road_km": row.get("dist_road_km"),
            "dist_rail_km": row.get("dist_rail_km"),
            "dist_airport_km": row.get("dist_airport_km"),
            "dist_industrial_km": row.get("dist_industrial_km"),
            "dist_forest_km": row.get("dist_forest_km"),
            "dist_flood_km": row.get("dist_flood_km"),
            "dist_water_km": None,
            "hospitals_5km": row.get("hospitals_5km"),
            "schools_5km": row.get("schools_5km"),
            "utilities_2km": row.get("utilities_2km"),
            "roads_3km": row.get("roads_3km"),
            "civic_facilities_5km": 0,
            "dist_metro_km": None,
            "bus_stops_2km": 0,
            "circle_rate_median_inr": float(circle) if circle is not None else None,
            "comps_median_inr": float(comps) if comps is not None else None,
            "comps_count": row.get("comps_count") or 0,
            "market_premium_vs_floor": premium,
            "has_gov_floor": 1.0 if circle is not None else 0.0,
        }
        features.append(feature_vector(feature_map))
        labels.append(float(row["label_score"]))
    return np.array(features, dtype=np.float32), np.array(labels, dtype=np.float32)


def update_registry(status: str, metrics: dict, row_count: int, artifact: str | None = None) -> None:
    registry = load_registry()
    models = registry.setdefault("models", [])
    entry = next((m for m in models if m.get("name") == "investment-scoring"), None)
    if entry is None:
        entry = {"name": "investment-scoring"}
        models.append(entry)

    entry.update(
        {
            "version": MODEL_VERSION if status == "deployed" else entry.get("version", "stub-v0"),
            "status": status,
            "row_count": row_count,
            "min_training_rows": MIN_ROWS,
            "feature_set": "spatial_v1+land_v1",
            "metrics": metrics,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "degraded": False,
        }
    )
    if artifact:
        entry["artifact"] = artifact
        entry["confidence"] = metrics.get("confidence", 0.85)

    save_registry(registry)
    print(json.dumps(entry, indent=2))


async def main() -> None:
    rows = await fetch_training_rows()
    row_count = len(rows)
    print(f"Training rows available: {row_count} (threshold={MIN_ROWS})")
    print(f"Registry path: {REGISTRY_PATH}")

    if row_count < MIN_ROWS:
        update_registry(
            "not_deployed_insufficient_data",
            {"r2": None, "mae": None, "note": f"Need {MIN_ROWS} rows, have {row_count}"},
            row_count,
        )
        print("Insufficient labeled data — heuristic remains active.")
        return

    x, y = rows_to_matrix(rows)
    print(f"Feature dim: {x.shape[1]}")
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42)

    model = XGBRegressor(
        n_estimators=120,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        objective="reg:squarederror",
        random_state=42,
    )
    model.fit(x_train, y_train)

    preds = model.predict(x_test)
    r2 = float(r2_score(y_test, preds))
    mae = float(mean_absolute_error(y_test, preds))
    confidence = max(0.5, min(0.95, r2))

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODELS_DIR / ARTIFACT)

    update_registry(
        "deployed",
        {"r2": round(r2, 4), "mae": round(mae, 2), "confidence": round(confidence, 3)},
        row_count,
        ARTIFACT,
    )
    print(f"Model deployed: {MODEL_VERSION} r2={r2:.4f}, mae={mae:.2f}")


if __name__ == "__main__":
    asyncio.run(main())
