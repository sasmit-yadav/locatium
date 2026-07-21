from __future__ import annotations

from services.feature_engine import (
    district_row_count,
    extract_location_features,
    nearest_district,
    validate_location,
)
from services.heuristic_scoring import score_location as heuristic_score_location
from services.investment_model import can_use_ml, predict_investment_score
from services.registry import get_model_entry, min_rows_threshold


async def score_investment(lat: float, lng: float, sector: str = "industrial") -> dict:
    location = validate_location(lat, lng, sector)
    features = await extract_location_features(location["lat"], location["lng"])
    district = await nearest_district(location["lat"], location["lng"])
    row_count = await district_row_count(district)
    threshold = min_rows_threshold()

    heuristic = heuristic_score_location(features, location["sector"])

    if row_count >= threshold and can_use_ml(row_count):
        try:
            ml_score, confidence = predict_investment_score(features)
            entry = get_model_entry("investment-scoring") or {}
            return {
                "method": "ml",
                "confidence": confidence,
                "model_version": entry.get("version") or "investment-v1",
                "result": {
                    **heuristic,
                    "overallScore": ml_score,
                    "location": location,
                    "mlAdjusted": True,
                    "district": district,
                    "trainingRows": row_count,
                },
            }
        except Exception:
            pass

    return {
        "method": "heuristic",
        "confidence": 1.0,
        "model_version": "heuristic-v1",
        "result": {
            **heuristic,
            "location": location,
            "district": district,
            "trainingRows": row_count,
            "insufficientData": row_count < threshold,
        },
    }
