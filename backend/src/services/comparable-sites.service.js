const { getPool } = require('../db/pool');

const GRID_STEP = 0.025; // ~2.5 km grid for comparable sampling

async function findComparableSites(location, sector, { radiusKm = 10, limit = 12 } = {}) {
  const pool = getPool();
  if (!pool) return { count: 0, sites: [], summary: null };

  const analysisScoring = require('./analysis-scoring.service');
  const radiusDeg = (radiusKm * 1000) / 111320.0;
  const sites = [];

  try {
    const seedPoints = await pool.query(
      `SELECT lat, lng, price_per_sq_yard_inr, district
       FROM (
         SELECT ST_Y(geom) AS lat, ST_X(geom) AS lng, price_per_sq_yard_inr, district
         FROM land_transactions
         WHERE geom IS NOT NULL
           AND geom && ST_Expand(ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
           AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
         UNION ALL
         SELECT ST_Y(centroid) AS lat, ST_X(centroid) AS lng, NULL AS price_per_sq_yard_inr, district
         FROM (
           SELECT ST_Centroid(geom) AS centroid, district1 AS district
           FROM hsiidc_boundary
           WHERE geom IS NOT NULL
             AND geom && ST_Expand(ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
             AND ST_DWithin(ST_Centroid(geom), ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
           LIMIT 8
         ) z
       ) pts
       LIMIT $4`,
      [location.lng, location.lat, radiusDeg, limit]
    );

    for (const row of seedPoints.rows) {
      const scored = await analysisScoring.scoreLocation({
        lat: Number(row.lat),
        lng: Number(row.lng),
        sector,
      });
      sites.push({
        lat: Number(row.lat),
        lng: Number(row.lng),
        district: row.district,
        overallScore: scored.overallScore,
        pricePerSqYardInr: row.price_per_sq_yard_inr ? Number(row.price_per_sq_yard_inr) : null,
        distanceKm: haversineKm(location.lat, location.lng, Number(row.lat), Number(row.lng)),
      });
    }

    sites.sort((a, b) => a.distanceKm - b.distanceKm);

    const scores = sites.map((s) => s.overallScore);
    const summary =
      scores.length > 0
        ? {
            count: scores.length,
            averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
            minScore: Math.min(...scores),
            maxScore: Math.max(...scores),
            radiusKm,
            message: `Similar sites within ${radiusKm} km score ${Math.min(...scores)}–${Math.max(...scores)} (avg ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)})`,
          }
        : null;

    return { count: sites.length, sites: sites.slice(0, limit), summary };
  } catch {
    return { count: 0, sites: [], summary: null };
  }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

module.exports = { findComparableSites, GRID_STEP };
