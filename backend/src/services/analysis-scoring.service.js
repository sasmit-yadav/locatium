const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');
const { nearestStationAqi } = require('./aqi.service');
const { gatherZoningContext } = require('./zoning-context.service');
const {
  SCORING_VERSION,
  normalizeSector,
  computeInfrastructureScore,
  computeAccessibilityScore,
  computeEnvironmentalScore,
  computeZoneCompatibilityScore,
  computeOverallScore,
  buildScoreBreakdown,
} = require('./scoring-engine');

const LOCATION_LIMITS = {
  minLat: 27.3,
  maxLat: 30.95,
  minLng: 74.4,
  maxLng: 77.9,
};

const DEFAULT_SECTOR = 'industrial';
const BATCH_CONCURRENCY = Number(process.env.SCORE_BATCH_CONCURRENCY) || 12;

const SCHOOL_TABLES = ['govt_school', 'pm_shri_and_sanskriti_school', 'haryana_police_public_schools_point'];
const CIVIC_TABLES = ['electric_station', 'distribution_transformer'];
const METRO_STATION_TABLES = ['rapid_metro_station', 'delhi_metro_station', 'proposed_metro_station'];
const POWER_ASSET_TABLES = ['electric_station', 'distribution_transformer', 'hv_transformer'];
const UTILITY_LINE_TABLES = ['water_network', 'sewerage_line', 'sec_oh_electric_line', 'hvpnl_line'];

function ensurePool() {
  const pool = getPool();
  if (!pool) {
    throw AppError.serviceUnavailable('Database not configured');
  }
  return pool;
}

function assertValidLocation(input) {
  const lat = Number(input.lat);
  const lng = Number(input.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw AppError.badRequest('lat and lng must be valid numbers');
  }

  if (lat < LOCATION_LIMITS.minLat || lat > LOCATION_LIMITS.maxLat || lng < LOCATION_LIMITS.minLng || lng > LOCATION_LIMITS.maxLng) {
    throw AppError.badRequest('location is outside the supported Haryana analysis area');
  }

  return {
    lat,
    lng,
    sector: normalizeSector(typeof input.sector === 'string' && input.sector.trim() ? input.sector.trim() : DEFAULT_SECTOR),
  };
}

function tablePointSql() {
  return 'ST_SetSRID(ST_MakePoint($1, $2), 4326)';
}

async function countWithin(pool, table, location, radiusM) {
  const point = tablePointSql();
  const radiusDeg = radiusM / 111320.0;
  const sql = `
    SELECT COUNT(*)::int AS count
    FROM ${table}
    WHERE geom && ST_Expand(${point}, $3)
      AND ST_DWithin(geom, ${point}, $3)
  `;
  const { rows } = await pool.query(sql, [location.lng, location.lat, radiusDeg]);
  return rows[0]?.count || 0;
}

async function minDistanceKm(pool, table, location, maxRadiusM) {
  const point = tablePointSql();
  const radiusDeg = maxRadiusM / 111320.0;
  const sql = `
    WITH nearest AS (
      SELECT geom
      FROM ${table}
      WHERE geom && ST_Expand(${point}, $3)
      ORDER BY geom <-> ${point}
      LIMIT 1
    )
    SELECT ST_Distance(geom::geography, ${point}::geography) / 1000.0 AS distance_km
    FROM nearest
    WHERE ST_DWithin(geom, ${point}, $3)
  `;
  const { rows } = await pool.query(sql, [location.lng, location.lat, radiusDeg]);
  return rows.length ? Number(rows[0].distance_km) : null;
}

async function nearestDistanceKm(pool, tables, location, maxRadiusM) {
  const distances = await Promise.all(tables.map((table) => safeMinDistanceKm(pool, table, location, maxRadiusM)));
  return distances.reduce((best, distance) => {
    if (distance === null || distance === undefined) return best;
    if (best === null || distance < best) return distance;
    return best;
  }, null);
}

async function totalCountWithin(pool, tables, location, radiusM) {
  const counts = await Promise.all(tables.map((table) => safeCountWithin(pool, table, location, radiusM)));
  return counts.reduce((sum, count) => sum + count, 0);
}

async function safeCountWithin(pool, table, location, radiusM) {
  try {
    return await countWithin(pool, table, location, radiusM);
  } catch (err) {
    console.error(`[analysis] count failed for ${table}:`, err.message);
    return 0;
  }
}

async function safeMinDistanceKm(pool, table, location, maxRadiusM) {
  try {
    return await minDistanceKm(pool, table, location, maxRadiusM);
  } catch (err) {
    console.error(`[analysis] distance failed for ${table}:`, err.message);
    return null;
  }
}

async function gatherLocationFeatures(pool, location) {
  const [
    hospitals,
    schools,
    civicFacilities,
    iti,
    highwayKm,
    railKm,
    airportKm,
    urbanKm,
    metroKm,
    busStops,
    forestKm,
    lowLyingKm,
    waterBodyKm,
    industrialKm,
    licensedColonyKm,
    waterNetwork,
    utilityLines,
    powerAssets,
    roads,
  ] = await Promise.all([
    safeCountWithin(pool, 'hospitals', location, 5000),
    totalCountWithin(pool, SCHOOL_TABLES, location, 5000),
    totalCountWithin(pool, CIVIC_TABLES, location, 5000),
    safeCountWithin(pool, 'iti', location, 5000),
    safeMinDistanceKm(pool, 'roads_line', location, 20000),
    safeMinDistanceKm(pool, 'rail_network', location, 30000),
    safeMinDistanceKm(pool, 'airports', location, 60000),
    safeMinDistanceKm(pool, 'municipal_boundary', location, 50000),
    nearestDistanceKm(pool, METRO_STATION_TABLES, location, 25000),
    safeCountWithin(pool, 'bus_stops', location, 2000),
    safeMinDistanceKm(pool, 'forest_area', location, 10000),
    safeMinDistanceKm(pool, 'low_lying_area', location, 10000),
    nearestDistanceKm(pool, ['haryana_rivers', 'ponds', 'wetlands'], location, 5000),
    safeMinDistanceKm(pool, 'hsiidc_boundary', location, 10000),
    safeMinDistanceKm(pool, 'licensed_colony', location, 2000),
    safeCountWithin(pool, 'water_network', location, 2000),
    totalCountWithin(pool, UTILITY_LINE_TABLES, location, 2000),
    totalCountWithin(pool, POWER_ASSET_TABLES, location, 3000),
    safeCountWithin(pool, 'roads_line', location, 3000),
  ]);

  return {
    hospitals,
    schools,
    civicFacilities,
    iti,
    highwayKm,
    railKm,
    airportKm,
    urbanKm,
    metroKm,
    busStops,
    forestKm,
    lowLyingKm,
    waterBodyKm,
    industrialKm,
    licensedColonyKm,
    waterNetwork,
    utilityLines,
    powerAssets,
    roads,
  };
}

function buildScoreFeature(location, overallScore, scores) {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [location.lng, location.lat],
    },
    properties: {
      sector: location.sector,
      overallScore,
      ...scores,
    },
  };
}

async function scoreLocation(input) {
  const location = assertValidLocation(input || {});
  const pool = ensurePool();
  const [features, aqiStation, zoning] = await Promise.all([
    gatherLocationFeatures(pool, location),
    nearestStationAqi(location),
    gatherZoningContext(pool, location),
  ]);

  const infrastructure = computeInfrastructureScore({
    hospitals: features.hospitals,
    schools: features.schools,
    civicFacilities: features.civicFacilities,
    iti: features.iti,
  });

  const accessibility = computeAccessibilityScore({
    nearestRoadKm: features.highwayKm,
    nearestRailKm: features.railKm,
    nearestAirportKm: features.airportKm,
    nearestMunicipalBoundaryKm: features.urbanKm,
    nearestMetroKm: features.metroKm,
    busStopsWithin2Km: features.busStops,
    sector: location.sector,
  });

  const environmentalRisk = computeEnvironmentalScore({
    nearestForestKm: features.forestKm,
    nearestLowLyingAreaKm: features.lowLyingKm,
    nearestWaterBodyKm: features.waterBodyKm,
    nearestMunicipalBoundaryKm: features.urbanKm,
    nearestIndustrialZoneKm: features.industrialKm,
    roadsWithin3Km: features.roads,
    stationAqi: aqiStation?.aqi ?? null,
  });

  if (aqiStation && environmentalRisk.metrics) {
    environmentalRisk.metrics.aqiStation = aqiStation.stationName;
    environmentalRisk.metrics.aqiDistanceKm = aqiStation.distanceKm;
  }

  const zoneCompatibility = computeZoneCompatibilityScore({
    sector: location.sector,
    nearestIndustrialZoneKm: features.industrialKm,
    nearestLicensedColonyKm: features.licensedColonyKm,
    waterNetworkWithin2Km: features.waterNetwork + features.utilityLines,
    powerAssetsWithin3Km: features.powerAssets,
    roadsWithin3Km: features.roads,
    environmentalRisk: environmentalRisk.risk,
    nearestMetroKm: features.metroKm,
    hospitalsWithin5Km: features.hospitals,
    schoolsWithin5Km: features.schools,
    nearestWaterBodyKm: features.waterBodyKm,
    insideHsiidc: zoning.insideHsiidc,
    landUseClass: zoning.landUseClass,
    controlledAreaKm: zoning.controlledAreaKm,
    developmentPlanKm: zoning.developmentPlanKm,
  });

  const scores = {
    infrastructure: infrastructure.score,
    accessibility: accessibility.score,
    environmentalRisk: environmentalRisk.score,
    zoneCompatibility: zoneCompatibility.score,
  };

  const { overallScore, weights } = computeOverallScore(scores, location.sector);

  const details = {
    infrastructure,
    accessibility,
    environmentalRisk,
    zoneCompatibility,
  };

  return {
    location,
    overallScore,
    scores,
    details,
    zoning,
    aqiStation,
    visualization: buildScoreFeature(location, overallScore, scores),
    weights,
    scoringVersion: SCORING_VERSION,
    scoreBreakdown: buildScoreBreakdown({ scores, details, weights, sector: location.sector }),
  };
}

async function scoreBatch(input) {
  const locations = Array.isArray(input?.locations) ? input.locations : null;
  if (!locations || locations.length === 0) {
    throw AppError.badRequest('locations must be a non-empty array');
  }
  if (locations.length > 100) {
    throw AppError.badRequest('score-batch supports up to 100 locations');
  }

  const results = [];
  for (let offset = 0; offset < locations.length; offset += BATCH_CONCURRENCY) {
    const chunk = locations.slice(offset, offset + BATCH_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (loc, chunkIndex) => {
        const index = offset + chunkIndex;
        const result = await scoreLocation({ ...loc, sector: loc.sector || input.sector });
        return { index, ...result };
      })
    );
    results.push(...chunkResults);
  }

  const averageScore = Math.round(results.reduce((sum, item) => sum + item.overallScore, 0) / results.length);
  return {
    count: results.length,
    averageScore,
    results,
    scoringVersion: SCORING_VERSION,
  };
}

module.exports = {
  scoreLocation,
  scoreBatch,
  gatherLocationFeatures,
};
