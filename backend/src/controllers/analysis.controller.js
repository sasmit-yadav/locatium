const { AppError } = require('../middleware/error.middleware');
const scoringOrchestrator = require('../services/scoringOrchestrator');
const landForecast = require('../services/land-forecast.service');
const facilityGap = require('../services/facility-gap.service');

async function scoreLocation(req, res) {
  const result = await scoringOrchestrator.scoreLocation(req.body || {}, {
    requestId: req.requestId,
  });
  res.json(result);
}

/**
 * Public batch cap. Internal callers (district scans) use the service directly and are
 * bounded by the heavy-work guard instead, so this limit applies to HTTP callers only.
 */
const PUBLIC_BATCH_MAX = Math.min(100, Math.max(1, Number(process.env.SCORE_BATCH_MAX) || 25));

async function scoreBatch(req, res) {
  const locations = req.body?.locations;
  if (Array.isArray(locations) && locations.length > PUBLIC_BATCH_MAX) {
    throw AppError.badRequest(`score-batch supports up to ${PUBLIC_BATCH_MAX} locations`);
  }
  const result = await scoringOrchestrator.scoreBatch(req.body || {}, {
    requestId: req.requestId,
  });
  res.json(result);
}

/**
 * `?horizon=1,3,5` (or `horizon=5`) adds the forward `outlook` block. Omitting it keeps the
 * response to the current band, so existing callers are unaffected.
 */
function parseHorizons(raw) {
  if (raw == null || raw === '') return null;
  const values = (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((v) => Number(String(v).trim()))
    .filter((v) => Number.isFinite(v) && v > 0);
  return values.length ? values : null;
}

async function forecast(req, res) {
  const result = await landForecast.getForecast({
    lat: req.query.lat ?? req.body?.lat,
    lng: req.query.lng ?? req.body?.lng,
    sector: req.query.sector || req.body?.sector || 'industrial',
    zoneId: req.query.zoneId || req.body?.zoneId,
    horizons: parseHorizons(req.query.horizon ?? req.body?.horizon),
  });
  res.json(result);
}

async function getFacilityGap(req, res) {
  const result = await facilityGap.getFacilityGap({
    district: req.query.district,
    limit: req.query.limit,
  });
  res.json(result);
}

module.exports = {
  scoreLocation,
  scoreBatch,
  forecast,
  getFacilityGap,
};
