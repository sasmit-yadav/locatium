/**
 * Official collector-rate trend -> forward land-price outlook.
 *
 * FORWARD_roadmap Week 15 asked for a future-year land-price series. We do not have the
 * transaction depth a CatBoost quantile model needs, but Haryana republishes collector
 * (circle) rates on a known schedule and `circle_rates` carries every vintage we imported.
 * The revision-to-revision change in the *official floor* for a district and sector is a
 * real, citable series, so the outlook below compounds that observed trend -- it is never
 * a model output, and it always ships the vintages it was derived from.
 *
 * Fewer than two vintages returns `method: 'insufficient_history'` rather than a guessed
 * growth rate. A single data point is not a trend.
 */

const { getPool } = require('../db/pool');
const { expandDistrictNames } = require('./land-value.service');

const MIN_VINTAGES = 2;
/**
 * A vintage backed by a handful of rows is not a district median, it is noise. Fatehabad
 * industrial, for example, has two rate rows in 2023 and two in 2025; treating that jump as
 * a trend produced a 160%/yr "growth rate". Require real coverage before compounding.
 */
const MIN_SAMPLES_PER_VINTAGE = 20;
/**
 * Consecutive vintages must also be measuring comparable populations. When one import
 * covers 2 rows and the next covers 5,000, the difference is an import artifact, not a
 * published revision.
 */
const MAX_SAMPLE_RATIO = 5;
const DEFAULT_HORIZONS = [1, 3, 5];
const MAX_HORIZON_YEARS = 10;
/** Official revisions moving faster than this are a rebasing, not a trend worth compounding. */
const CAGR_CLAMP = 0.35;
const CACHE_TTL_MS = 60 * 60 * 1000;
const trendCache = new Map();

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function yearsBetween(fromIso, toIso) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  return (to - from) / (365.25 * 24 * 3600 * 1000);
}

function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Median official rate per vintage for a district + sector.
 * Median rather than mean: a district's rate table mixes village and prime urban parcels,
 * and a handful of urban rows would otherwise drag the whole series upward.
 */
async function fetchVintageSeries(pool, districtNames, sector) {
  const { rows } = await pool.query(
    `SELECT effective_from,
            COUNT(*)::int AS sample_count,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rate_per_sq_yard_inr)::numeric AS median_rate
       FROM circle_rates
      WHERE sector_type = $2
        AND rate_per_sq_yard_inr > 0
        AND ($1::text[] IS NULL
             OR cardinality($1::text[]) = 0
             OR LOWER(TRIM(district)) = ANY (SELECT LOWER(TRIM(x)) FROM unnest($1::text[]) AS x))
      GROUP BY effective_from
      ORDER BY effective_from`,
    [districtNames && districtNames.length ? districtNames : null, sector]
  );

  return rows
    .map((r) => ({
      effectiveFrom: isoDate(r.effective_from),
      medianRateInr: Math.round(Number(r.median_rate)),
      sampleCount: r.sample_count,
    }))
    .filter((r) => Number.isFinite(r.medianRateInr) && r.medianRateInr > 0);
}

/** Vintages with enough rows behind them to call the median representative. */
function usableVintages(series) {
  return series.filter((v) => v.sampleCount >= MIN_SAMPLES_PER_VINTAGE);
}

/**
 * Compound annual growth across consecutive vintages.
 * Each step is annualised on its own so an uneven publication schedule (2023 -> 2025 -> 2026)
 * does not let the longer gap dominate; the median of those steps is the headline rate.
 */
function annualisedSteps(series) {
  const steps = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1];
    const curr = series[i];
    const years = yearsBetween(prev.effectiveFrom, curr.effectiveFrom);
    if (!years || years < 0.25) continue;
    const ratio = curr.medianRateInr / prev.medianRateInr;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    const coverage = Math.max(prev.sampleCount, curr.sampleCount) / Math.max(1, Math.min(prev.sampleCount, curr.sampleCount));
    if (coverage > MAX_SAMPLE_RATIO) continue;
    steps.push({
      from: prev.effectiveFrom,
      to: curr.effectiveFrom,
      years: Number(years.toFixed(2)),
      changePct: Number(((ratio - 1) * 100).toFixed(1)),
      annualisedPct: Number(((ratio ** (1 / years) - 1) * 100).toFixed(1)),
    });
  }
  return steps;
}

function confidenceFor(steps) {
  if (steps.length >= 3) return 'medium';
  if (steps.length === 2) return 'low';
  // One observed revision is a single data point extrapolated forward.
  return 'very_low';
}

/**
 * Never project further than the evidence supports. A single observed revision says
 * something about next year and nothing credible about five: compounding it out that far
 * turns one data point into a 4x claim, which no caveat text makes honest.
 */
function maxHorizonFor(steps) {
  if (steps.length >= 3) return 5;
  if (steps.length === 2) return 3;
  return 1;
}

/**
 * Forward outlook for a district + sector.
 *
 * @returns {Promise<object>} `method` is `official_rate_trend` or `insufficient_history`.
 *   Callers must surface the method and note, never the numbers alone.
 */
async function getLandOutlook({ district, sector = 'industrial', basePriceInr, horizons } = {}) {
  const pool = getPool();
  const normalizedSector = String(sector || 'industrial').trim().toLowerCase() || 'industrial';
  const requested = Array.isArray(horizons) && horizons.length ? horizons : DEFAULT_HORIZONS;
  const years = [
    ...new Set(
      requested
        .map(Number)
        .filter((y) => Number.isFinite(y) && y > 0 && y <= MAX_HORIZON_YEARS)
        .map((y) => Math.round(y))
    ),
  ].sort((a, b) => a - b);

  const base = {
    method: 'insufficient_history',
    sector: normalizedSector,
    district: district || null,
    unit: 'INR_per_sq_yard',
    basis: 'official collector-rate revisions',
    horizons: [],
    vintages: [],
    steps: [],
    confidence: 'none',
  };

  if (!pool) return { ...base, reason: 'database_not_configured' };
  if (!years.length) return { ...base, reason: 'no_valid_horizon' };

  const districtNames = district ? expandDistrictNames(district) : [];
  const cacheKey = `${(districtNames[0] || district || 'ALL').toLowerCase()}|${normalizedSector}`;

  let series;
  const cached = trendCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    series = cached.series;
  } else {
    try {
      series = await fetchVintageSeries(pool, districtNames, normalizedSector);
    } catch (err) {
      return { ...base, reason: 'query_failed', note: err.message };
    }
    trendCache.set(cacheKey, { at: Date.now(), series });
  }

  // One imported vintage tells us today's floor and nothing at all about direction.
  const usable = usableVintages(series);
  if (usable.length < MIN_VINTAGES) {
    return {
      ...base,
      vintages: series,
      reason: series.length < MIN_VINTAGES
        ? (series.length ? 'single_vintage' : 'no_rates_for_district')
        : 'thin_vintage_coverage',
      note:
        usable.length < series.length
          ? `Collector-rate history for this district and sector is too thin to read a trend (needs ${MIN_SAMPLES_PER_VINTAGE}+ rates per vintage). No future price is projected.`
          : 'Fewer than two collector-rate vintages are loaded for this district and sector, so no rate of change can be observed. No future price is projected.',
    };
  }

  const steps = annualisedSteps(usable);
  if (!steps.length) {
    return {
      ...base,
      vintages: series,
      reason: 'no_comparable_interval',
      note:
        'Consecutive collector-rate vintages cover very different numbers of parcels, so the change between them reflects import coverage rather than a published revision. No future price is projected.',
    };
  }

  const rawCagr = median(steps.map((s) => s.annualisedPct)) / 100;
  const cagr = Math.max(-CAGR_CLAMP, Math.min(CAGR_CLAMP, rawCagr));
  const clamped = Math.abs(rawCagr - cagr) > 1e-9;

  const latest = usable[usable.length - 1];
  const anchor =
    Number.isFinite(Number(basePriceInr)) && Number(basePriceInr) > 0
      ? Math.round(Number(basePriceInr))
      : latest.medianRateInr;

  // The band widens with the horizon because a two- or three-point series cannot pin a
  // long-run rate: half the observed CAGR either side, growing with the square root of time.
  const spread = Math.max(0.04, Math.abs(cagr) * 0.5);

  const horizonCap = maxHorizonFor(steps);
  const supported = years.filter((y) => y <= horizonCap);
  const droppedHorizons = years.filter((y) => y > horizonCap);

  const projected = supported.map((y) => {
    const mid = anchor * (1 + cagr) ** y;
    const band = spread * Math.sqrt(y);
    return {
      years: y,
      year: new Date().getFullYear() + y,
      p50: Math.round(mid),
      p10: Math.round(mid * (1 - band)),
      p90: Math.round(mid * (1 + band)),
    };
  });

  return {
    method: 'official_rate_trend',
    sector: normalizedSector,
    district: district || null,
    unit: 'INR_per_sq_yard',
    basis: 'official collector-rate revisions',
    anchorPriceInr: anchor,
    anchorSource: anchor === latest.medianRateInr ? 'latest_official_median' : 'site_estimate',
    cagrPct: Number((cagr * 100).toFixed(1)),
    cagrClamped: clamped,
    confidence: confidenceFor(steps),
    vintages: usable,
    steps,
    horizons: projected,
    maxSupportedYears: horizonCap,
    droppedHorizons,
    note:
      `Projected by compounding the observed change in official collector rates (${usable.length} vintages, ` +
      `${usable[0].effectiveFrom} to ${latest.effectiveFrom}, ${steps.length} measurable revision${steps.length === 1 ? '' : 's'}). ` +
      `Capped at ${horizonCap} year${horizonCap === 1 ? '' : 's'} because that is as far as this much history supports` +
      (droppedHorizons.length ? ` (dropped ${droppedHorizons.join(', ')}-year)` : '') +
      '. This extrapolates the government floor, not the market: it is not a trained price model, and market ' +
      'prices can move independently of the official rate.',
  };
}

module.exports = { getLandOutlook, annualisedSteps, fetchVintageSeries, usableVintages, maxHorizonFor };
