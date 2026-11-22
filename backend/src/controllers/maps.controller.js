const mapsProxy = require('../services/maps-proxy.service');
const { checkDatabase } = require('../db/pool');
const { listLayerKeys } = require('../config/postgis-registry');
const { tileCacheTtlSec } = require('../config');
const { AppError } = require('../middleware/error.middleware');

/** 1×1 transparent PNG — returned when upstream is slow/unavailable so the map does not hang. */
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function getTile(req, res) {
  const { layer, z, x, y } = req.params;
  const wantsVectorTile = /\.pbf$/i.test(String(y));
  const yClean = String(y).replace(/\.(png|pbf)$/i, '');

  try {
    const { buffer, cacheHit, cacheLayer, contentType } = await mapsProxy.getTilePng(layer, z, x, yClean);

    res.set({
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': `public, max-age=${tileCacheTtlSec}`,
      'X-LOCATIUM-Tile-Cache': cacheHit ? `HIT-${cacheLayer || 'unknown'}` : 'MISS',
    });
    res.send(buffer);
  } catch (err) {
    const isTransient =
      err instanceof AppError &&
      (err.statusCode === 503 || err.message.includes('timed out') || err.message.includes('Too many'));

    if (isTransient && !wantsVectorTile) {
      res.set({
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=30',
        'X-LOCATIUM-Tile-Cache': 'FALLBACK',
      });
      res.send(TRANSPARENT_PNG);
      return;
    }
    if (isTransient) {
      res.status(503).json({
        error: 'tile_temporarily_unavailable',
        message: 'Vector tile generation is temporarily unavailable',
      });
      return;
    }
    throw err;
  }
}

async function getMapGeoJson(req, res) {
  const { layerKey } = req.params;
  const bbox = req.query.bbox;
  const { json, cacheHit } = await mapsProxy.getGeoJsonForBBox(layerKey, bbox);

  res.set('X-LOCATIUM-Geo-Cache', cacheHit ? 'HIT' : 'MISS');
  res.json(json);
}

async function getLayerInfo(req, res) {
  const { layerKey } = req.params;
  const { json, cacheHit } = await mapsProxy.getLayerServiceInfo(layerKey);

  res.set('X-LOCATIUM-Info-Cache', cacheHit ? 'HIT' : 'MISS');
  res.json(json);
}

async function getMapsStatus(_req, res) {
  const db = await checkDatabase();
  if (!db.ok) {
    res.json({ ok: false, db: db });
    return;
  }
  res.json({ ok: true, db: { ok: true } });
}

async function listLayers(_req, res) {
  res.json({
    layers: listLayerKeys(),
    endpoints: {
        tile: '/api/tiles/:layer/:z/:x/:y.pbf',
        geojson: '/api/maps/:layerKey?bbox=minLon,minLat,maxLon,maxLat',
      info: '/api/maps/:layerKey/info',
      metadata: '/api/tiles/:layer/metadata.json',
      identify: 'POST /api/maps/identify',
      geocode: 'GET /api/geocode/search?q=…',
    },
  });
}

/** Batch identify across visible operational layers (body.layerKeys + map frame). */
async function identifyBatch(req, res) {
  const allowed = new Set(listLayerKeys());
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const layerKeys = Array.isArray(body.layerKeys)
    ? body.layerKeys.filter((k) => typeof k === 'string' && allowed.has(k))
    : [];

  if (layerKeys.length === 0) {
    res.status(400).json({
      error: 'invalid_layer_keys',
      message: 'body.layerKeys must be a non-empty array of registered operational layer slugs',
    });
    return;
  }

  const payload = {
    lng: body.lng,
    lat: body.lat,
    extent4326: body.extent4326,
    width: body.width,
    height: body.height,
    dpi: body.dpi,
    tolerance: body.tolerance,
    excludeTables: Array.isArray(body.excludeTables)
      ? body.excludeTables.filter((t) => typeof t === 'string').slice(0, 100)
      : [],
  };

  const layers = await Promise.all(
    layerKeys.map(async (layerKey) => {
      try {
        const { hits, rawResultCount } = await mapsProxy.identifyAtPoint(layerKey, payload);
        return { layerKey, ok: true, hits, rawResultCount };
      } catch (err) {
        const msg = err?.message || 'Identify failed';
        return { layerKey, ok: false, error: msg, hits: [], rawResultCount: 0 };
      }
    })
  );

  res.json({
    lng: Number(body.lng),
    lat: Number(body.lat),
    layers,
  });
}

async function getTileMetadata(req, res) {
  const { layer } = req.params;
  const { json, cacheHit } = await mapsProxy.getLayerServiceInfo(layer);
  const slim = {
    spatialReference: json.spatialReference || { wkid: 4326 },
    fullExtent: json.fullExtent,
    layers: Array.isArray(json.layers) ? json.layers.map((l) => ({ id: l.id, name: l.name })) : [],
  };

  res.set('X-LOCATIUM-Info-Cache', cacheHit ? 'HIT' : 'MISS');
  res.json(slim);
}

module.exports = {
  getTile,
  getMapGeoJson,
  getLayerInfo,
  listLayers,
  getTileMetadata,
  identifyBatch,
  getMapsStatus,
};
