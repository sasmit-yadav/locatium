/**
 * Land-price "forecast" — honest current-band, not a fabricated CatBoost time series.
 *
 * FORWARD_roadmap Week 15 asked for quantile land-price modelling. We already have a
 * collector-rate + comps blend with p10/p50/p90-style lows and highs. This wrapper
 * exposes that band as GET /api/analysis/forecast so the UI can label method, range,
 * and insufficient_data instead of inventing future prices.
 *
 * `?horizon=` additionally attaches an `outlook` block from land-trend.service: a forward
 * projection of the *observed* collector-rate revisions for the district. It is compounded
 * from published vintages, carries its own method/confidence, and is absent when the
 * district has too little rate history to show a direction.
 */

const landValue = require('./land-value.service');
const landTrend = require('./land-trend.service');
const { AppError } = require('../middleware/error.middleware');
const { getPool } = require('../db/pool');

function forecastFromEstimate(estimate, meta = {}) {
  const base = {
    horizon: 'current_band',
    unit: 'INR_per_sq_yard',
    model: 'circle_rate_comps_band',
    lat: meta.lat ?? null,
    lng: meta.lng ?? null,
    sector: meta.sector || estimate?.sector || 'industrial',
    zoneId: meta.zoneId || null,
    zoneName: meta.zoneName || null,
  };

  if (!estimate || estimate.method === 'unavailable') {
    return {
      ...base,
      method: 'unavailable',
      reason: estimate?.reason || 'unavailable',
      p10: null,
      p50: null,
      p90: null,
      confidence: 'none',
      note: 'Land-value service is not configured.',
    };
  }

  if (estimate.method === 'error') {
    return {
      ...base,
      method: 'error',
      reason: estimate.reason,
      p10: null,
      p50: null,
      p90: null,
      confidence: 'none',
      note: 'Could not estimate land value for this location.',
    };
  }

  const p50 = estimate.estimatedPerSqYardInr ?? null;
  if (p50 == null || estimate.method === 'insufficient_data') {
    return {
      ...base,
      method: 'insufficient_data',
      reason: estimate.reason || 'no_rate',
      p10: null,
      p50: null,
      p90: null,
      confidence: estimate.confidence || 'none',
      district: estimate.district || null,
      note:
        estimate.note ||
        'Not enough official collector-rate or nearby market comps to form a price band. No future-year price is invented.',
      landValue: estimate,
    };
  }

  const p10 = estimate.estimatedLowPerSqYardInr ?? p50;
  const p90 = estimate.estimatedHighPerSqYardInr ?? p50;

  return {
    ...base,
    method: estimate.method,
    p10,
    p50,
    p90,
    confidence: estimate.confidence,
    district: estimate.district || null,
    marketAvailable: Boolean(estimate.marketAvailable),
    circleRatePerSqYardInr: estimate.circleRatePerSqYardInr ?? null,
    circleRateEffectiveFrom: estimate.circleRateEffectiveFrom || null,
    note:
      (estimate.note ? `${estimate.note} ` : '') +
      'This is the current collector-rate + comps band. Forward figures, where shown, extrapolate ' +
      'published collector-rate revisions rather than modelling the market.',
    landValue: estimate,
  };
}

/**
 * Attach the forward outlook, anchored on this site's own estimated price so the projection
 * starts where the band ends rather than at the district-wide official median.
 */
async function withOutlook(forecast, { horizons } = {}) {
  if (!horizons) return forecast;
  try {
    const outlook = await landTrend.getLandOutlook({
      district: forecast.district || forecast.landValue?.district || null,
      sector: forecast.sector,
      basePriceInr: forecast.p50 ?? null,
      horizons,
    });
    return { ...forecast, outlook };
  } catch (err) {
    // A missing outlook must never cost the caller the current band it asked for.
    return { ...forecast, outlook: { method: 'unavailable', reason: err.message } };
  }
}

async function resolveZonePoint(zoneId) {
  const pool = getPool();
  if (!pool) throw AppError.serviceUnavailable('Database is not configured');
  const investorOpportunities = require('./investor-opportunities.service');
  const analysis = await investorOpportunities.getZoneAnalysis(zoneId, {
    includeGeometry: 'false',
    sector: 'industrial',
  });
  return {
    lat: analysis.zone?.center?.lat,
    lng: analysis.zone?.center?.lng,
    sector: analysis.sector || 'industrial',
    zoneId: analysis.zone?.id || zoneId,
    zoneName: analysis.zone?.name || null,
    landValue: analysis.landValue || analysis.analysis?.landValue,
  };
}

async function getForecast({ lat, lng, sector = 'industrial', zoneId, horizons } = {}) {
  const normalizedSector = String(sector || 'industrial').trim().toLowerCase() || 'industrial';

  if (zoneId) {
    const zone = await resolveZonePoint(zoneId);
    if (zone.landValue && zone.landValue.estimatedPerSqYardInr != null) {
      return withOutlook(
        forecastFromEstimate(zone.landValue, {
        lat: zone.lat,
        lng: zone.lng,
          sector: zone.sector || normalizedSector,
          zoneId: zone.zoneId,
          zoneName: zone.zoneName,
        }),
        { horizons }
      );
    }
    if (zone.lat == null || zone.lng == null) {
      throw AppError.badRequest('Zone has no usable coordinates for a land-price band');
    }
    const estimate = await landValue.estimateLandValue(
      { lat: zone.lat, lng: zone.lng },
      zone.sector || normalizedSector
    );
    return withOutlook(
      forecastFromEstimate(estimate, {
        lat: zone.lat,
        lng: zone.lng,
        sector: zone.sector || normalizedSector,
        zoneId: zone.zoneId,
        zoneName: zone.zoneName,
      }),
      { horizons }
    );
  }

  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    throw AppError.badRequest('lat and lng, or zoneId, are required');
  }

  const estimate = await landValue.estimateLandValue({ lat: latN, lng: lngN }, normalizedSector);
  return withOutlook(
    forecastFromEstimate(estimate, { lat: latN, lng: lngN, sector: normalizedSector }),
    { horizons }
  );
}

module.exports = { forecastFromEstimate, getForecast, withOutlook };
