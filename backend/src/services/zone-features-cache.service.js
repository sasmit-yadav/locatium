/**
 * zone_features materialized view + Redis cache for fast investor lookups.
 */

const { getPool } = require('../db/pool');
const redis = require('./redis-cache.service');

const TTL_SEC = 3600;

function cacheKey(zoneId) {
  return `zone_features:${zoneId}`;
}

async function getZoneFeatures(zoneId) {
  const pool = getPool();
  if (!pool) return null;

  const featureId = zoneId.includes(':') ? zoneId.split(':')[1] : zoneId;
  const redisKey = cacheKey(featureId);

  const cached = await redis.getString(redisKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      /* fall through */
    }
  }

  try {
    const { rows } = await pool.query(
      `SELECT zone_id, district, lat, lng, dist_road_km, dist_rail_km, dist_airport_km,
              dist_industrial_km, hospitals_5km, schools_5km, utilities_2km, roads_3km,
              dist_forest_km, dist_flood_km
       FROM zone_features WHERE zone_id = $1 LIMIT 1`,
      [featureId]
    );
    if (!rows[0]) return null;
    await redis.setString(redisKey, JSON.stringify(rows[0]), TTL_SEC);
    return rows[0];
  } catch {
    return null;
  }
}

async function refreshMaterializedView() {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY zone_features');
  return { refreshedAt: new Date().toISOString() };
}

module.exports = { getZoneFeatures, refreshMaterializedView, cacheKey };
