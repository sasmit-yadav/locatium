const { xyzToBBox3857 } = require('../utils/tile-bbox');
const redisCache = require('./redis-cache.service');
const memoryTileCache = require('./memory-tile-cache.service');
const { getPool } = require('../db/pool');
const postgisRegistry = require('../config/postgis-registry');
const layerRegistry = require('../config/layer-registry');
const {
  tileCacheTtlSec,
  mapQueryCacheTtlSec,
  mapIdentifyTolerancePxSafe,
} = require('../config');
const { AppError } = require('../middleware/error.middleware');

const MVT_STATEMENT_TIMEOUT_MS = Number(process.env.MVT_STATEMENT_TIMEOUT_MS) || 8000;
const IDENTIFY_CONCURRENCY = Number(process.env.IDENTIFY_CONCURRENCY) || 6;
const MAX_CONCURRENT_MVT = Number(process.env.MVT_MAX_CONCURRENT) || 4;
let activeMvtJobs = 0;
const mvtWaitQueue = [];

function acquireMvtSlot() {
  if (activeMvtJobs < MAX_CONCURRENT_MVT) {
    activeMvtJobs += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    mvtWaitQueue.push(resolve);
  }).then(() => {
    activeMvtJobs += 1;
  });
}

function releaseMvtSlot() {
  activeMvtJobs = Math.max(0, activeMvtJobs - 1);
  const next = mvtWaitQueue.shift();
  if (next) next();
}

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

function buildExportUrl(mapServerBaseUrl, bbox, width = 512, height = 512) {
  const params = new URLSearchParams({
    bbox: `${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}`,
    bboxSR: '3857',
    imageSR: '3857',
    size: `${width},${height}`,
    format: 'png',
    transparent: 'true',
    f: 'image',
  });
  return `${mapServerBaseUrl}/export?${params.toString()}`;
}

function mapAuthHint() {
  return 'Set MAP_SERVER_TOKEN or MAP_SERVER_USERNAME and MAP_SERVER_PASSWORD in backend/.env, then restart the API.';
}

function assertPngBuffer(buf, contentType) {
  const ct = contentType || '';
  if (!ct.includes('image')) {
    let msg = 'MapServer did not return an image';
    try {
      const errJson = JSON.parse(buf.toString('utf8'));
      if (errJson.error?.message) msg = errJson.error.message;
    } catch {
      /* not JSON */
    }
    if (/token required/i.test(msg)) {
      throw AppError.serviceUnavailable(`HARSAC MapServer requires a token. ${mapAuthHint()}`);
    }
    throw AppError.badRequest(msg);
  }
  if (buf.length < 8 || buf[0] !== 0x89) {
    throw AppError.badRequest('MapServer returned invalid PNG data');
  }
}

async function ensureMapTokenOrThrow() {
  if (!isTokenConfigured()) {
    throw AppError.serviceUnavailable(`HARSAC MapServer requires a token. ${mapAuthHint()}`);
  }
  const token = await getMapServerToken();
  if (!token) {
    throw AppError.serviceUnavailable(`Could not obtain a MapServer token. ${mapAuthHint()}`);
  }
}

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), mapUpstreamTimeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: getMapServerFetchHeaders({ Accept: 'image/png,*/*' }),
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function validateExtent4326(ext) {
  if (!ext || typeof ext !== 'object') {
    throw AppError.badRequest('extent4326 must be an object with xmin, ymin, xmax, ymax');
  }
  const { xmin, ymin, xmax, ymax } = ext;
  const nums = [xmin, ymin, xmax, ymax].map((n) => Number(n));
  if (nums.some((n) => Number.isNaN(n))) {
    throw AppError.badRequest('extent4326 values must be numbers');
  }
  if (nums[0] >= nums[2] || nums[1] >= nums[3]) {
    throw AppError.badRequest('extent4326 must have xmin < xmax and ymin < ymax');
  }
  return { xmin: nums[0], ymin: nums[1], xmax: nums[2], ymax: nums[3] };
}

async function fetchJsonPostForm(url, formBody) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), mapUpstreamTimeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: getMapServerFetchHeaders({
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json,*/*',
      }),
      body: typeof formBody === 'string' ? formBody : formBody.toString(),
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function fetchJsonWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), mapUpstreamTimeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: getMapServerFetchHeaders({ Accept: 'application/json,*/*' }),
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function parseBBox(bboxRaw) {
  if (!bboxRaw || typeof bboxRaw !== 'string') {
    throw AppError.badRequest('Query parameter bbox is required (minLon,minLat,maxLon,maxLat)');
  }
  const parts = bboxRaw.split(',').map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw AppError.badRequest('bbox must be four comma-separated numbers: minLon,minLat,maxLon,maxLat');
  }
  const [minX, minY, maxX, maxY] = parts;
  return { minX, minY, maxX, maxY };
}

function validateTileCoords(z, x, y) {
  const zi = Number.parseInt(z, 10);
  const xi = Number.parseInt(x, 10);
  const yi = Number.parseInt(y, 10);
  if ([zi, xi, yi].some((n) => Number.isNaN(n) || n < 0)) {
    throw AppError.badRequest('Invalid tile coordinates');
  }
  if (zi > 23 || zi < 0) {
    throw AppError.badRequest('Zoom level must be between 0 and 23');
  }
  const maxTile = 2 ** zi;
  if (xi >= maxTile || yi >= maxTile) {
    throw AppError.badRequest('Tile index out of range for zoom level');
  }
  return { zi, xi, yi };
}

function simplifyToleranceForZoom(zi, heavy = false) {
  let tol;
  if (zi >= 16) tol = 0;
  else if (zi >= 14) tol = 0.00005;
  else if (zi >= 12) tol = 0.0002;
  else if (zi >= 10) tol = 0.0008;
  else tol = 0.003;
  return heavy && tol > 0 ? tol * 4 : tol;
}

function featureLimitForTile(zi, heavy = false) {
  if (heavy) {
    if (zi >= 15) return 12000;
    if (zi >= 13) return 8000;
    if (zi >= 11) return 5000;
    return 3000;
  }
  if (zi >= 14) return 12000;
  if (zi >= 12) return 8000;
  if (zi >= 10) return 6000;
  return 4000;
}

async function generateMvtForTable(tableId, zi, xi, yi) {
  const cfg = layerRegistry.getLayerConfig(tableId);
  const minzoom = cfg?.minzoom ?? 0;
  if (zi < minzoom) return Buffer.from([]);

  const safeTbl = validateTableName(tableId);
  const bbox3857 = xyzToBBox3857(zi, xi, yi);
  const pool = getPool();
  if (!pool) throw AppError.serviceUnavailable('Database not configured');

  const heavy = Boolean(cfg?.heavy);
  const tol = simplifyToleranceForZoom(zi, heavy);
  // Several imported HARSAC tables are stored as PointZM / LineStringZM with a NaN M
  // ordinate (e.g. rapid_metro_station, water_network). ST_AsMVTGeom rejects those with
  // "Geometry contains invalid coordinates" and the whole layer silently disappears from
  // the map. MVT is a 2D format anyway, so flattening first loses nothing.
  const geom2d = 'ST_Force2D(t.geom)';
  const geomExpr = tol > 0 ? `ST_SimplifyPreserveTopology(${geom2d}, ${tol})` : geom2d;
  // Always cap features so a dense tile cannot stall the pool / browser.
  const limit = featureLimitForTile(zi, heavy) || (heavy ? 3000 : 8000);
  const limitClause = `LIMIT ${limit}`;

  const sql = `WITH bounds AS (
    SELECT ST_Transform(ST_MakeEnvelope(${bbox3857.minX}, ${bbox3857.minY}, ${bbox3857.maxX}, ${bbox3857.maxY}, 3857), 4326) AS geom4326
  ), candidates AS (
    SELECT (to_jsonb(t) - 'geom') as properties,
           ST_AsMVTGeom(${geomExpr}, bounds.geom4326, 4096, 64, true) as geom
    FROM ${safeTbl} t, bounds
    WHERE t.geom && bounds.geom4326
      AND ST_Intersects(t.geom, bounds.geom4326)
    ${limitClause}
  ), q AS (
    SELECT properties, geom FROM candidates WHERE geom IS NOT NULL
  ) SELECT ST_AsMVT(q, 'data', 4096, 'geom') as mvt FROM q;`;

  await acquireMvtSlot();
  const client = await pool.connect();
  try {
    await client.query(`SET LOCAL statement_timeout = ${MVT_STATEMENT_TIMEOUT_MS}`);
    const { rows } = await client.query(sql);
    return rows[0] && rows[0].mvt ? rows[0].mvt : Buffer.from([]);
  } catch (err) {
    const msg = String(err.message || err);
    if (
      msg.includes('statement timeout') ||
      msg.includes('canceling statement') ||
      msg.includes('coordinates') ||
      msg.includes('ST_Transform') ||
      msg.includes('envelope')
    ) {
      console.warn(`[maps-proxy] MVT skipped for ${tableId} at z${zi}:`, msg);
      return Buffer.from([]);
    }
    throw err;
  } finally {
    client.release();
    releaseMvtSlot();
  }
}

async function getTilePng(layerSlug, z, x, y) {
  const { zi, xi, yi } = validateTileCoords(z, x, y);
  const cacheKey = `tile:v4:${layerSlug}:${zi}:${xi}:${yi}`;

  const memCached = memoryTileCache.get(cacheKey);
  if (memCached) return { buffer: memCached, cacheHit: true, cacheLayer: 'memory', contentType: 'application/vnd.mapbox-vector-tile' };

  const redisCached = await redisCache.getBuffer(cacheKey);
  if (redisCached) {
    memoryTileCache.set(cacheKey, redisCached);
    return { buffer: redisCached, cacheHit: true, cacheLayer: 'redis', contentType: 'application/vnd.mapbox-vector-tile' };
  }

  // Per-table vector tile (preferred)
  if (layerRegistry.hasTable(layerSlug)) {
    try {
      const buf = await generateMvtForTable(layerSlug, zi, xi, yi);
      memoryTileCache.set(cacheKey, buf);
      await redisCache.setBuffer(cacheKey, buf, tileCacheTtlSec);
      return { buffer: buf, cacheHit: false, cacheLayer: 'miss', contentType: 'application/vnd.mapbox-vector-tile' };
    } catch (err) {
      console.error('[maps-proxy] MVT generation error:', err.message);
      throw AppError.serviceUnavailable('Tile generation failed');
    }
  }

  // Category slug — deprecated for tiles; return empty MVT (use per-table tiles)
  if (postgisRegistry.hasLayer(layerSlug)) {
    const empty = Buffer.from([]);
    memoryTileCache.set(cacheKey, empty);
    return { buffer: empty, cacheHit: false, cacheLayer: 'deprecated-category', contentType: 'application/vnd.mapbox-vector-tile' };
  }

  // Unknown slug: neither a registered table nor a category. Returning an empty 200 here
  // made a typo'd or retired layer look like an empty area of the map instead of a
  // configuration error, so say so. Nothing reaches SQL — both registries are allowlists.
  throw AppError.notFound(`Unknown tile layer: ${String(layerSlug).slice(0, 64)}`);
}

async function getGeoJsonForBBox(layerSlug, bboxRaw) {
  const bbox = parseBBox(bboxRaw);
  const bboxKey = `${bbox.minX.toFixed(5)},${bbox.minY.toFixed(5)},${bbox.maxX.toFixed(5)},${bbox.maxY.toFixed(5)}`;
  const cacheKey = `geo:v1:${layerSlug}:${bboxKey}`;

  const cachedStr = await redisCache.getString(cacheKey);
  if (cachedStr) {
    try { return { json: JSON.parse(cachedStr), cacheHit: true }; } catch {}
  }

  if (!postgisRegistry.hasLayer(layerSlug)) throw AppError.badRequest(`Unknown layer: ${layerSlug}`);
  const tables = postgisRegistry.getTablesForLayer(layerSlug);
  const pool = getPool();
  if (!pool) throw AppError.serviceUnavailable('Database not configured');

  const env = `ST_MakeEnvelope(${bbox.minX}, ${bbox.minY}, ${bbox.maxX}, ${bbox.maxY}, 4326)`;
  const features = [];
  for (const tbl of tables) {
    const safeTbl = validateTableName(tbl);
    const sql = `SELECT (to_jsonb(t) - 'geom') as properties, ST_AsGeoJSON(t.geom)::json as geometry FROM ${safeTbl} t WHERE ST_Intersects(t.geom, ${env}) LIMIT 2000;`;
    try {
      const { rows } = await pool.query(sql);
      for (const r of rows) features.push({ type: 'Feature', properties: r.properties || {}, geometry: r.geometry || null });
    } catch (err) {
      console.error('[maps-proxy] geojson bbox query error:', err.message);
    }
  }

  const fc = { type: 'FeatureCollection', features };
  await redisCache.setString(cacheKey, JSON.stringify(fc), mapQueryCacheTtlSec);
  return { json: fc, cacheHit: false };
}

async function getLayerServiceInfo(layerSlug) {
  const cacheKey = `info:v1:${layerSlug}`;
  const cachedStr = await redisCache.getString(cacheKey);
  if (cachedStr) {
    try { return { json: JSON.parse(cachedStr), cacheHit: true }; } catch {}
  }

  if (!postgisRegistry.hasLayer(layerSlug)) throw AppError.badRequest(`Unknown layer: ${layerSlug}`);
  const tables = postgisRegistry.getTablesForLayer(layerSlug);
  const json = {
    layer: layerSlug,
    tables,
    spatialReference: { wkid: 4326 },
    description: `Local PostGIS-backed layer (${tables.length} table(s))`,
  };

  await redisCache.setString(cacheKey, JSON.stringify(json), tileCacheTtlSec);
  return { json, cacheHit: false };
}

function normalizeIdentifyHits(apiJson) {
  const arr = Array.isArray(apiJson?.results) ? apiJson.results : [];
  return arr.map((r) => ({
    layerId: r.layerId,
    layerName: r.layerName ?? '',
    displayFieldName: r.displayFieldName ?? '',
    value: r.value != null && r.value !== '' ? String(r.value) : '',
    attributes:
      r.attributes && typeof r.attributes === 'object' && !Array.isArray(r.attributes) ? r.attributes : {},
  }));
}

/** Convert screen-pixel tolerance to metres using the current map frame. */
function toleranceMeters(payload) {
  const tolPx = Number(payload.tolerance);
  const px = Number.isFinite(tolPx) && tolPx > 0 ? tolPx : mapIdentifyTolerancePxSafe;
  const ext = payload.extent4326;
  const width = Number(payload.width);
  const height = Number(payload.height);
  if (!ext || !width || !height || width <= 0 || height <= 0) {
    return px * 5;
  }
  const lat = (Number(ext.ymin) + Number(ext.ymax)) / 2;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const mPerPxX = ((Number(ext.xmax) - Number(ext.xmin)) * mPerDegLon) / width;
  const mPerPxY = ((Number(ext.ymax) - Number(ext.ymin)) * mPerDegLat) / height;
  return Math.max(mPerPxX, mPerPxY) * px;
}

function pickDisplayValue(attrs) {
  if (!attrs || typeof attrs !== 'object') return '';
  const keys = ['name', 'NAME', 'Name', 'stop_name', 'STOP_NAME', 'title', 'TITLE', 'label', 'LABEL', 'id', 'ID'];
  for (const k of keys) {
    const v = attrs[k];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return '';
}

/**
 * Identify SQL.
 *
 * `$4` is the tolerance expressed in degrees and exists purely so the `&&` bounding-box
 * test can hit the GiST index on `geom`. Without it, casting the indexed column with
 * `geom::geography` (and OR-ing two predicates) forces a sequential scan: a single point
 * lookup against `village_boundary` measured 7.3s that way and 10ms with the pre-filter,
 * returning identical rows. The exact predicates still decide what matches — the box only
 * narrows the candidate set, and it is never smaller than the true tolerance in either
 * axis, so it cannot drop a row the exact test would have kept.
 */
function buildIdentifySql(tableName, geometryType) {
  const safeTbl = validateTableName(tableName);
  const point = `ST_SetSRID(ST_MakePoint($1, $2), 4326)`;
  const attrs = `(to_jsonb(t) - 'geom') AS attributes`;
  const bboxPrefilter = `t.geom && ST_Expand(${point}, $4)`;

  if (geometryType === 'point' || geometryType === 'line') {
    return `SELECT ${attrs}, ST_Distance(t.geom::geography, ${point}::geography) AS dist_m
      FROM ${safeTbl} t
      WHERE ${bboxPrefilter}
        AND ST_DWithin(t.geom::geography, ${point}::geography, $3)
      ORDER BY dist_m
      LIMIT 10`;
  }

  return `SELECT ${attrs},
      CASE WHEN ST_Contains(t.geom, ${point}) THEN 0
           ELSE ST_Distance(t.geom::geography, ${point}::geography) END AS dist_m
    FROM ${safeTbl} t
    WHERE ${bboxPrefilter}
      AND (ST_Contains(t.geom, ${point})
           OR ST_DWithin(t.geom::geography, ${point}::geography, $3))
    ORDER BY dist_m
    LIMIT 10`;
}

/**
 * Metres → degrees for the bounding-box pre-filter. Uses the longitude degree length at
 * this latitude, which is the shorter of the two, so the resulting box is generous in
 * latitude rather than tight — a pre-filter must never be smaller than the tolerance.
 */
function toleranceDegrees(toleranceM, lat) {
  const mPerDegLon = 111320 * Math.cos((Number(lat) * Math.PI) / 180);
  const safeMPerDeg = Number.isFinite(mPerDegLon) && mPerDegLon > 1 ? mPerDegLon : 111320;
  return toleranceM / safeMPerDeg;
}

/** PostGIS identify — geometry-aware (points/lines use distance tolerance, polygons use contains + buffer). */
async function identifyAtPoint(slug, payload) {
  if (!postgisRegistry.hasLayer(slug)) throw AppError.badRequest(`Unknown layer: ${slug}`);
  const lng = Number(payload.lng);
  const lat = Number(payload.lat);
  if (Number.isNaN(lng) || Number.isNaN(lat)) throw AppError.badRequest('lng and lat must be numbers');

  const tables = postgisRegistry.getTablesForLayer(slug);
  const pool = getPool();
  if (!pool) throw AppError.serviceUnavailable('Database not configured');

  const toleranceM = toleranceMeters(payload);
  const toleranceDeg = toleranceDegrees(toleranceM, lat);

  // A category can span 20+ tables. Querying them one after another made a single map
  // click cost the sum of every table's latency; they are independent, so run them
  // together in bounded batches (the pool has a finite number of connections, and
  // several categories are identified in parallel by the batch endpoint).
  const hits = [];
  for (let offset = 0; offset < tables.length; offset += IDENTIFY_CONCURRENCY) {
    const batch = tables.slice(offset, offset + IDENTIFY_CONCURRENCY);
    const batchHits = await Promise.all(
      batch.map(async (tbl) => {
        const cfg = layerRegistry.getLayerConfig(tbl);
        const geometryType = cfg?.geometryType || 'polygon';
        const sql = buildIdentifySql(tbl, geometryType);
        try {
          const { rows } = await pool.query(sql, [lng, lat, toleranceM, toleranceDeg]);
          return rows.map((r) => {
            const attrs = r.attributes || {};
            return {
              layerId: tbl,
              layerName: tbl,
              displayFieldName: '',
              value: pickDisplayValue(attrs),
              attributes: attrs,
            };
          });
        } catch (err) {
          console.error('[maps-proxy] identify error:', tbl, err.message);
          return [];
        }
      })
    );
    for (const rows of batchHits) hits.push(...rows);
  }
  return { hits, rawResultCount: hits.length };
}

module.exports = {
  getTilePng,
  getGeoJsonForBBox,
  getLayerServiceInfo,
  parseBBox,
  identifyAtPoint,
};
