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

/**
 * Compact hosting (small free databases): the largest count-only layers can be stored
 * as weighted density points instead of raw features — `<table>_density(geom, weight)`, one
 * point per ~100 m cell carrying how many original features it stands for. Counting
 * SUM(weight) within a radius matches COUNT(*) on the original table to within ~1–2%, and
 * all 371 sampled location scores were identical to the full database (see
 * db/compact-for-free-hosting.sql).
 * When the original table exists it is always preferred, so the full database is unchanged.
 */
const DENSITY_CAPABLE = ['sec_oh_electric_line', 'distribution_transformer', 'sewerage_line'];
const densityTables = new Map(); // original table -> density table (only when original is absent)
let densityResolved = null;

async function resolveDensityTables(pool) {
  if (densityResolved) return densityResolved;
  densityResolved = (async () => {
    try {
      const { rows } = await pool.query(
        `SELECT t, to_regclass('public.' || t) IS NOT NULL AS has_orig,
                to_regclass('public.' || t || '_density') IS NOT NULL AS has_density
         FROM unnest($1::text[]) AS t`,
        [DENSITY_CAPABLE]
      );
      for (const r of rows) {
        if (!r.has_orig && r.has_density) densityTables.set(r.t, `${r.t}_density`);
      }
    } catch (err) {
      console.warn('[analysis] density table check failed:', err.message);
    }
  })();
  return densityResolved;
}

/** `COUNT(*)` over the original table, or `SUM(weight)` over its density stand-in. */
function countSource(table) {
  const density = densityTables.get(table);
  return density
    ? { from: density, agg: 'COALESCE(SUM(weight), 0)' }
    : { from: table, agg: 'COUNT(*)' };
}

async function countWithin(pool, table, location, radiusM) {
  await resolveDensityTables(pool);
  const point = tablePointSql();
  const radiusDeg = radiusM / 111320.0;
  const src = countSource(table);
  const sql = `
    SELECT (${src.agg})::int AS count
    FROM ${src.from}
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

/**
 * The feature vector as one statement instead of ~31 round trips.
 *
 * Every lookup below is the same two shapes (count-within-radius, nearest-distance)
 * against the same point, so they compose into a single query. Fanning them out meant
 * one map click borrowed ~31 connections from a pool of 12 — twenty concurrent clicks
 * queued 600+ queries and took ~13s each. One round trip per click keeps concurrency
 * proportional to users rather than to the length of this list.
 *
 * `LEAST` matches the old `nearestDistanceKm` reduce: it skips NULLs and is NULL only
 * when every candidate table is out of range.
 */
const FEATURE_COUNTS = [
  ['hospitals', ['hospitals'], 5000],
  ['schools', SCHOOL_TABLES, 5000],
  ['civicFacilities', CIVIC_TABLES, 5000],
  ['iti', ['iti'], 5000],
  ['busStops', ['bus_stops'], 2000],
  ['waterNetwork', ['water_network'], 2000],
  ['utilityLines', UTILITY_LINE_TABLES, 2000],
  ['powerAssets', POWER_ASSET_TABLES, 3000],
  ['roads', ['roads_line'], 3000],
];

const FEATURE_DISTANCES = [
  ['highwayKm', ['roads_line'], 20000],
  ['railKm', ['rail_network'], 30000],
  ['airportKm', ['airports'], 60000],
  ['urbanKm', ['municipal_boundary'], 50000],
  ['metroKm', METRO_STATION_TABLES, 25000],
  ['forestKm', ['forest_area'], 10000],
  ['lowLyingKm', ['low_lying_area'], 10000],
  ['waterBodyKm', ['haryana_rivers', 'ponds', 'wetlands'], 5000],
  ['industrialKm', ['hsiidc_boundary'], 10000],
  ['licensedColonyKm', ['licensed_colony'], 2000],
];

/** Table names here are module constants, never user input; assert that and keep it true. */
function safeIdentifier(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe table identifier in scoring config: ${name}`);
  }
  return name;
}

function buildFeatureSql() {
  const selects = [];

  for (const [key, tables, radiusM] of FEATURE_COUNTS) {
    const deg = (radiusM / 111320.0).toFixed(8);
    const perTable = tables.map((t) => {
      const src = countSource(safeIdentifier(t));
      return (
        `(SELECT ${src.agg} FROM ${safeIdentifier(src.from)} x ` +
        `WHERE x.geom && ST_Expand(p.g, ${deg}) AND ST_DWithin(x.geom, p.g, ${deg}))`
      );
    });
    selects.push(`(${perTable.join(' + ')})::int AS "c_${key}"`);
  }

  for (const [key, tables, radiusM] of FEATURE_DISTANCES) {
    const deg = (radiusM / 111320.0).toFixed(8);
    const perTable = tables.map(
      (t) =>
        `(SELECT ST_Distance(n.geom::geography, p.g::geography) / 1000.0 FROM (` +
        `SELECT y.geom FROM ${safeIdentifier(t)} y WHERE y.geom && ST_Expand(p.g, ${deg}) ` +
        `ORDER BY y.geom <-> p.g LIMIT 1) n WHERE ST_DWithin(n.geom, p.g, ${deg}))`
    );
    selects.push(`LEAST(${perTable.join(', ')}) AS "d_${key}"`);
  }

  return [
    'WITH p AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS g)',
    `SELECT ${selects.join(',\n       ')}`,
    'FROM p',
  ].join('\n');
}

let FEATURE_SQL = null;

function mapFeatureRow(row) {
  const out = {};
  for (const [key] of FEATURE_COUNTS) out[key] = Number(row[`c_${key}`]) || 0;
  for (const [key] of FEATURE_DISTANCES) {
    const v = row[`d_${key}`];
    out[key] = v === null || v === undefined ? null : Number(v);
  }
  return out;
}

async function gatherLocationFeatures(pool, location) {
  await resolveDensityTables(pool);
  if (!FEATURE_SQL) FEATURE_SQL = buildFeatureSql();
  try {
    const { rows } = await pool.query(FEATURE_SQL, [location.lng, location.lat]);
    if (rows[0]) return mapFeatureRow(rows[0]);
  } catch (err) {
    // One bad table used to degrade to a zero for that table alone. Keep that property:
    // if the combined statement fails for any reason, fall back to the per-table path.
    console.error('[analysis] combined feature query failed; using per-table fallback:', err.message);
  }
  return gatherLocationFeaturesFanOut(pool, location);
}

/** Resilient fallback: one query per table, each failure isolated. */
async function gatherLocationFeaturesFanOut(pool, location) {
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
