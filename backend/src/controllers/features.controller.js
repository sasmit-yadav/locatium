const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');
const postgisRegistry = require('../config/postgis-registry');
const layerRegistry = require('../config/layer-registry');

const DEFAULT_LIMIT = 50;

/**
 * Validate that a table name is safe to use in SQL queries.
 * Only allows alphanumeric characters and underscores.
 */
function validateTableName(tableName) {
  if (!tableName || typeof tableName !== 'string') {
    throw new AppError(400, 'invalid_table_name', 'Invalid table name');
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new AppError(400, 'invalid_table_name_format', 'Invalid table name format');
  }
  return tableName;
}

function ensurePool() {
  const pool = getPool();
  if (!pool) throw new AppError(503, 'database_not_configured', 'Database not configured');
  return pool;
}

async function searchFeatures(req, res) {
  const pool = ensurePool();
  const { keyword, layer } = req.query;
  if (!keyword || typeof keyword !== 'string' || keyword.trim() === '') throw new AppError(400, 'invalid_keyword', 'keyword parameter is required');

  const q = `%${keyword}%`;
  const allowed = new Set(postgisRegistry.listLayerKeys());
  const target = layer && allowed.has(layer) ? layer : null;

  const tables = target
    ? postgisRegistry.getTablesForLayer(target)
    : [].concat(...postgisRegistry.listLayerKeys().map(k => postgisRegistry.getTablesForLayer(k)));

  const results = [];
  for (const tbl of tables) {
    const safeTbl = validateTableName(tbl);
    const sql = `SELECT (to_jsonb(t) - 'geom') as properties, ST_AsGeoJSON(t.geom)::json as geometry FROM ${safeTbl} t WHERE to_jsonb(t)::text ILIKE $1 LIMIT $2`;
    try {
      const { rows } = await pool.query(sql, [q, DEFAULT_LIMIT]);
      for (const r of rows) {
        const props = r.properties || {};
        results.push({ id: props.id || props.gid || null, layerId: target || 'unknown', name: props.name || props.title || '', properties: props, geometry: r.geometry || null });
        if (results.length >= DEFAULT_LIMIT) break;
      }
    } catch (e) {
      console.error('[features] search error', e.message || e);
    }
    if (results.length >= DEFAULT_LIMIT) break;
  }

  res.json({ keyword, layer: target || 'all', count: results.length, features: results });
}

async function findNearby(req, res) {
  const pool = ensurePool();
  const { lat, lng, radius = 2, type } = req.query;
  if (!lat || !lng) throw new AppError(400, 'invalid_coordinates', 'lat and lng parameters are required');
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) throw new AppError(400, 'invalid_coordinates', 'Invalid lat/lng values');

  const radiusKm = Number(radius) || 2;
  const radiusM = Math.max(10, Math.min(200000, Math.round(radiusKm * 1000)));

  const layerKeys = type && postgisRegistry.hasLayer(type) ? [type] : postgisRegistry.listLayerKeys();
  const candidates = [];

  for (const key of layerKeys) {
    const tables = postgisRegistry.getTablesForLayer(key);
    for (const tbl of tables) {
      const safeTbl = validateTableName(tbl);
      const sql = `SELECT (to_jsonb(t) - 'geom') as properties, ST_AsGeoJSON(t.geom)::json as geometry, ST_Distance(t.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) as distance_m FROM ${safeTbl} t WHERE ST_DWithin(t.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3) LIMIT 200`;
      try {
        const { rows } = await pool.query(sql, [lngNum, latNum, radiusM]);
        for (const r of rows) {
          const props = r.properties || {};
          candidates.push({ id: props.id || props.gid || null, layerId: key, name: props.name || '', properties: props, geometry: r.geometry || null, distanceKm: +(r.distance_m / 1000).toFixed(3) });
        }
      } catch (e) {
        console.error('[features] nearby query error', e.message || e);
      }
    }
  }

  candidates.sort((a, b) => (a.distanceKm || 1e9) - (b.distanceKm || 1e9));
  const features = candidates.slice(0, DEFAULT_LIMIT);
  res.json({ center: { lat: latNum, lng: lngNum }, radiusKm, type: type || 'all', count: features.length, features });
}

async function getFeatureDetail(req, res) {
  const pool = ensurePool();
  const { layerId, featureId } = req.params;
  if (!featureId) throw new AppError(400, 'invalid_id', 'featureId is required');

  const searchLayers = layerId && postgisRegistry.hasLayer(layerId) ? [layerId] : postgisRegistry.listLayerKeys();

  for (const key of searchLayers) {
    const tables = postgisRegistry.getTablesForLayer(key);
    for (const tbl of tables) {
      const safeTbl = validateTableName(tbl);
      const sql = `SELECT (to_jsonb(t) - 'geom') as properties, ST_AsGeoJSON(t.geom)::json as geometry FROM ${safeTbl} t WHERE (t.id::text = $1 OR t.gid::text = $1 OR t.pk::text = $1) LIMIT 1`;
      try {
        const { rows } = await pool.query(sql, [String(featureId)]);
        if (rows.length > 0) {
          const r = rows[0];
          const props = r.properties || {};

          // compute nearby count (simple sum across registered tables within 5km)
          let nearbyCount = 0;
          try {
            const geomText = JSON.stringify(r.geometry || {});
            for (const k of postgisRegistry.listLayerKeys()) {
              const tbs = postgisRegistry.getTablesForLayer(k);
            for (const t of tbs) {
              try {
                const safeT = validateTableName(t);
                const cr = await pool.query(`SELECT COUNT(*) as cnt FROM ${safeT} WHERE ST_DWithin(geom::geography, ST_GeomFromGeoJSON($1)::geography, 5000)`, [geomText]);
                  nearbyCount += parseInt(cr.rows[0].cnt || 0, 10);
                } catch (_) {
                  // ignore per-table errors
                }
              }
            }
          } catch (_) {
            nearbyCount = 0;
          }

          res.json({ id: props.id || props.gid || null, layerId: key, name: props.name || '', properties: props, geometry: r.geometry || null, nearbyCount });
          return;
        }
      } catch (e) {
        // continue
      }
    }
  }

  throw new AppError(404, 'feature_not_found', 'Feature not found');
}

async function getLayerStatistics(req, res) {
  const pool = ensurePool();
  const { layer } = req.query;
  const allowed = new Set(postgisRegistry.listLayerKeys());
  const keys = layer && allowed.has(layer) ? [layer] : postgisRegistry.listLayerKeys();

  const stats = [];
  for (const key of keys) {
    const tables = postgisRegistry.getTablesForLayer(key);
    let featureCount = 0;
    let totalArea = 0;
    for (const tbl of tables) {
      try {
        const safeTbl = validateTableName(tbl);
        const c = await pool.query(`SELECT COUNT(*) as cnt, SUM(ST_Area(geom::geography)) as area FROM ${safeTbl}`);
        featureCount += parseInt(c.rows[0].cnt || 0, 10);
        totalArea += parseFloat(c.rows[0].area || 0);
      } catch (_) {
        // ignore per-table errors
      }
    }
    stats.push({ layerId: key, featureCount, totalAreaSqm: totalArea });
  }

  res.json({ layer: layer || 'all', count: stats.length, statistics: stats });
}

async function queryWithinBounds(req, res) {
  const pool = ensurePool();
  const { bbox, layer } = req.body;
  if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) throw new AppError(400, 'invalid_bbox', 'bbox must be [minLon,minLat,maxLon,maxLat]');
  const [minLon, minLat, maxLon, maxLat] = bbox.map(Number);

  const allowed = new Set(postgisRegistry.listLayerKeys());
  const keys = layer && allowed.has(layer) ? [layer] : postgisRegistry.listLayerKeys();

  const env = `ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326)`;
  const features = [];
  for (const key of keys) {
    const tables = postgisRegistry.getTablesForLayer(key);
    for (const tbl of tables) {
      const safeTbl = validateTableName(tbl);
      const sql = `SELECT (to_jsonb(t) - 'geom') as properties, ST_AsGeoJSON(t.geom)::json as geometry FROM ${safeTbl} t WHERE ST_Intersects(t.geom, ${env}) LIMIT 200`;
      try {
        const { rows } = await pool.query(sql);
        for (const r of rows) {
          const props = r.properties || {};
          features.push({ id: props.id || props.gid || null, layerId: key, name: props.name || '', properties: props, geometry: r.geometry || null });
        }
      } catch (e) {
        console.error('[features] bbox query error', e.message || e);
      }
    }
  }

  res.json({ bbox, layer: layer || 'all', count: features.length, features });
}

async function findNearestFacility(req, res) {
  const pool = ensurePool();
  const { lat, lng, facility_type, max_distance_km = 10 } = req.body;
  if (!lat || !lng) throw new AppError(400, 'invalid_coordinates', 'lat and lng are required');
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) throw new AppError(400, 'invalid_coordinates', 'Invalid lat/lng values');

  const maxM = Math.max(10, Math.min(200000, Math.round(Number(max_distance_km) * 1000)));

  const layerKeys = facility_type && postgisRegistry.hasLayer(facility_type) ? [facility_type] : postgisRegistry.listLayerKeys();
  let best = null;

  for (const key of layerKeys) {
    const tables = postgisRegistry.getTablesForLayer(key);
    for (const tbl of tables) {
      const safeTbl = validateTableName(tbl);
      const sql = `SELECT (to_jsonb(t) - 'geom') as properties, ST_AsGeoJSON(t.geom)::json as geometry, ST_Distance(t.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) as distance_m FROM ${safeTbl} t WHERE ST_DWithin(t.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3) ORDER BY distance_m ASC LIMIT 1`;
      try {
        const { rows } = await pool.query(sql, [lngNum, latNum, maxM]);
        if (rows.length > 0) {
          const r = rows[0];
          const props = r.properties || {};
          const candidate = { id: props.id || props.gid || null, layerId: key, name: props.name || '', properties: props, geometry: r.geometry || null, distanceKm: +(r.distance_m / 1000).toFixed(3) };
          if (!best || candidate.distanceKm < best.distanceKm) best = candidate;
        }
      } catch (e) {
        console.error('[features] nearest facility error', e.message || e);
      }
    }
  }

  if (!best) {
    res.json({ found: false, message: 'No facility found within specified distance' });
    return;
  }

  res.json({ found: true, facility: best });
}

async function getZoneFacilitiesSummary(req, res) {
  const pool = ensurePool();
  const { zoneId } = req.query;
  if (!zoneId) throw new AppError(400, 'invalid_zone', 'zoneId parameter is required');

  // find zone geometry across registry
  let zoneGeom = null;
  let zoneMeta = null;
  for (const key of postgisRegistry.listLayerKeys()) {
    const tables = postgisRegistry.getTablesForLayer(key);
    for (const tbl of tables) {
      try {
        const safeTbl = validateTableName(tbl);
        const sql = `SELECT (to_jsonb(t) - 'geom') as properties, ST_AsGeoJSON(t.geom)::json as geometry FROM ${safeTbl} t WHERE (t.id::text = $1 OR t.gid::text = $1 OR t.pk::text = $1) LIMIT 1`;
        const { rows } = await pool.query(sql, [String(zoneId)]);
        if (rows.length > 0) {
          zoneGeom = rows[0].geometry;
          zoneMeta = { id: rows[0].properties?.id || null, name: rows[0].properties?.name || '', layer: key };
          break;
        }
      } catch (_) {
        // ignore
      }
    }
    if (zoneGeom) break;
  }

  if (!zoneGeom) throw new AppError(404, 'zone_not_found', 'Zone not found');

  const centerGeom = `ST_Centroid(ST_GeomFromGeoJSON('${JSON.stringify(zoneGeom)}'))`;
  const keys = postgisRegistry.listLayerKeys();
  const counts = {};

    for (const k of keys) {
      const tables = postgisRegistry.getTablesForLayer(k);
      let count2 = 0;
      let count5 = 0;
      for (const t of tables) {
        try {
          const safeT = validateTableName(t);
          const c2 = await pool.query(`SELECT COUNT(*) as cnt FROM ${safeT} WHERE ST_DWithin(geom::geography, ${centerGeom}::geography, 2000)`);
          const c5 = await pool.query(`SELECT COUNT(*) as cnt FROM ${safeT} WHERE ST_DWithin(geom::geography, ${centerGeom}::geography, 5000)`);
        count2 += parseInt(c2.rows[0].cnt || 0, 10);
        count5 += parseInt(c5.rows[0].cnt || 0, 10);
      } catch (_) {
        // ignore per-table errors
      }
    }
    counts[k] = { '2km': count2, '5km': count5 };
  }

  res.json({ zoneId, zone: zoneMeta, facilitiesCount: counts });
}

async function getZoneFacilitiesByType(req, res) {
  const pool = ensurePool();
  const { zoneId, facilityType } = req.params;
  const { sort = 'distance', limit = 50 } = req.query;
  if (!zoneId) throw new AppError(400, 'invalid_zone', 'zoneId is required');

  // find zone geometry
  let zoneGeom = null;
  for (const key of postgisRegistry.listLayerKeys()) {
    const tables = postgisRegistry.getTablesForLayer(key);
    for (const tbl of tables) {
      try {
        const safeTbl = validateTableName(tbl);
        const sql = `SELECT ST_AsGeoJSON(t.geom)::json as geometry FROM ${safeTbl} t WHERE (t.id::text = $1 OR t.gid::text = $1 OR t.pk::text = $1) LIMIT 1`;
        const { rows } = await pool.query(sql, [String(zoneId)]);
        if (rows.length > 0) {
          zoneGeom = rows[0].geometry;
          break;
        }
      } catch (_) {}
    }
    if (zoneGeom) break;
  }

  if (!zoneGeom) throw new AppError(404, 'zone_not_found', 'Zone not found');

  const centerGeomText = JSON.stringify(zoneGeom || {});
  const tables = postgisRegistry.hasLayer(facilityType) ? postgisRegistry.getTablesForLayer(facilityType) : [];
  const results = [];

  for (const tbl of tables) {
    const safeTbl = validateTableName(tbl);
    const sql = `SELECT (to_jsonb(t) - 'geom') as properties, ST_AsGeoJSON(t.geom)::json as geometry, ST_Distance(t.geom::geography, ST_Centroid(ST_GeomFromGeoJSON($1))::geography) as distance_m FROM ${safeTbl} t WHERE ST_DWithin(t.geom, ST_GeomFromGeoJSON($1), 5000) LIMIT $2`;
    try {
      const { rows } = await pool.query(sql, [centerGeomText, limit]);
      for (const r of rows) {
        const props = r.properties || {};
        results.push({ id: props.id || props.gid || null, name: props.name || '', type: facilityType, properties: props, geometry: r.geometry || null, distanceFromZoneKm: +(r.distance_m / 1000).toFixed(3) });
      }
    } catch (e) {
      console.error('[features] zone facilities error', e.message || e);
    }
  }

  if (sort !== 'distance') results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  else results.sort((a, b) => (a.distanceFromZoneKm || 1e9) - (b.distanceFromZoneKm || 1e9));

  res.json({ zoneId, facilityType, count: results.length, facilities: results.slice(0, Number(limit)) });
}

function parseBboxQuery(bboxRaw) {
  if (!bboxRaw || typeof bboxRaw !== 'string') {
    throw new AppError(400, 'invalid_bbox', 'Query parameter bbox is required (minLon,minLat,maxLon,maxLat)');
  }
  const parts = bboxRaw.split(',').map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw new AppError(400, 'invalid_bbox', 'bbox must be four comma-separated numbers');
  }
  const [minX, minY, maxX, maxY] = parts;
  if (minX >= maxX || minY >= maxY) {
    throw new AppError(400, 'invalid_bbox', 'bbox must have minLon < maxLon and minLat < maxLat');
  }
  return { minX, minY, maxX, maxY };
}

/** Bbox-filtered GeoJSON for a single table (clustering / lightweight overlays). */
async function getFeaturesByBbox(req, res) {
  const pool = ensurePool();
  const { tableId } = req.params;
  if (!layerRegistry.hasTable(tableId)) {
    throw new AppError(400, 'unknown_table', `Unknown table layer: ${tableId}`);
  }

  const bbox = parseBboxQuery(req.query.bbox);
  const limit = Math.min(2000, Math.max(1, Number.parseInt(req.query.limit, 10) || 1500));
  const safeTbl = validateTableName(tableId);
  const env = `ST_MakeEnvelope(${bbox.minX}, ${bbox.minY}, ${bbox.maxX}, ${bbox.maxY}, 4326)`;

  const sql = `SELECT (to_jsonb(t) - 'geom') as properties, ST_AsGeoJSON(t.geom)::json as geometry
    FROM ${safeTbl} t
    WHERE ST_Intersects(t.geom, ${env})
    LIMIT ${limit}`;

  const features = [];
  try {
    const { rows } = await pool.query(sql);
    for (const r of rows) {
      features.push({ type: 'Feature', properties: r.properties || {}, geometry: r.geometry || null });
    }
  } catch (err) {
    console.error('[features] bbox query error:', err.message);
    throw new AppError(503, 'bbox_query_failed', 'Feature query failed');
  }

  res.json({ type: 'FeatureCollection', features });
}

module.exports = {
  searchFeatures,
  findNearby,
  getFeatureDetail,
  getLayerStatistics,
  queryWithinBounds,
  findNearestFacility,
  getZoneFacilitiesSummary,
  getZoneFacilitiesByType,
  getFeaturesByBbox,
};
