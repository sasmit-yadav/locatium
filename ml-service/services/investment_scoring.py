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
    features = await extract_location_features(location["lat"], location["lng"], location["sector"])
    district = features.get("district") or await nearest_district(location["lat"], location["lng"])
    district_rows = await district_row_count(district)
    global_rows = await district_row_count(None)
    threshold = min_rows_threshold()

    heuristic = heuristic_score_location(features, location["sector"])
    land_meta = {
        "circleRateMedianInr": features.get("circle_rate_median_inr"),
        "compsMedianInr": features.get("comps_median_inr"),
        "compsCount": features.get("comps_count"),
        "marketPremiumVsFloor": features.get("market_premium_vs_floor"),
        "hasGovFloor": bool(features.get("has_gov_floor")),
    }

    # Model is trained on statewide zone_features; gate on global labeled rows.
    if global_rows >= threshold and can_use_ml(global_rows):
        try:
            ml_score, confidence = predict_investment_score(features)
            entry = get_model_entry("investment-scoring") or {}
            return {
                "method": "ml",
                "confidence": confidence,
                "model_version": entry.get("version") or "investment-v2",
                "result": {
                    **heuristic,
                    "overallScore": ml_score,
                    "location": location,
                    "mlAdjusted": True,
                    "district": district,
                    "trainingRows": global_rows,
                    "districtTrainingRows": district_rows,
                    "landFeatures": land_meta,
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
            "trainingRows": global_rows,
            "districtTrainingRows": district_rows,
            "insufficientData": global_rows < threshold,
            "landFeatures": land_meta,
        },
    }
