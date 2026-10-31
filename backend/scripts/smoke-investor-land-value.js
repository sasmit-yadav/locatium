/**
 * Smoke-test land-value estimates for Haryana districts with loaded circle_rates.
 * Also asserts industry-grade fields: confidence, methods, blend honesty, acquisition stack.
 *
 * Usage: node scripts/smoke-investor-land-value.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getPool } = require('../src/db/pool');
const { estimateLandValue, compsBlendWeight, SECTOR_PROXY_FACTOR } = require('../src/services/land-value.service');
const {
  estimateAcquisitionCosts,
  budgetFitsInr,
  OPPORTUNITY_VERSION,
} = require('../src/services/investor-opportunity.engine');

const KNOWN_GAPS = new Set([]);
const NON_DISTRICT_LABELS = new Set(['Hansi']);
const ALLOWED_METHODS = new Set([
  'comparable_blend',
  'circle_rate_blend',
  'comparable_median',
  'circle_rate',
  'circle_rate_sector_proxy',
  'insufficient_data',
  'unavailable',
  'error',
]);

async function districtCentroids(pool) {
  const r = await pool.query(`
    SELECT
      COALESCE(NULLIF(TRIM(n_d_name), ''), NULLIF(TRIM(dis_abb), '')) AS district,
      ST_Y(ST_PointOnSurface(geom)) AS lat,
      ST_X(ST_PointOnSurface(geom)) AS lng
    FROM district_boundary
    WHERE geom IS NOT NULL
      AND COALESCE(NULLIF(TRIM(n_d_name), ''), NULLIF(TRIM(dis_abb), '')) IS NOT NULL
    ORDER BY 1
  `);
  return r.rows.filter((row) => row.district && Number.isFinite(Number(row.lat)));
}

async function districtsWithCircleRates(pool) {
  const r = await pool.query(`
    SELECT DISTINCT district
    FROM circle_rates
    WHERE source <> 'haryana_seed'
    ORDER BY 1
  `);
  return new Set(r.rows.map((x) => x.district));
}

function assertIndustryRules(result, failures) {
  if (!ALLOWED_METHODS.has(result.method)) {
    failures.push(`unknown method ${result.method}`);
  }
  if (result.method === 'insufficient_data' || result.method === 'error' || result.method === 'unavailable') {
    return;
  }
  if (!result.confidence || result.confidence === 'none') {
    failures.push(`missing confidence for ${result.method}`);
  }
  if (!(result.circleRatePerSqYardInr > 0) && !(result.estimatedPerSqYardInr > 0)) {
    failures.push('no circle or estimate');
  }
  if (result.method === 'circle_rate_blend') {
    const n = result.comparableSampleCount ?? 0;
    if (n >= 3) failures.push(`circle_rate_blend with n=${n} should be comparable_blend`);
    if (result.compsBlendWeight != null && result.compsBlendWeight !== compsBlendWeight(n)) {
      failures.push(`blend weight mismatch n=${n} got=${result.compsBlendWeight}`);
    }
  }
  if (result.method === 'comparable_blend') {
    const n = result.comparableSampleCount ?? 0;
    if (n < 3) failures.push(`comparable_blend with n=${n}`);
    if (result.estimatedLowPerSqYardInr == null || result.estimatedHighPerSqYardInr == null) {
      failures.push('blend missing P10/P90 band');
    }
  }
  if (result.method === 'circle_rate_sector_proxy') {
    if (!result.sectorProxyApplied) failures.push('sector proxy flag missing');
    if (result.confidence !== 'low') failures.push('sector proxy must be low confidence');
    if (result.sectorProxyFactor != null && ![SECTOR_PROXY_FACTOR.commercial, SECTOR_PROXY_FACTOR.residential].includes(result.sectorProxyFactor)) {
      failures.push(`unexpected proxy factor ${result.sectorProxyFactor}`);
    }
  }
  if (result.marketAvailable && result.marketPremiumVsFloor == null && result.roiProxy == null) {
    failures.push('market available but no premium vs floor');
  }
}

function assertAcquisitionUnit() {
  const acq = estimateAcquisitionCosts(100_000_000);
  if (!acq || acq.allInLandCostInr !== 106_000_000) {
    throw new Error('acquisition stack broken');
  }
  if (budgetFitsInr(null, 'low') !== false) {
    throw new Error('budget must fail-closed on null cost');
  }
  if (OPPORTUNITY_VERSION !== 'investor-v3.2') {
    throw new Error(`expected investor-v3.2 got ${OPPORTUNITY_VERSION}`);
  }
}

async function main() {
  const pool = getPool();
  if (!pool) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  assertAcquisitionUnit();

  const loaded = await districtsWithCircleRates(pool);
  const centroids = await districtCentroids(pool);

  const rows = [];
  let pass = 0;
  let fail = 0;
  let knownGap = 0;
  const industryFails = [];

  for (const c of centroids) {
    const district = c.district;
    if (NON_DISTRICT_LABELS.has(district)) continue;
    const hasRates = [...loaded].some((d) => d.toLowerCase() === district.toLowerCase());
    const result = await estimateLandValue(
      { lat: Number(c.lat), lng: Number(c.lng) },
      'industrial'
    );

    const localFails = [];
    assertIndustryRules(result, localFails);
    if (localFails.length) {
      industryFails.push(`${district}: ${localFails.join('; ')}`);
    }

    const ok =
      result.method !== 'insufficient_data' &&
      result.method !== 'error' &&
      result.method !== 'unavailable' &&
      result.circleRatePerSqYardInr != null &&
      result.circleRatePerSqYardInr > 0 &&
      localFails.length === 0;

    let status = 'FAIL';
    if (KNOWN_GAPS.has(district) && !hasRates) {
      status = 'GAP';
      knownGap += 1;
    } else if (ok) {
      status = 'PASS';
      pass += 1;
    } else if (!hasRates) {
      status = 'GAP';
      knownGap += 1;
    } else {
      fail += 1;
    }

    rows.push({
      status,
      district,
      method: result.method,
      circle: result.circleRatePerSqYardInr,
      comps: result.comparableSampleCount ?? result.comparableCount ?? 0,
      estimate: result.estimatedPerSqYardInr,
      low: result.estimatedLowPerSqYardInr,
      high: result.estimatedHighPerSqYardInr,
      confidence: result.confidence,
      vintage: result.circleRateEffectiveFrom,
    });
  }

  console.table(rows);
  console.log(`PASS=${pass} FAIL=${fail} KNOWN_GAP=${knownGap} (loaded circle districts=${loaded.size})`);
  if (industryFails.length) {
    console.error('Industry rule failures:');
    industryFails.forEach((f) => console.error(`  - ${f}`));
  }

  await pool.end();
  if (fail > 0 || industryFails.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
