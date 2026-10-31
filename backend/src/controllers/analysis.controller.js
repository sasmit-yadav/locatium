const { AppError } = require('../middleware/error.middleware');
const scoringOrchestrator = require('../services/scoringOrchestrator');
const landForecast = require('../services/land-forecast.service');
const facilityGap = require('../services/facility-gap.service');
const { buildPlotSummary } = require('../services/plot-summary.service');
const { renderPlotReport } = require('../services/plot-report.service');
const { calculateAcquisitionCost } = require('../services/acquisition-cost.service');

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

const SECTORS = new Set(['industrial', 'residential', 'commercial', 'agricultural']);

function plotParams(q) {
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw AppError.badRequest('lat and lng are required');
  return {
    lat,
    lng,
    sector: SECTORS.has(q.sector) ? q.sector : 'industrial',
    lang: q.lang === 'hi' ? 'hi' : 'en',
    area: Number(q.area) > 0 ? Number(q.area) : null,
    buyer: ['man', 'woman', 'joint'].includes(q.buyer) ? q.buyer : 'man',
    areaType: q.areaType === 'rural' ? 'rural' : 'urban',
    place: typeof q.place === 'string' ? q.place.slice(0, 120) : null,
  };
}

/** Plain-language, bilingual summary of a point: the "Check my plot" card. */
async function plotSummary(req, res) {
  const p = plotParams(req.query);
  const result = await scoringOrchestrator.scoreLocation({ lat: p.lat, lng: p.lng, sector: p.sector }, { requestId: req.requestId });
  res.json(buildPlotSummary(result, { lang: p.lang }));
}

/** The same summary as a one-page PDF, optionally with a cost estimate for `area` sq yd. */
async function plotReport(req, res) {
  const p = plotParams(req.query);
  const result = await scoringOrchestrator.scoreLocation({ lat: p.lat, lng: p.lng, sector: p.sector }, { requestId: req.requestId });
  const summary = buildPlotSummary(result, { lang: p.lang });
  const price = summary.land.estimatePerSqYd || summary.land.circleRatePerSqYd;
  const cost =
    p.area && price
      ? calculateAcquisitionCost({
          area: p.area,
          pricePerSqYd: price,
          circleRatePerSqYd: summary.land.circleRatePerSqYd,
          buyer: p.buyer,
          areaType: p.areaType,
          withLoan: true,
        })
      : null;
  const buffer = await renderPlotReport(summary, { cost, place: p.place });
  const name = `locatium-plot-check-${p.lang}-${p.lat.toFixed(4)}_${p.lng.toFixed(4)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

module.exports = {
  plotSummary,
  plotReport,
  scoreLocation,
  scoreBatch,
  forecast,
  getFacilityGap,
};
