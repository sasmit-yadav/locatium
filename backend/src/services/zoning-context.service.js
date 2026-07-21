const { getPool } = require('../db/pool');

function tablePointSql() {
  return 'ST_SetSRID(ST_MakePoint($1, $2), 4326)';
}

async function safeQuery(pool, sql, params) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function gatherZoningContext(pool, location) {
  const point = tablePointSql();
  const lng = location.lng;
  const lat = location.lat;

  const insideHsiidc = await safeQuery(
    pool,
    `SELECT id::text AS zone_id FROM hsiidc_boundary
     WHERE geom IS NOT NULL AND ST_Contains(geom, ${point}) LIMIT 1`,
    [lng, lat]
  );

  const landUse = await safeQuery(
    pool,
    `SELECT COALESCE(NULLIF(TRIM(class_name), ''), NULLIF(TRIM(lu_desc), ''), NULLIF(TRIM(landuse), ''), 'unknown') AS land_use
     FROM lu_lc
     WHERE geom IS NOT NULL AND ST_Contains(geom, ${point})
     LIMIT 1`,
    [lng, lat]
  );

  const controlledArea = await safeQuery(
    pool,
    `SELECT ST_Distance(geom::geography, ${point}::geography) / 1000.0 AS distance_km
     FROM controlled_area
     WHERE geom IS NOT NULL
     ORDER BY geom <-> ${point}
     LIMIT 1`,
    [lng, lat]
  );

  const developmentPlan = await safeQuery(
    pool,
    `SELECT ST_Distance(geom::geography, ${point}::geography) / 1000.0 AS distance_km
     FROM development_plan
     WHERE geom IS NOT NULL
     ORDER BY geom <-> ${point}
     LIMIT 1`,
    [lng, lat]
  );

  return {
    insideHsiidc: Boolean(insideHsiidc?.zone_id),
    hsiidcZoneId: insideHsiidc?.zone_id || null,
    landUseClass: landUse?.land_use || null,
    controlledAreaKm: controlledArea ? Number(controlledArea.distance_km) : null,
    developmentPlanKm: developmentPlan ? Number(developmentPlan.distance_km) : null,
  };
}

module.exports = { gatherZoningContext };
