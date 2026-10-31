const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');
const redisCache = require('./redis-cache.service');
const { mapQueryCacheTtlSec } = require('../config');
const postgisRegistry = require('../config/postgis-registry');

/**
 * Validate that a table name is safe to use in SQL queries.
 * Only allows alphanumeric characters and underscores.
 */
function validateTableName(tableName) {
  if (!tableName || typeof tableName !== 'string') {
    throw AppError.badRequest('Invalid table name');
  }
  // Only allow safe characters for PostgreSQL identifiers
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw AppError.badRequest('Invalid table name format');
  }
  return tableName;
}

function validateLatLng(lat, lng) {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    throw AppError.badRequest('Invalid lat/lng values');
  }
  return { lat: latNum, lng: lngNum };
}

function validateRadius(radiusMeters) {
  const r = parseFloat(radiusMeters) || 5000;
  if (r < 10 || r > 200000) throw AppError.badRequest('Radius must be between 10m and 200km');
  return r;
}

async function queryFeaturesNearPoint(layerSlug, lat, lng, radiusMeters = 5000) {
  const pool = getPool();
  if (!pool) throw AppError.serviceUnavailable('Database not configured');

  const tables = postgisRegistry.getTablesForLayer(layerSlug);
  if (!tables || tables.length === 0) throw AppError.badRequest(`Unknown or unsupported layer: ${layerSlug}`);

  const { lat: latNum, lng: lngNum } = validateLatLng(lat, lng);
  const radiusM = validateRadius(radiusMeters);

  const cacheKey = `pg:nearby:${layerSlug}:${latNum.toFixed(5)},${lngNum.toFixed(5)}:${radiusM}`;
  const cached = await redisCache.getString(cacheKey);
  if (cached) {
    try { return { features: JSON.parse(cached), cacheHit: true }; } catch {}
  }

  const pointSql = `ST_SetSRID(ST_MakePoint($1, $2), 4326)`; // lon, lat
  const results = [];

  for (const tbl of tables) {
    // Validate table name to prevent SQL injection
    const safeTableName = validateTableName(tbl);
    const sql = `
      SELECT (to_jsonb(t) - 'geom') as properties,
             ST_AsGeoJSON(t.geom)::json as geometry,
             ST_Distance(t.geom::geography, ${pointSql}::geography) as distance_m
      FROM ${safeTableName} t
      WHERE ST_DWithin(t.geom::geography, ${pointSql}::geography, $3)
      ORDER BY distance_m ASC
      LIMIT 500;
    `;
    try {
      const { rows } = await pool.query(sql, [lngNum, latNum, radiusM]);
      for (const r of rows) {
        const props = r.properties || {};
        const geom = r.geometry || null;
        const distanceKm = r.distance_m != null ? +(r.distance_m / 1000).toFixed(3) : null;
        results.push({ id: props.id || props.gid || props.pk || null, layerId: layerSlug, name: props.name || props.title || props.NAME || '', properties: props, geometry: geom, distanceKm });
      }
    } catch (err) {
      console.error(`[PG] error querying ${tbl}:`, err.message);
    }
  }

  results.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));

  await redisCache.setString(cacheKey, JSON.stringify(results), mapQueryCacheTtlSec);
  return { features: results, cacheHit: false };
}

async function queryMultipleLayersNearPoint(layerSlugs, lat, lng, radiusMeters = 5000) {
  const validSlugs = layerSlugs.filter(sl => postgisRegistry.hasLayer(sl));
  if (validSlugs.length === 0) throw AppError.badRequest('No valid layers specified');

  const output = { center: { lat: parseFloat(lat), lng: parseFloat(lng) }, radiusMeters, layers: validSlugs, totalFeatures: 0, results: {} };
  for (const slug of validSlugs) {
    try {
      const { features, cacheHit } = await queryFeaturesNearPoint(slug, lat, lng, radiusMeters);
      output.results[slug] = { features, cacheHit };
      output.totalFeatures += features.length;
    } catch (err) {
      console.error(`[PG] Error querying layer ${slug}:`, err.message);
      output.results[slug] = { features: [], cacheHit: false, error: err.message };
    }
  }
  return output;
}

async function queryFeaturesInBbox(layerSlug, bbox) {
  const pool = getPool();
  if (!pool) throw AppError.serviceUnavailable('Database not configured');

  const tables = postgisRegistry.getTablesForLayer(layerSlug);
  if (!tables || tables.length === 0) throw AppError.badRequest(`Unknown or unsupported layer: ${layerSlug}`);

  if (!Array.isArray(bbox) || bbox.length !== 4) throw AppError.badRequest('Invalid bbox');
  const [minLon, minLat, maxLon, maxLat] = bbox.map(Number);
  if ([minLon, minLat, maxLon, maxLat].some(n => Number.isNaN(n))) throw AppError.badRequest('Invalid bbox coordinates');

  const env = `ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326)`;
  const results = [];
  for (const tbl of tables) {
    // Validate table name to prevent SQL injection
    const safeTableName = validateTableName(tbl);
    const sql = `
      SELECT (to_jsonb(t) - 'geom') as properties,
             ST_AsGeoJSON(t.geom)::json as geometry
      FROM ${safeTableName} t
      WHERE ST_Intersects(t.geom, ${env})
      LIMIT 2000;
    `;
    try {
      const { rows } = await pool.query(sql);
      for (const r of rows) {
        const props = r.properties || {};
        results.push({ id: props.id || props.gid || null, layerId: layerSlug, name: props.name || '', properties: props, geometry: r.geometry });
      }
    } catch (err) {
      console.error(`[PG] error bbox querying ${tbl}:`, err.message);
    }
  }
  return { features: results, bbox };
}

module.exports = {
  queryFeaturesNearPoint,
  queryMultipleLayersNearPoint,
  queryFeaturesInBbox,
};