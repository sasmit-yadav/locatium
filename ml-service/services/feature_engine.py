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
    try:
        return int(await conn.fetchval(sql, lng, lat, radius_deg) or 0)
    except Exception:
        return 0


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
    try:
        value = await conn.fetchval(sql, lng, lat, radius_deg)
        return float(value) if value is not None else None
    except Exception:
        return None


async def _nearest_from_tables(conn: asyncpg.Connection, tables: list[str], lng: float, lat: float, max_radius_m: float) -> float | None:
    distances = await asyncio.gather(
        *[_min_distance_km(conn, table, lng, lat, max_radius_m) for table in tables]
    )
    valid = [d for d in distances if d is not None]
    return min(valid) if valid else None


async def _count_civic(conn: asyncpg.Connection, lng: float, lat: float, radius_m: float) -> int:
    tables = ["electric_station", "distribution_transformer"]
    counts = await asyncio.gather(*[_count_within(conn, table, lng, lat, radius_m) for table in tables])
    return sum(counts)


async def _count_power_assets(conn: asyncpg.Connection, lng: float, lat: float, radius_m: float) -> int:
    tables = ["electric_station", "distribution_transformer", "hv_transformer"]
    counts = await asyncio.gather(*[_count_within(conn, table, lng, lat, radius_m) for table in tables])
    return sum(counts)


async def _count_utility_lines(conn: asyncpg.Connection, lng: float, lat: float, radius_m: float) -> int:
    tables = ["water_network", "sewerage_line", "pri_oh_electric_line", "sec_oh_electric_line", "hvpnl_line"]
    counts = await asyncio.gather(*[_count_within(conn, table, lng, lat, radius_m) for table in tables])
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
    try:
        return int(await conn.fetchval(sql, lng, lat, radius_deg) or 0)
    except Exception:
        return 0


async def extract_location_features(lat: float, lng: float) -> dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
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
        ) = await asyncio.gather(
            _count_within(conn, "hospitals", lng, lat, 5000),
            _count_schools(conn, lng, lat, 5000),
            _count_civic(conn, lng, lat, 5000),
            _count_within(conn, "iti", lng, lat, 5000),
            _min_distance_km(conn, "roads_line", lng, lat, 20000),
            _min_distance_km(conn, "rail_network", lng, lat, 30000),
            _min_distance_km(conn, "airports", lng, lat, 60000),
            _min_distance_km(conn, "municipal_boundary", lng, lat, 50000),
            _nearest_metro(conn, lng, lat),
            _count_within(conn, "bus_stops", lng, lat, 2000),
            _min_distance_km(conn, "forest_area", lng, lat, 10000),
            _min_distance_km(conn, "low_lying_area", lng, lat, 10000),
            _nearest_from_tables(conn, ["haryana_rivers", "ponds", "wetlands"], lng, lat, 5000),
            _min_distance_km(conn, "hsiidc_boundary", lng, lat, 10000),
            _min_distance_km(conn, "licensed_colony", lng, lat, 2000),
            _count_within(conn, "water_network", lng, lat, 2000),
            _count_utility_lines(conn, lng, lat, 2000),
            _count_power_assets(conn, lng, lat, 3000),
            _count_within(conn, "roads_line", lng, lat, 3000),
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
    }


async def district_row_count(district: str | None = None) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            if district:
                sql = "SELECT COUNT(*)::int FROM zone_outcomes WHERE district = $1"
                return int(await conn.fetchval(sql, district) or 0)
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
