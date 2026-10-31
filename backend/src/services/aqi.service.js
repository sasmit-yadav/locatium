const { getPool } = require('../db/pool');

async function nearestStationAqi(location) {
  const pool = getPool();
  if (!pool) return null;

  try {
    const sql = `
      SELECT aqi, category, name, district,
             ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000.0 AS distance_km
      FROM aqi_stations
      WHERE geom IS NOT NULL
      ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
      LIMIT 1
    `;
    const { rows } = await pool.query(sql, [location.lng, location.lat]);
    if (!rows.length) return null;
    return {
      aqi: rows[0].aqi,
      category: rows[0].category,
      stationName: rows[0].name,
      district: rows[0].district,
      distanceKm: Number(rows[0].distance_km),
    };
  } catch {
    return null;
  }
}

module.exports = { nearestStationAqi };
