from services.heuristic_scoring import score_location, saturating_score


def test_heuristic_infrastructure_formula():
    result = score_location(
        {
            "hospitals_5km": 2,
            "schools_5km": 1,
            "civic_facilities_5km": 1,
            "iti_5km": 0,
            "dist_road_km": 1.0,
            "dist_rail_km": 2.0,
            "dist_airport_km": 30.0,
            "dist_urban_km": 5.0,
            "dist_metro_km": 12.0,
            "bus_stops_2km": 3,
            "dist_forest_km": 8.0,
            "dist_flood_km": 8.0,
            "dist_water_km": 4.0,
            "dist_industrial_km": 3.0,
            "dist_licensed_km": None,
            "utilities_2km": 2,
            "power_assets_3km": 1,
            "roads_3km": 5,
        },
        sector="industrial",
    )
    assert 0 <= result["overallScore"] <= 100
    assert result["scores"]["infrastructure"] > 0
    assert result["scoringVersion"] == "v2-industry"
    assert "details" in result


def test_heuristic_saturating_score():
    moderate = saturating_score(40)
    dense = saturating_score(200)
    assert dense > moderate
    assert dense <= 100
