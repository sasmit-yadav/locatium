const { getPool } = require('../db/pool');

/** Official / historical name variants used across boundary tables and DC notifications. */
const DISTRICT_ALIASES = {
  gurugram: ['Gurugram', 'Gurgaon'],
  gurgaon: ['Gurugram', 'Gurgaon'],
  faridabad: ['Faridabad'],
  hisar: ['Hisar', 'HISAR'],
  nuh: ['Nuh', 'Mewat'],
  mewat: ['Nuh', 'Mewat'],
  mahendragarh: ['Mahendragarh', 'Mahendergarh'],
  mahendergarh: ['Mahendragarh', 'Mahendergarh'],
};

const COMPS_RADIUS_M = 10000;
const COMPS_MONTHS = 36;
const COMPS_LIMIT = 25;

/** When industrial collector rates missing, apply haircut to alt-sector medians. */
const SECTOR_PROXY_FACTOR = {
  commercial: 0.85,
  residential: 0.7,
};

function expandDistrictNames(district) {
  const raw = String(district || '').trim();
  if (!raw) return [];
  const aliases = DISTRICT_ALIASES[raw.toLowerCase()];
  if (aliases) return [...new Set(aliases)];
  return [raw];
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, p) {
  const nums = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  if (nums.length === 1) return nums[0];
  const idx = (nums.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return nums[lo];
  return nums[lo] + (nums[hi] - nums[lo]) * (idx - lo);
}

/** Trim IQR outliers when enough samples (n ≥ 8). */
function trimIqr(values) {
  const nums = values.filter((n) => Number.isFinite(n));
  if (nums.length < 8) return nums;
  const sorted = [...nums].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  if (!(iqr > 0)) return nums;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const trimmed = nums.filter((n) => n >= lo && n <= hi);
  return trimmed.length >= 3 ? trimmed : nums;
}

/** Row-aware IQR trim (avoids duplicate-price Set bugs). */
function trimIqrRows(rows, priceKey = 'price') {
  if (!rows.length || rows.length < 8) return rows;
  const prices = rows.map((r) => Number(r[priceKey])).filter((n) => Number.isFinite(n));
  if (prices.length < 8) return rows;
  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  if (!(iqr > 0)) return rows;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const filtered = rows.filter((r) => {
    const n = Number(r[priceKey]);
    return Number.isFinite(n) && n >= lo && n <= hi;
  });
  return filtered.length >= 3 ? filtered : rows;
}

/** Inverse-distance weighted mean; falls back to median if distances missing. */
function distanceWeightedMean(rows) {
  const usable = rows.filter((r) => Number.isFinite(r.price) && Number.isFinite(r.distanceKm));
  if (!usable.length) return null;
  let wSum = 0;
  let pSum = 0;
  for (const r of usable) {
    const w = 1 / (1 + Math.max(0, r.distanceKm));
    wSum += w;
    pSum += w * r.price;
  }
  return wSum > 0 ? pSum / wSum : median(usable.map((r) => r.price));
}

function formatDateOnly(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    const m = v.match(/\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];
  }
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  // Prefer calendar date in local TZ — pg DATE often arrives as local midnight.
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Market weight grows with sample size: n=1 → 0.25, n=2 → 0.4, n≥3 → 0.6. */
function compsBlendWeight(compsCount) {
  if (compsCount >= 3) return 0.6;
  if (compsCount === 2) return 0.4;
  if (compsCount === 1) return 0.25;
  return 0;
}

function confidenceFrom({
  circleCount,
  compsCount,
  method,
  tehsilMatched,
  vintageLagYears,
  sectorProxy,
}) {
  if (method === 'insufficient_data' || method === 'unavailable' || method === 'error') {
    return 'none';
  }
  if (sectorProxy || (vintageLagYears != null && vintageLagYears >= 1.5)) {
    return 'low';
  }
  if (method === 'comparable_blend' && compsCount >= 5 && circleCount >= 20 && tehsilMatched) {
    return 'high';
  }
  if (method === 'comparable_blend' && compsCount >= 5 && circleCount >= 20) {
    return 'high';
  }
  if (
    (method === 'comparable_blend' || method === 'circle_rate_blend') &&
    compsCount >= 3 &&
    circleCount >= 5
  ) {
    return 'medium';
  }
  if (method === 'circle_rate' && (tehsilMatched || circleCount >= 10)) {
    return 'medium';
  }
  if (method === 'circle_rate' || method === 'circle_rate_sector_proxy' || method === 'comparable_median') {
    return 'low';
  }
  return 'low';
}

async function fetchLatestCircleRows(pool, districtNames, sector) {
  const vintage = await pool.query(
    `SELECT MAX(effective_from) AS max_from
     FROM circle_rates
     WHERE sector_type = $2
       AND LOWER(TRIM(district)) = ANY (SELECT LOWER(TRIM(x)) FROM unnest($1::text[]) AS x)
       AND source <> 'haryana_seed'`,
    [districtNames, sector]
  );
  const maxFrom = vintage.rows[0]?.max_from;
  if (!maxFrom) return { rows: [], effectiveFrom: null };

  const res = await pool.query(
    `SELECT rate_per_sq_yard_inr, tehsil, village, source, effective_from
     FROM circle_rates
     WHERE sector_type = $2
       AND LOWER(TRIM(district)) = ANY (SELECT LOWER(TRIM(x)) FROM unnest($1::text[]) AS x)
       AND source <> 'haryana_seed'
       AND effective_from = $3
     ORDER BY rate_per_sq_yard_inr`,
    [districtNames, sector, maxFrom]
  );
  return { rows: res.rows, effectiveFrom: maxFrom };
}

/** Latest vintage for one tehsil when it is missing from the district-wide max vintage. */
async function fetchTehsilLatestCircleRows(pool, districtNames, sector, tehsilName) {
  const needle = String(tehsilName || '')
    .toLowerCase()
    .replace(/\s+/g, '');
  if (!needle) return { rows: [], effectiveFrom: null };

  const vintage = await pool.query(
    `SELECT MAX(effective_from) AS max_from
     FROM circle_rates
     WHERE sector_type = $2
       AND source <> 'haryana_seed'
       AND LOWER(TRIM(district)) = ANY (SELECT LOWER(TRIM(x)) FROM unnest($1::text[]) AS x)
       AND REPLACE(LOWER(TRIM(COALESCE(tehsil, ''))), ' ', '') LIKE '%' || $3 || '%'`,
    [districtNames, sector, needle]
  );
  const maxFrom = vintage.rows[0]?.max_from;
  if (!maxFrom) return { rows: [], effectiveFrom: null };

  const res = await pool.query(
    `SELECT rate_per_sq_yard_inr, tehsil, village, source, effective_from
     FROM circle_rates
     WHERE sector_type = $2
       AND source <> 'haryana_seed'
       AND LOWER(TRIM(district)) = ANY (SELECT LOWER(TRIM(x)) FROM unnest($1::text[]) AS x)
       AND effective_from = $3
       AND REPLACE(LOWER(TRIM(COALESCE(tehsil, ''))), ' ', '') LIKE '%' || $4 || '%'
     ORDER BY rate_per_sq_yard_inr`,
    [districtNames, sector, maxFrom, needle]
  );
  return { rows: res.rows, effectiveFrom: maxFrom };
}

/**
 * Prefer rows whose tehsil/village name appears near the point via sub-district/village layers when available;
 * otherwise use full latest-vintage district median.
 */
async function resolveCircleMedian(pool, location, districtNames, sector) {
  const { rows, effectiveFrom } = await fetchLatestCircleRows(pool, districtNames, sector);
  if (!rows.length) {
    return {
      rate: null,
      sampleCount: 0,
      tehsil: null,
      tehsilMatched: false,
      effectiveFrom: null,
      districtMaxEffectiveFrom: null,
      vintageLagYears: null,
      rows: [],
    };
  }

  let nearbyTehsil = null;
  try {
    const hasTehsil = await pool.query(
      `SELECT to_regclass('public.tehsil_boundary') AS t,
              to_regclass('public.subdistrict_boundary') AS s`
    );
    const t = hasTehsil.rows[0]?.t;
    const s = hasTehsil.rows[0]?.s;
    if (t || s) {
      const parts = [];
      if (t) {
        parts.push(
          `SELECT COALESCE(NULLIF(TRIM(teh_name), ''), NULLIF(TRIM(tehsil), '')) AS tehsil, geom
           FROM tehsil_boundary WHERE geom IS NOT NULL`
        );
      }
      if (s) {
        parts.push(
          `SELECT COALESCE(NULLIF(TRIM(name), ''), NULLIF(TRIM(sdtname), '')) AS tehsil, geom
           FROM subdistrict_boundary WHERE geom IS NOT NULL`
        );
      }
      const tehsilRow = await pool.query(
        `SELECT tehsil FROM (${parts.join(' UNION ALL ')}) u
         WHERE tehsil IS NOT NULL
         ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
         LIMIT 1`,
        [location.lng, location.lat]
      );
      nearbyTehsil = tehsilRow.rows[0]?.tehsil || null;
    }
  } catch {
    nearbyTehsil = null;
  }

  let scoped = rows;
  let tehsilMatched = false;
  let circleRateTehsil = null;
  let usedEffectiveFrom = effectiveFrom;
  if (nearbyTehsil) {
    const needle = String(nearbyTehsil).toLowerCase().replace(/\s+/g, '');
    const matched = rows.filter((r) => {
      const t = String(r.tehsil || '')
        .toLowerCase()
        .replace(/\s+/g, '');
      return t && (t.includes(needle) || needle.includes(t));
    });
    if (matched.length >= 3) {
      scoped = matched;
      tehsilMatched = true;
      circleRateTehsil = nearbyTehsil;
    } else {
      const older = await fetchTehsilLatestCircleRows(pool, districtNames, sector, nearbyTehsil);
      if (older.rows.length >= 3) {
        scoped = older.rows;
        tehsilMatched = true;
        circleRateTehsil = nearbyTehsil;
        usedEffectiveFrom = older.effectiveFrom;
      }
    }
  }

  const rates = scoped.map((r) => Number(r.rate_per_sq_yard_inr)).filter((n) => Number.isFinite(n));
  let vintageLagYears = 0;
  if (usedEffectiveFrom && effectiveFrom) {
    const usedMs = new Date(usedEffectiveFrom).getTime();
    const distMs = new Date(effectiveFrom).getTime();
    if (Number.isFinite(usedMs) && Number.isFinite(distMs) && distMs > usedMs) {
      vintageLagYears = Number(((distMs - usedMs) / (365.25 * 24 * 3600 * 1000)).toFixed(2));
    }
  }

  return {
    rate: rates.length ? Math.round(median(rates)) : null,
    sampleCount: rates.length,
    tehsil: circleRateTehsil,
    tehsilMatched,
    effectiveFrom: usedEffectiveFrom,
    districtMaxEffectiveFrom: effectiveFrom,
    vintageLagYears,
    rows: scoped,
  };
}

/**
 * Resolving "which district is this point in?" costs ~140ms, because it measures the
 * point against 22 very detailed district multipolygons. A full-district investor scan
 * called it once per candidate (1,564 in Gurugram), which alone accounted for most of a
 * multi-minute cold scan.
 *
 * Two ways out, in order of preference:
 *  1. The caller usually already knows the district (the zone row carries it, resolved
 *     from the same `district_boundary` table), so it can pass `districtHint` and skip
 *     the query entirely — exact, not an approximation.
 *  2. Otherwise memoise by a ~111 m cell. Districts are tens of kilometres across, so a
 *     cell that small cannot straddle a boundary in any way that changes the answer.
 */
const DISTRICT_CELL_DECIMALS = 3;
const DISTRICT_MEMO_TTL_MS = 30 * 60 * 1000;
const DISTRICT_MEMO_MAX = 5000;
const districtMemo = new Map();

/** The generic fallbacks a zone row uses when it could not resolve a real district. */
const PLACEHOLDER_DISTRICTS = new Set(['haryana', '']);

function districtCellKey(location) {
  return `${Number(location.lng).toFixed(DISTRICT_CELL_DECIMALS)},${Number(location.lat).toFixed(DISTRICT_CELL_DECIMALS)}`;
}

async function resolveDistrictForPoint(pool, location, districtHint) {
  const hint = typeof districtHint === 'string' ? districtHint.trim() : '';
  if (hint && !PLACEHOLDER_DISTRICTS.has(hint.toLowerCase())) return hint;

  const key = districtCellKey(location);
  const memo = districtMemo.get(key);
  if (memo && Date.now() - memo.at < DISTRICT_MEMO_TTL_MS) return memo.district;

  const districtRow = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(n_d_name), ''), NULLIF(TRIM(dis_abb), '')) AS district
     FROM district_boundary
     WHERE geom IS NOT NULL
     ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
     LIMIT 1`,
    [location.lng, location.lat]
  );
  const district = districtRow.rows[0]?.district || null;
  districtMemo.set(key, { at: Date.now(), district });
  if (districtMemo.size > DISTRICT_MEMO_MAX) districtMemo.delete(districtMemo.keys().next().value);
  return district;
}

async function estimateLandValue(location, sector = 'industrial', options = {}) {
  const pool = getPool();
  if (!pool) {
    return { method: 'unavailable', reason: 'database_not_configured' };
  }

  const normalizedSector = (sector || 'industrial').trim().toLowerCase();

  try {
    const district = await resolveDistrictForPoint(pool, location, options.districtHint);
    if (!district) {
      return {
        method: 'insufficient_data',
        reason: 'district_unknown',
        sector: normalizedSector,
        confidence: 'none',
        marketAvailable: false,
        note: 'Could not resolve district for this location.',
      };
    }

    const districtNames = expandDistrictNames(district);

    let circle = await resolveCircleMedian(pool, location, districtNames, normalizedSector);
    let circleSectorUsed = normalizedSector;
    let sectorProxyApplied = false;
    let sectorProxyFactor = 1;
    if (!circle.rate && normalizedSector === 'industrial') {
      for (const alt of ['commercial', 'residential']) {
        const altCircle = await resolveCircleMedian(pool, location, districtNames, alt);
        if (altCircle.rate) {
          const factor = SECTOR_PROXY_FACTOR[alt] ?? 0.75;
          circle = {
            ...altCircle,
            rate: Math.round(altCircle.rate * factor),
          };
          circleSectorUsed = alt;
          sectorProxyApplied = true;
          sectorProxyFactor = factor;
          break;
        }
      }
    }

    const circleRate = circle.rate;
    const circleRatesCount = circle.sampleCount;

    const comparables = await pool.query(
      `SELECT price_per_sq_yard_inr,
              ST_Distance(
                geom::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
              ) / 1000.0 AS distance_km
       FROM land_transactions
       WHERE geom IS NOT NULL
         AND sector_type = $3
         AND source <> 'seed_comparable'
         AND transaction_date >= (CURRENT_DATE - make_interval(months => $4::int))
         AND ST_DWithin(
               geom::geography,
               ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
               $5
             )
       ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       LIMIT $6`,
      [location.lng, location.lat, normalizedSector, COMPS_MONTHS, COMPS_RADIUS_M, COMPS_LIMIT]
    );

    const priced = comparables.rows
      .map((r) => ({
        price: Number(r.price_per_sq_yard_inr),
        distanceKm: Number(r.distance_km),
      }))
      .filter((r) => Number.isFinite(r.price));
    const trimmedRows = trimIqrRows(priced);
    const trimmedPrices = trimmedRows.map((r) => r.price);
    const comparableMedian = median(trimmedPrices);
    const comparableWeighted = distanceWeightedMean(trimmedRows);
    const marketSignal = comparableWeighted ?? comparableMedian;
    const compsCount = trimmedPrices.length;
    const marketAvailable = compsCount > 0;
    const compsP10 = percentile(trimmedPrices, 0.1);
    const compsP90 = percentile(trimmedPrices, 0.9);

    let estimatedPerSqYard = null;
    let estimatedLowPerSqYard = null;
    let estimatedHighPerSqYard = null;
    let method = 'insufficient_data';
    let marketWeight = 0;
    if (marketSignal && circleRate) {
      marketWeight = compsBlendWeight(compsCount);
      const circleWeight = 1 - marketWeight;
      estimatedPerSqYard = Math.round(marketSignal * marketWeight + circleRate * circleWeight);
      method = compsCount >= 3 ? 'comparable_blend' : 'circle_rate_blend';
      if (compsP10 != null && compsP90 != null) {
        estimatedLowPerSqYard = Math.round(compsP10 * marketWeight + circleRate * circleWeight);
        estimatedHighPerSqYard = Math.round(compsP90 * marketWeight + circleRate * circleWeight);
      }
    } else if (marketSignal) {
      estimatedPerSqYard = Math.round(marketSignal);
      method = 'comparable_median';
      estimatedLowPerSqYard = compsP10 != null ? Math.round(compsP10) : estimatedPerSqYard;
      estimatedHighPerSqYard = compsP90 != null ? Math.round(compsP90) : estimatedPerSqYard;
    } else if (circleRate) {
      estimatedPerSqYard = Math.round(circleRate);
      method = sectorProxyApplied ? 'circle_rate_sector_proxy' : 'circle_rate';
      estimatedLowPerSqYard = estimatedPerSqYard;
      estimatedHighPerSqYard = estimatedPerSqYard;
    }

    const marketPremiumVsFloor =
      estimatedPerSqYard && circleRate && marketAvailable
        ? Number(((estimatedPerSqYard - circleRate) / circleRate).toFixed(3))
        : null;

    const confidence = confidenceFrom({
      circleCount: circleRatesCount,
      compsCount,
      method,
      tehsilMatched: circle.tehsilMatched,
      vintageLagYears: circle.vintageLagYears,
      sectorProxy: sectorProxyApplied,
    });

    let note;
    if (!circleRate && !marketSignal) {
      note = `No official collector rate for ${district} (${normalizedSector}) yet.`;
    } else if (!marketAvailable) {
      if (sectorProxyApplied) {
        note = `No ${normalizedSector} collector rate — using ${circleSectorUsed} median × ${sectorProxyFactor} sector haircut.`;
      } else if (circle.tehsilMatched) {
        note = `Gov floor only (tehsil-aware ${circle.tehsil}${circle.effectiveFrom ? `, vintage ${String(circle.effectiveFrom).slice(0, 10)}` : ''}). No market comps within ${COMPS_RADIUS_M / 1000} km / ${COMPS_MONTHS} mo.`;
      } else {
        note = `Gov floor only (district collector-rate median, latest vintage). No market comps yet.`;
      }
    } else if (method === 'comparable_blend') {
      note = `Distance-weighted market (${Math.round(marketWeight * 100)}%) + collector floor (${Math.round((1 - marketWeight) * 100)}%); n=${compsCount} comps ≤${COMPS_RADIUS_M / 1000} km.`;
    } else if (method === 'circle_rate_blend') {
      note = `Sparse comps (n=${compsCount}) — light blend market ${Math.round(marketWeight * 100)}% / floor ${Math.round((1 - marketWeight) * 100)}%.`;
    } else if (sectorProxyApplied) {
      note = `No ${normalizedSector} collector rate — using district ${circleSectorUsed} median × ${sectorProxyFactor}`;
    } else {
      note = 'District collector-rate median (official notification)';
    }

    if (circle.vintageLagYears != null && circle.vintageLagYears >= 1) {
      note += ` · tehsil vintage lags district by ~${circle.vintageLagYears.toFixed(1)}y`;
    }

    return {
      method,
      district,
      districtMatched: districtNames,
      sector: normalizedSector,
      circleRateSector: circleSectorUsed,
      circleRatePerSqYardInr: circleRate,
      circleRateSampleCount: circleRatesCount,
      circleRateTehsil: circle.tehsil,
      circleRateEffectiveFrom: formatDateOnly(circle.effectiveFrom),
      districtMaxEffectiveFrom: formatDateOnly(circle.districtMaxEffectiveFrom),
      vintageLagYears: circle.vintageLagYears,
      sectorProxyApplied,
      sectorProxyFactor: sectorProxyApplied ? sectorProxyFactor : null,
      comparableCount: compsCount,
      comparableSampleCount: compsCount,
      comparableMedianPerSqYardInr: comparableMedian ? Math.round(comparableMedian) : null,
      comparableWeightedPerSqYardInr: marketSignal ? Math.round(marketSignal) : null,
      estimatedPerSqYardInr: estimatedPerSqYard,
      estimatedLowPerSqYardInr: estimatedLowPerSqYard,
      estimatedHighPerSqYardInr: estimatedHighPerSqYard,
      marketPremiumVsFloor,
      /** @deprecated use marketPremiumVsFloor — kept for API compat */
      roiProxy: marketPremiumVsFloor,
      confidence,
      marketAvailable,
      compsBlendWeight: marketWeight || null,
      note,
    };
  } catch (err) {
    return { method: 'error', reason: err.message, confidence: 'none', marketAvailable: false };
  }
}

module.exports = {
  estimateLandValue,
  expandDistrictNames,
  median,
  trimIqr,
  trimIqrRows,
  percentile,
  distanceWeightedMean,
  compsBlendWeight,
  confidenceFrom,
  formatDateOnly,
  SECTOR_PROXY_FACTOR,
  COMPS_RADIUS_M,
  COMPS_MONTHS,
};
