const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');

const LOCATION_LIMITS = {
  minLat: 27.3,
  maxLat: 30.95,
  minLng: 74.4,
  maxLng: 77.9,
};

const DEFAULT_SECTOR = 'industrial';
const BATCH_CONCURRENCY = 8;

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
    sector: typeof input.sector === 'string' && input.sector.trim() ? input.sector.trim().toLowerCase() : DEFAULT_SECTOR,
  };
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function proximityScore(distanceKm, maxKm) {
  if (distanceKm === null || distanceKm === undefined) return 0;
  return clampScore((1 - Math.min(distanceKm / maxKm, 1)) * 100);
}

function riskFromDistance(distanceKm, maxKm) {
  if (distanceKm === null || distanceKm === undefined) return 0;
  return clampScore((1 - Math.min(distanceKm / maxKm, 1)) * 100);
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

async function scoreInfrastructure(pool, location) {
  const [hospitals, schools, offices] = await Promise.all([
    safeCountWithin(pool, 'hospitals', location, 5000),
    totalCountWithin(pool, ['govt_school', 'pm_shri_and_sanskriti_school', 'haryana_police_public_schools_point'], location, 5000),
    totalCountWithin(pool, ['jails_point'], location, 5000),
  ]);

  const raw = hospitals * 15 + schools * 10 + offices * 5;

  return {
    score: clampScore(raw),
    metrics: {
      radiusKm: 5,
      hospitals,
      schools,
      governmentOffices: offices,
      formula: 'min(100, hospitals*15 + schools*10 + offices*5)',
    },
  };
}

async function scoreAccessibility(pool, location) {
  const [highwayKm, railKm, airportKm, urbanKm] = await Promise.all([
    safeMinDistanceKm(pool, 'roads_line', location, 20000),
    safeMinDistanceKm(pool, 'rail_network', location, 30000),
    safeMinDistanceKm(pool, 'airports', location, 60000),
    safeMinDistanceKm(pool, 'municipal_boundary', location, 50000),
  ]);

  const highwayScore = proximityScore(highwayKm, 20);
  const railScore = proximityScore(railKm, 30);
  const airportScore = proximityScore(airportKm, 60);
  const urbanScore = proximityScore(urbanKm, 50);

  const score = highwayScore * 0.3 + railScore * 0.25 + airportScore * 0.25 + urbanScore * 0.2;

  return {
    score: clampScore(score),
    metrics: {
      nearestRoadKm: highwayKm,
      nearestRailKm: railKm,
      nearestAirportKm: airportKm,
      nearestMunicipalBoundaryKm: urbanKm,
      formula: '0.3*highway + 0.25*rail + 0.25*airport + 0.2*urban',
    },
  };
}

async function scoreEnvironmentalRisk(pool, location) {
  const [forestKm, lowLyingKm, waterBodyKm] = await Promise.all([
    safeMinDistanceKm(pool, 'forest_area', location, 10000),
    safeMinDistanceKm(pool, 'low_lying_area', location, 10000),
    nearestDistanceKm(pool, ['haryana_rivers', 'ponds', 'wetlands'], location, 5000),
  ]);

  const forestRisk = riskFromDistance(forestKm, 10);
  const floodRisk = riskFromDistance(lowLyingKm, 10);
  const waterRisk = riskFromDistance(waterBodyKm, 5);
  const airQualityRisk = 0;
  const risk = forestRisk * 0.4 + floodRisk * 0.3 + waterRisk * 0.2 + airQualityRisk * 0.1;

  return {
    score: clampScore(100 - risk),
    risk: clampScore(risk),
    metrics: {
      nearestForestKm: forestKm,
      nearestLowLyingAreaKm: lowLyingKm,
      nearestWaterBodyKm: waterBodyKm,
      airQualityRisk,
      formula: '100 - min(100, forest*0.4 + flood*0.3 + water*0.2 + air*0.1)',
    },
  };
}

async function scoreZoneCompatibility(pool, location, sector, environmentalRiskResult = null) {
  const environmentalRiskPromise = environmentalRiskResult ? Promise.resolve(environmentalRiskResult) : scoreEnvironmentalRisk(pool, location);
  const [industrialKm, licensedColonyKm, utilities, roads, environmentalRisk] = await Promise.all([
    safeMinDistanceKm(pool, 'hsiidc_boundary', location, 10000),
    safeMinDistanceKm(pool, 'licensed_colony', location, 2000),
    safeCountWithin(pool, 'water_network', location, 2000),
    safeCountWithin(pool, 'roads_line', location, 3000),
    environmentalRiskPromise,
  ]);

  let raw = 50;
  if (sector === 'industrial' && industrialKm !== null) raw += 10;
  if (licensedColonyKm !== null) raw -= 15;
  if (utilities > 0) raw += 20;
  if (roads > 0) raw += 15;
  if (environmentalRisk.risk >= 50) raw -= 25;

  return {
    score: clampScore(raw),
    metrics: {
      sector,
      nearestIndustrialZoneKm: industrialKm,
      nearestLicensedColonyKm: licensedColonyKm,
      waterNetworkWithin2Km: utilities,
      roadsWithin3Km: roads,
      environmentalRisk: environmentalRisk.risk,
      formula: 'base 50 + industrial cluster 10 - residential 15 + utilities 20 + transport 15 - constraints 25',
    },
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

  const [infrastructure, accessibility, environmentalRisk] = await Promise.all([
    scoreInfrastructure(pool, location),
    scoreAccessibility(pool, location),
    scoreEnvironmentalRisk(pool, location),
  ]);
  const zoneCompatibility = await scoreZoneCompatibility(pool, location, location.sector, environmentalRisk);

  const overallScore = clampScore(
    infrastructure.score * 0.3 +
      accessibility.score * 0.3 +
      environmentalRisk.score * 0.2 +
      zoneCompatibility.score * 0.2
  );

  const scores = {
    infrastructure: infrastructure.score,
    accessibility: accessibility.score,
    environmentalRisk: environmentalRisk.score,
    zoneCompatibility: zoneCompatibility.score,
  };

  return {
    location,
    overallScore,
    scores,
    details: {
      infrastructure,
      accessibility,
      environmentalRisk,
      zoneCompatibility,
    },
    visualization: buildScoreFeature(location, overallScore, scores),
    weights: {
      infrastructure: 0.3,
      accessibility: 0.3,
      environmentalRisk: 0.2,
      zoneCompatibility: 0.2,
    },
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
      chunk.map(async (location, chunkIndex) => {
        const index = offset + chunkIndex;
        const result = await scoreLocation({ ...location, sector: location.sector || input.sector });
        return { index, ...result };
      })
    );
    results.push(...chunkResults);
  }

  const averageScore = clampScore(results.reduce((sum, item) => sum + item.overallScore, 0) / results.length);
  return {
    count: results.length,
    averageScore,
    results,
  };
}

module.exports = {
  scoreLocation,
  scoreBatch,
};
