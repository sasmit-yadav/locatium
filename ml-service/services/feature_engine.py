"""PostGIS feature extraction for a lat/lng point — mirrors Node analysis-scoring tables."""

from __future__ import annotations

import asyncio
import os
from typing import Any

import asyncpg

LOCATION_LIMITS = {
    "min_lat": 27.3,
    "max_lat": 30.95,
    "min_lng": 74.4,
    "max_lng": 77.9,
}

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    _pool = await asyncpg.create_pool(database_url, min_size=1, max_size=4, command_timeout=8)
    return _pool


def validate_location(lat: float, lng: float, sector: str = "industrial") -> dict[str, Any]:
    if lat < LOCATION_LIMITS["min_lat"] or lat > LOCATION_LIMITS["max_lat"]:
        raise ValueError("location is outside the supported Haryana analysis area")
    if lng < LOCATION_LIMITS["min_lng"] or lng > LOCATION_LIMITS["max_lng"]:
        raise ValueError("location is outside the supported Haryana analysis area")
    return {"lat": lat, "lng": lng, "sector": (sector or "industrial").strip().lower()}


async def _count_within(conn: asyncpg.Connection, table: str, lng: float, lat: float, radius_m: float) -> int:
    radius_deg = radius_m / 111320.0
    sql = f"""
        SELECT COUNT(*)::int AS count
        FROM {table}
        WHERE geom && ST_Expand(ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
          AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
    """
    return int(await conn.fetchval(sql, lng, lat, radius_deg) or 0)


async def _min_distance_km(conn: asyncpg.Connection, table: str, lng: float, lat: float, max_radius_m: float) -> float | None:
    radius_deg = max_radius_m / 111320.0
    sql = f"""
        WITH nearest AS (
          SELECT geom
          FROM {table}
          WHERE geom && ST_Expand(ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
          ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
          LIMIT 1
        )
        SELECT ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000.0
        FROM nearest
        WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
    """
    value = await conn.fetchval(sql, lng, lat, radius_deg)
    return float(value) if value is not None else None


async def _nearest_from_tables(conn: asyncpg.Connection, tables: list[str], lng: float, lat: float, max_radius_m: float) -> float | None:
    distances = [
        await _min_distance_km(conn, table, lng, lat, max_radius_m)
        for table in tables
    ]
    valid = [d for d in distances if d is not None]
    return min(valid) if valid else None


async def _count_civic(conn: asyncpg.Connection, lng: float, lat: float, radius_m: float) -> int:
    tables = ["electric_station", "distribution_transformer"]
    counts = [await _count_within(conn, table, lng, lat, radius_m) for table in tables]
    return sum(counts)


async def _count_power_assets(conn: asyncpg.Connection, lng: float, lat: float, radius_m: float) -> int:
    tables = ["electric_station", "distribution_transformer", "hv_transformer"]
    counts = [await _count_within(conn, table, lng, lat, radius_m) for table in tables]
    return sum(counts)


async def _count_utility_lines(conn: asyncpg.Connection, lng: float, lat: float, radius_m: float) -> int:
    tables = ["water_network", "sewerage_line", "pri_oh_electric_line", "sec_oh_electric_line", "hvpnl_line"]
    counts = [await _count_within(conn, table, lng, lat, radius_m) for table in tables]
    return sum(counts)


async def _nearest_metro(conn: asyncpg.Connection, lng: float, lat: float) -> float | None:
    tables = ["rapid_metro_station", "delhi_metro_station", "proposed_metro_station"]
    return await _nearest_from_tables(conn, tables, lng, lat, 25000)


async def _count_schools(conn: asyncpg.Connection, lng: float, lat: float, radius_m: float) -> int:
    radius_deg = radius_m / 111320.0
    sql = """
        SELECT COUNT(*)::int FROM (
          SELECT geom FROM govt_school
          UNION ALL SELECT geom FROM pm_shri_and_sanskriti_school
          UNION ALL SELECT geom FROM haryana_police_public_schools_point
        ) s
        WHERE geom IS NOT NULL
          AND geom && ST_Expand(ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
          AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
    """
    return int(await conn.fetchval(sql, lng, lat, radius_deg) or 0)


async def _resolve_district(conn: asyncpg.Connection, lng: float, lat: float) -> str | None:
    sql = """
      SELECT COALESCE(NULLIF(TRIM(n_d_name), ''), NULLIF(TRIM(dis_abb), '')) AS district
      FROM district_boundary
      WHERE geom IS NOT NULL
        AND ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      LIMIT 1
    """
    return await conn.fetchval(sql, lng, lat)


def _district_aliases(district: str | None) -> list[str]:
    if not district:
        return []
    key = district.strip().lower()
    aliases = {
        "gurugram": ["Gurugram", "Gurgaon"],
        "gurgaon": ["Gurugram", "Gurgaon"],
        "nuh": ["Nuh", "Mewat"],
        "mewat": ["Nuh", "Mewat"],
        "mahendragarh": ["Mahendragarh", "Mahendergarh"],
        "mahendergarh": ["Mahendragarh", "Mahendergarh"],
        "hisar": ["Hisar", "HISAR"],
    }
    return aliases.get(key, [district.strip()])


async def extract_land_features(
    conn: asyncpg.Connection, lat: float, lng: float, sector: str = "industrial"
) -> dict[str, Any]:
    """Gov circle-rate floor + attributable market comps near the point."""
    sector = (sector or "industrial").strip().lower()
    district = await _resolve_district(conn, lng, lat)
    names = _district_aliases(district)
    empty = {
        "district": district,
        "circle_rate_median_inr": None,
        "circle_rate_sample_count": 0,
        "comps_median_inr": None,
        "comps_count": 0,
        "market_premium_vs_floor": None,
        "has_gov_floor": 0.0,
    }
    if not names:
        return empty

    try:
        vintage = await conn.fetchval(
            """
            SELECT MAX(effective_from)
            FROM circle_rates
            WHERE sector_type = $2
              AND source <> 'haryana_seed'
              AND LOWER(TRIM(district)) = ANY (
                SELECT LOWER(TRIM(x)) FROM unnest($1::text[]) AS x
              )
            """,
            names,
            sector,
        )
        circle_row = None
        if vintage is not None:
            circle_row = await conn.fetchrow(
                """
                SELECT
                  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rate_per_sq_yard_inr::float8) AS median_rate,
                  COUNT(*)::int AS sample_count
                FROM circle_rates
                WHERE sector_type = $2
                  AND source <> 'haryana_seed'
                  AND effective_from = $3
                  AND LOWER(TRIM(district)) = ANY (
                    SELECT LOWER(TRIM(x)) FROM unnest($1::text[]) AS x
                  )
                """,
                names,
                sector,
                vintage,
            )

        comps = await conn.fetchrow(
            """
            SELECT
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_sq_yard_inr::float8) AS median_price,
              COUNT(*)::int AS sample_count
            FROM land_transactions
            WHERE geom IS NOT NULL
              AND sector_type = $3
              AND source <> 'seed_comparable'
              AND transaction_date >= (CURRENT_DATE - INTERVAL '36 months')
              AND ST_DWithin(
                    geom::geography,
                    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                    10000
                  )
            """,
            lng,
            lat,
            sector,
        )
    except Exception:
        return empty

    circle_median = float(circle_row["median_rate"]) if circle_row and circle_row["median_rate"] is not None else None
    circle_n = int(circle_row["sample_count"] or 0) if circle_row else 0
    comps_median = float(comps["median_price"]) if comps and comps["median_price"] is not None else None
    comps_n = int(comps["sample_count"] or 0) if comps else 0
    premium = None
    if circle_median and comps_median and circle_median > 0:
        premium = (comps_median - circle_median) / circle_median

    return {
        "district": district,
        "circle_rate_median_inr": circle_median,
        "circle_rate_sample_count": circle_n,
        "comps_median_inr": comps_median,
        "comps_count": comps_n,
        "market_premium_vs_floor": premium,
        "has_gov_floor": 1.0 if circle_median else 0.0,
    }


async def extract_location_features(lat: float, lng: float, sector: str = "industrial") -> dict[str, Any]:
    pool = await get_pool()

    async def run(fn, *args):
        async with pool.acquire() as conn:
            return await fn(conn, *args)

    (
        hospitals,
        schools,
        civic,
        iti,
        highway_km,
        rail_km,
        airport_km,
        urban_km,
        metro_km,
        bus_stops,
        forest_km,
        flood_km,
        water_km,
        industrial_km,
        licensed_km,
        water_network,
        utility_lines,
        power_assets,
        roads,
        land,
    ) = await asyncio.gather(
        run(_count_within, "hospitals", lng, lat, 5000),
        run(_count_schools, lng, lat, 5000),
        run(_count_civic, lng, lat, 5000),
        run(_count_within, "iti", lng, lat, 5000),
        run(_min_distance_km, "roads_line", lng, lat, 20000),
        run(_min_distance_km, "rail_network", lng, lat, 30000),
        run(_min_distance_km, "airports", lng, lat, 60000),
        run(_min_distance_km, "municipal_boundary", lng, lat, 50000),
        run(_nearest_metro, lng, lat),
        run(_count_within, "bus_stops", lng, lat, 2000),
        run(_min_distance_km, "forest_area", lng, lat, 10000),
        run(_min_distance_km, "low_lying_area", lng, lat, 10000),
        run(_nearest_from_tables, ["haryana_rivers", "ponds", "wetlands"], lng, lat, 5000),
        run(_min_distance_km, "hsiidc_boundary", lng, lat, 10000),
        run(_min_distance_km, "licensed_colony", lng, lat, 2000),
        run(_count_within, "water_network", lng, lat, 2000),
        run(_count_utility_lines, lng, lat, 2000),
        run(_count_power_assets, lng, lat, 3000),
        run(_count_within, "roads_line", lng, lat, 3000),
        run(extract_land_features, lat, lng, sector),
    )

    return {
        "hospitals_5km": hospitals,
        "schools_5km": schools,
        "civic_facilities_5km": civic,
        "iti_5km": iti,
        "dist_road_km": highway_km,
        "dist_rail_km": rail_km,
        "dist_airport_km": airport_km,
        "dist_urban_km": urban_km,
        "dist_metro_km": metro_km,
        "bus_stops_2km": bus_stops,
        "dist_forest_km": forest_km,
        "dist_flood_km": flood_km,
        "dist_water_km": water_km,
        "dist_industrial_km": industrial_km,
        "dist_licensed_km": licensed_km,
        "utilities_2km": water_network + utility_lines,
        "power_assets_3km": power_assets,
        "roads_3km": roads,
        **land,
    }


async def district_row_count(district: str | None = None) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            if district:
                names = _district_aliases(district)
                sql = """
                  SELECT COUNT(*)::int
                  FROM zone_outcomes
                  WHERE LOWER(TRIM(district)) = ANY (
                    SELECT LOWER(TRIM(x)) FROM unnest($1::text[]) AS x
                  )
                """
                return int(await conn.fetchval(sql, names) or 0)
            return int(await conn.fetchval("SELECT COUNT(*)::int FROM zone_outcomes") or 0)
        except Exception:
            return 0


async def nearest_district(lat: float, lng: float) -> str | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        sql = """
          SELECT district
          FROM zone_features
          ORDER BY ST_SetSRID(ST_MakePoint(lng, lat), 4326)
            <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
          LIMIT 1
        """
        try:
            return await conn.fetchval(sql, lng, lat)
        except Exception:
            return None
