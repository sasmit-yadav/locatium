const { getPool } = require('../db/pool');

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function estimateLandValue(location, sector = 'industrial') {
  const pool = getPool();
  if (!pool) {
    return { method: 'unavailable', reason: 'database_not_configured' };
  }

  const normalizedSector = (sector || 'industrial').trim().toLowerCase();
  const radiusDeg = 10000 / 111320.0;

  try {
    const districtRow = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(n_d_name), ''), NULLIF(TRIM(dis_abb), ''), 'Gurugram') AS district
       FROM district_boundary
       WHERE geom IS NOT NULL
       ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
       LIMIT 1`,
      [location.lng, location.lat]
    );
    const district = districtRow.rows[0]?.district || 'Gurugram';

    const circleRateRow = await pool.query(
      `SELECT rate_per_sq_yard_inr FROM circle_rates
       WHERE sector_type = $2
         AND (LOWER(district) = LOWER($1)
              OR LOWER(district) LIKE LOWER($1) || '%'
              OR LOWER($1) LIKE LOWER(district) || '%')
       ORDER BY effective_from DESC LIMIT 1`,
      [district, normalizedSector]
    );

    if (!circleRateRow.rows.length) {
      const fallbackRate = await pool.query(
        `SELECT rate_per_sq_yard_inr, district FROM circle_rates
         WHERE sector_type = $1 ORDER BY rate_per_sq_yard_inr DESC LIMIT 1`,
        [normalizedSector]
      );
      if (fallbackRate.rows.length) {
        circleRateRow.rows = fallbackRate.rows;
      }
    }

    const comparables = await pool.query(
      `SELECT price_per_sq_yard_inr,
              ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000.0 AS distance_km
       FROM land_transactions
       WHERE geom IS NOT NULL
         AND sector_type = $3
         AND geom && ST_Expand(ST_SetSRID(ST_MakePoint($1, $2), 4326), $4)
         AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326), $4)
       ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
       LIMIT 25`,
      [location.lng, location.lat, normalizedSector, radiusDeg]
    );

    const prices = comparables.rows.map((r) => Number(r.price_per_sq_yard_inr));
    const comparableMedian = median(prices);
    const circleRate = circleRateRow.rows[0]
      ? Number(circleRateRow.rows[0].rate_per_sq_yard_inr)
      : null;

    let estimatedPerSqYard = null;
    let method = 'insufficient_data';
    if (comparableMedian && circleRate) {
      estimatedPerSqYard = Math.round(comparableMedian * 0.6 + circleRate * 0.4);
      method = prices.length >= 5 ? 'comparable_blend' : 'circle_rate_blend';
    } else if (comparableMedian) {
      estimatedPerSqYard = Math.round(comparableMedian);
      method = 'comparable_median';
    } else if (circleRate) {
      estimatedPerSqYard = Math.round(circleRate);
      method = 'circle_rate';
    } else if (prices.length === 0) {
      const anyRate = await pool.query(
        `SELECT rate_per_sq_yard_inr FROM circle_rates WHERE sector_type = $1 LIMIT 1`,
        [normalizedSector]
      );
      if (anyRate.rows[0]) {
        estimatedPerSqYard = Math.round(Number(anyRate.rows[0].rate_per_sq_yard_inr));
        method = 'circle_rate_fallback';
      }
    }

    const roiProxy =
      estimatedPerSqYard && circleRate
        ? Number(((estimatedPerSqYard - circleRate) / circleRate).toFixed(3))
        : null;

    return {
      method,
      district,
      sector: normalizedSector,
      circleRatePerSqYardInr: circleRate,
      comparableCount: prices.length,
      comparableMedianPerSqYardInr: comparableMedian ? Math.round(comparableMedian) : null,
      estimatedPerSqYardInr: estimatedPerSqYard,
      roiProxy,
      note:
        prices.length >= 5
          ? 'Blend of nearby transaction median (60%) and circle rate (40%)'
          : 'Limited comparables — circle rate weighted higher',
    };
  } catch (err) {
    return { method: 'error', reason: err.message };
  }
}

module.exports = { estimateLandValue };
