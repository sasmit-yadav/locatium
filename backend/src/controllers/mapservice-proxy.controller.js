const { AppError } = require('../middleware/error.middleware');

function parseMapServicePath(path) {
  const clean = path.split('?')[0];
  const match = clean.match(/^\/([^/]+)(\/.*)?$/);
  if (!match) return null;
  return { layerKey: match[1], suffix: match[2] || '' };
}

/**
 * Reverse-proxy ArcGIS MapServer REST for MapImageLayer (one dynamic image per view, not per-tile export).
 */
async function proxyMapService(req, res) {
  // The ArcGIS MapService proxy has been removed in the local PostGIS migration.
  // This endpoint is retained for compatibility but no longer forwards to external MapServer.
  res.status(410).json({ ok: false, message: 'MapService proxy removed. Use local PostGIS-backed endpoints instead.' });
}

module.exports = { proxyMapService };
