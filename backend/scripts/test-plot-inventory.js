require('dotenv').config();
const { getPool } = require('../src/db/pool');
const { getPlotInventoryForZone } = require('../src/services/plot-inventory.service');

(async () => {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT id, district1,
      ST_X(ST_PointOnSurface(geom)) AS lng,
      ST_Y(ST_PointOnSurface(geom)) AS lat,
      ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0008))::json AS geometry
    FROM hsiidc_boundary WHERE LOWER(district1) LIKE '%guru%' LIMIT 1
  `);
  const row = rows[0];
  const zone = {
    id: `hsiidc_boundary:${row.id}`,
    tableId: 'hsiidc_boundary',
    featureId: row.id,
    district: row.district1,
    center: { lat: row.lat, lng: row.lng },
    geometry: row.geometry,
  };
  const inv = await getPlotInventoryForZone(zone, 'industrial');
  console.log(JSON.stringify({ count: inv.count, matchMode: inv.matchMode, first: inv.plots[0] }, null, 2));
  process.exit(0);
})();
