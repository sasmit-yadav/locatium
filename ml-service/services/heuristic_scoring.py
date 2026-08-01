"""LOCATIUM scoring engine v2 — mirrors backend/src/services/scoring-engine.js."""

from __future__ import annotations

import math
from typing import Any

SCORING_VERSION = "v2-industry"

SECTOR_WEIGHTS: dict[str, dict[str, float]] = {
    "industrial": {
        "infrastructure": 0.2,
        "accessibility": 0.35,
        "environmentalRisk": 0.25,
        "zoneCompatibility": 0.2,
    },
    "residential": {
        "infrastructure": 0.35,
        "accessibility": 0.25,
        "environmentalRisk": 0.25,
        "zoneCompatibility": 0.15,
    },
    "commercial": {
        "infrastructure": 0.25,
        "accessibility": 0.35,
        "environmentalRisk": 0.2,
        "zoneCompatibility": 0.2,
    },
    "agricultural": {
        "infrastructure": 0.15,
        "accessibility": 0.2,
        "environmentalRisk": 0.45,
        "zoneCompatibility": 0.2,
    },
}


def clamp_score(value: float) -> int:
    return max(0, min(100, round(value)))


def proximity_score(distance_km: float | None, max_km: float) -> int:
    if distance_km is None:
        return 0
    return clamp_score((1 - min(distance_km / max_km, 1)) * 100)


def risk_from_distance(distance_km: float | None, max_km: float) -> int:
    if distance_km is None:
        return 0
    return clamp_score((1 - min(distance_km / max_km, 1)) * 100)


def saturating_score(raw_points: float, half_saturation: float = 55) -> int:
    if raw_points <= 0:
        return 0
    return clamp_score(100 * (1 - math.exp(-raw_points / half_saturation)))


def normalize_sector(sector: str) -> str:
    key = (sector or "industrial").strip().lower()
    return key if key in SECTOR_WEIGHTS else "industrial"


def estimate_air_quality_risk(
    nearest_municipal_km: float | None,
    nearest_industrial_km: float | None,
    roads_within_3km: int = 0,
) -> int:
    urban_risk = risk_from_distance(nearest_municipal_km, 15) if nearest_municipal_km is not None else 25
    industrial_risk = risk_from_distance(nearest_industrial_km, 8) if nearest_industrial_km is not None else 0
    traffic_proxy = clamp_score(min(roads_within_3km * 2.5, 35))
    return clamp_score(urban_risk * 0.35 + industrial_risk * 0.35 + traffic_proxy * 0.3)


def score_infrastructure(features: dict[str, Any]) -> dict[str, Any]:
    hospitals = int(features.get("hospitals_5km") or 0)
    schools = int(features.get("schools_5km") or 0)
    civic = int(features.get("civic_facilities_5km") or 0)
    iti = int(features.get("iti_5km") or 0)
    raw_points = hospitals * 12 + schools * 8 + civic * 6 + iti * 10
    score = saturating_score(raw_points, 55)
    return {
        "score": score,
        "metrics": {
            "radiusKm": 5,
            "hospitals": hospitals,
            "schools": schools,
            "civicFacilities": civic,
            "iti": iti,
            "rawPoints": raw_points,
            "formula": "100 × (1 − e^(−raw/55)), raw = hospitals×12 + schools×8 + civic×6 + ITI×10",
        },
    }


def score_accessibility(features: dict[str, Any], sector: str = "industrial") -> dict[str, Any]:
    highway_km = features.get("dist_road_km")
    rail_km = features.get("dist_rail_km")
    airport_km = features.get("dist_airport_km")
    urban_km = features.get("dist_urban_km")
    metro_km = features.get("dist_metro_km")
    bus_stops = int(features.get("bus_stops_2km") or 0)

    highway = proximity_score(highway_km, 20)
    rail = proximity_score(rail_km, 30)
    airport = proximity_score(airport_km, 60)
    urban = proximity_score(urban_km, 50)
    metro = proximity_score(metro_km, 25)
    bus_bonus = clamp_score(min(bus_stops * 4, 20))

    normalized = normalize_sector(sector)
    if normalized in ("residential", "commercial"):
        score = highway * 0.22 + rail * 0.18 + airport * 0.15 + urban * 0.2 + metro * 0.15 + bus_bonus * 0.1
        formula = "0.22×road + 0.18×rail + 0.15×airport + 0.20×urban + 0.15×metro + 0.10×bus"
    else:
        score = highway * 0.28 + rail * 0.27 + airport * 0.2 + urban * 0.15 + metro * 0.05 + bus_bonus * 0.05
        formula = "0.28×road + 0.27×rail + 0.20×airport + 0.15×urban + 0.05×metro + 0.05×bus"

    return {
        "score": clamp_score(score),
        "metrics": {
            "nearestRoadKm": highway_km,
            "nearestRailKm": rail_km,
            "nearestAirportKm": airport_km,
            "nearestMunicipalBoundaryKm": urban_km,
            "nearestMetroKm": metro_km,
            "busStopsWithin2Km": bus_stops,
            "formula": formula,
        },
    }


def score_environmental_risk(features: dict[str, Any]) -> dict[str, Any]:
    forest_km = features.get("dist_forest_km")
    flood_km = features.get("dist_flood_km")
    water_km = features.get("dist_water_km")
    urban_km = features.get("dist_urban_km")
    industrial_km = features.get("dist_industrial_km")
    roads = int(features.get("roads_3km") or 0)

    forest_risk = risk_from_distance(forest_km, 10)
    flood_risk = risk_from_distance(flood_km, 10)
    water_risk = risk_from_distance(water_km, 5)
    air_quality_risk = estimate_air_quality_risk(urban_km, industrial_km, roads)
    risk = forest_risk * 0.32 + flood_risk * 0.24 + water_risk * 0.18 + air_quality_risk * 0.26

    return {
        "score": clamp_score(100 - risk),
        "risk": clamp_score(risk),
        "metrics": {
            "nearestForestKm": forest_km,
            "nearestLowLyingAreaKm": flood_km,
            "nearestWaterBodyKm": water_km,
            "airQualityRisk": air_quality_risk,
            "airQualitySource": "spatial_proxy",
            "formula": "suitability = 100 − (forest×0.32 + flood×0.24 + water×0.18 + air_proxy×0.26)",
        },
    }


def score_zone_compatibility(features: dict[str, Any], sector: str, environmental: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_sector(sector)
    industrial_km = features.get("dist_industrial_km")
    licensed_km = features.get("dist_licensed_km")
    water_util = int(features.get("utilities_2km") or 0)
    power_util = int(features.get("power_assets_3km") or 0)
    roads = int(features.get("roads_3km") or 0)
    metro_km = features.get("dist_metro_km")
    hospitals = int(features.get("hospitals_5km") or 0)
    schools = int(features.get("schools_5km") or 0)
    water_km = features.get("dist_water_km")
    env_risk = environmental["risk"]

    score = 50.0
    utility_score = clamp_score(min(water_util + power_util, 12) * (100 / 12))
    score += utility_score * 0.18
    transport_score = clamp_score(min(roads, 15) * (100 / 15))
    score += transport_score * 0.12

    if normalized == "industrial":
        score += proximity_score(industrial_km, 10) * 0.22
        if licensed_km is not None:
            score -= proximity_score(licensed_km, 3) * 0.18
    elif normalized == "residential":
        score += saturating_score(hospitals * 8 + schools * 5, 40) * 0.2
        if industrial_km is not None and industrial_km < 3:
            score -= proximity_score(industrial_km, 3) * 0.15
        if licensed_km is not None and licensed_km < 5:
            score += proximity_score(licensed_km, 5) * 0.1
    elif normalized == "commercial":
        score += proximity_score(metro_km, 15) * 0.2 + proximity_score(industrial_km, 20) * 0.05
    elif normalized == "agricultural":
        water_bonus = clamp_score(min(water_util, 8) * 12.5) * 0.15
        score += water_bonus
        if water_km is not None and water_km < 2:
            score += proximity_score(water_km, 2) * 0.08

    score -= (env_risk / 100) * 28

    return {
        "score": clamp_score(score),
        "metrics": {
            "sector": normalized,
            "nearestIndustrialZoneKm": industrial_km,
            "nearestLicensedColonyKm": licensed_km,
            "waterNetworkWithin2Km": water_util,
            "powerAssetsWithin3Km": power_util,
            "roadsWithin3Km": roads,
            "environmentalRisk": env_risk,
            "nearestMetroKm": metro_km,
            "formula": "base 50 + sector-specific proximity/utility bonuses − environmental penalty (continuous)",
        },
    }


def score_location(features: dict[str, Any], sector: str = "industrial") -> dict[str, Any]:
    normalized = normalize_sector(sector)
    infrastructure = score_infrastructure(features)
    accessibility = score_accessibility(features, normalized)
    environmental = score_environmental_risk(features)
    zone_compat = score_zone_compatibility(features, normalized, environmental)

    scores = {
        "infrastructure": infrastructure["score"],
        "accessibility": accessibility["score"],
        "environmentalRisk": environmental["score"],
        "zoneCompatibility": zone_compat["score"],
    }

    weights = SECTOR_WEIGHTS[normalized]
    overall = clamp_score(
        scores["infrastructure"] * weights["infrastructure"]
        + scores["accessibility"] * weights["accessibility"]
        + scores["environmentalRisk"] * weights["environmentalRisk"]
        + scores["zoneCompatibility"] * weights["zoneCompatibility"]
    )

    return {
        "overallScore": overall,
        "scores": scores,
        "details": {
            "infrastructure": infrastructure,
            "accessibility": accessibility,
            "environmentalRisk": environmental,
            "zoneCompatibility": zone_compat,
        },
        "weights": weights,
        "scoringVersion": SCORING_VERSION,
    }


def feature_vector(features: dict[str, Any]) -> list[float]:
    premium = features.get("market_premium_vs_floor")
    return [
        float(features.get("dist_road_km") or 99),
        float(features.get("dist_rail_km") or 99),
        float(features.get("dist_airport_km") or 99),
        float(features.get("dist_industrial_km") or 99),
        float(features.get("dist_forest_km") or 99),
        float(features.get("dist_flood_km") or 99),
        float(features.get("dist_water_km") or 99),
        float(features.get("hospitals_5km") or 0),
        float(features.get("schools_5km") or 0),
        float(features.get("utilities_2km") or 0),
        float(features.get("roads_3km") or 0),
        float(features.get("civic_facilities_5km") or 0),
        float(features.get("dist_metro_km") or 99),
        float(features.get("bus_stops_2km") or 0),
        # Land pricing (gov floor + attributable comps) — investment-v2+
        math.log1p(float(features.get("circle_rate_median_inr") or 0)),
        math.log1p(float(features.get("comps_median_inr") or 0)),
        float(features.get("comps_count") or 0),
        float(premium) if premium is not None else 0.0,
        float(features.get("has_gov_floor") or (1.0 if features.get("circle_rate_median_inr") else 0.0)),
    ]
