/**
 * Unified zone enrichment — v3 analysis + land value + policy + plots + ML + Redis cache.
 */

const analysisScoring = require('./analysis-scoring.service');
const mlClient = require('./mlClient');
const { estimateLandValue } = require('./land-value.service');
const { retrievePolicyContext } = require('./policy-rag.service');
const { buildScoreInsights } = require('./score-insights.service');
const { enrichWithNarrative } = require('./narrative-insights.service');
const { getPool } = require('../db/pool');
const scoreCache = require('./investor-score-cache.service');
const { getZoneFeatures } = require('./zone-features-cache.service');
const { getPlotInventoryForZone } = require('./plot-inventory.service');
const { findComparableSites } = require('./comparable-sites.service');
const {
  computeOpportunityV3,
  haversineKm,
  computeCluScore,
  computeUtilityScore,
  buildKeyRiskLine,
  buildRegulatoryChecklist,
  inferAvailability,
  buildFinancialPreview,
  buildOpportunityBreakdown,
  resolveInvestableArea,
} = require('./investor-opportunity.engine');

const ENRICH_CONCURRENCY = Number(process.env.INVESTOR_ENRICH_CONCURRENCY) || 16;
const ENRICH_CONCURRENCY_LITE = Number(process.env.INVESTOR_ENRICH_CONCURRENCY_LITE) || 32;

async function districtBenchmark(district, sector) {
  const pool = getPool();
  if (!pool || !district) return { districtAverage: null, sampleSize: 0, source: 'live_scoring' };
  try {
    const { rows } = await pool.query(
      `SELECT ROUND(AVG(label_score))::int AS avg_score, COUNT(*)::int AS sample_size
       FROM zone_outcomes WHERE LOWER(district) LIKE LOWER($1) || '%'`,
      [district]
    );
    if (rows[0]?.sample_size > 0) {
      return { districtAverage: rows[0].avg_score, sampleSize: rows[0].sample_size, source: 'zone_outcomes' };
    }
  } catch {
    /* optional */
  }
  return { districtAverage: null, sampleSize: 0, source: 'live_scoring' };
}

async function applyMlOverlay(zone, sector, analysis, opportunityScore) {
  const pool = getPool();
  const zoneId =
    zone.tableId === 'hsiidc_boundary' && zone.featureId != null ? String(zone.featureId) : null;

  const fromZoneOutcomes = async ({ asFallback = false } = {}) => {
    if (!zoneId || !pool) return null;
    try {
      const { rows } = await pool.query(
        `SELECT label_score, price_appreciation FROM zone_outcomes WHERE zone_id = $1 LIMIT 1`,
        [zoneId]
      );
      if (rows[0]?.label_score == null) return null;
      const mlScore = Number(rows[0].label_score);
      // Synthetic spatial/land labels — last resort only; do not outrank live ML/heuristic.
      const blend = asFallback ? 0.2 : 0.25;
      return {
        mlScore,
        mlMethod: 'zone_outcomes_synthetic',
        mlAdjusted: false,
        mlModelVersion: 'zone_outcomes-land-v2',
        mlConfidence: asFallback ? 0.35 : 0.45,
        displayScore: Math.round(opportunityScore * (1 - blend) + mlScore * blend),
        trainingRows: null,
        priceAppreciation: rows[0].price_appreciation != null ? Number(rows[0].price_appreciation) : null,
      };
    } catch {
      return null;
    }
  };

  try {
    const mlPayload = await mlClient.scoreInvestment({
      lat: zone.center.lat,
      lng: zone.center.lng,
      sector,
    });
    const mlResult = mlPayload.result || mlPayload;
    const mlScore = typeof mlResult.overallScore === 'number' ? mlResult.overallScore : null;
    const mlAdjusted = mlPayload.method === 'ml' && mlResult.mlAdjusted === true;
    const blendedScore =
      mlAdjusted && mlScore != null
        ? Math.round(opportunityScore * 0.55 + mlScore * 0.45)
        : mlScore != null
          ? Math.round(opportunityScore * 0.75 + mlScore * 0.25)
          : opportunityScore;
    if (mlScore != null) {
      return {
        mlScore,
        mlMethod: mlPayload.method === 'ml' ? 'ml' : mlPayload.method || 'heuristic',
        mlAdjusted,
        mlModelVersion: mlPayload.model_version || mlResult.model_version,
        mlConfidence: mlPayload.confidence,
        displayScore: blendedScore,
        trainingRows: mlResult.trainingRows,
        landFeatures: mlResult.landFeatures || null,
      };
    }
  } catch {
    /* fall through */
  }

  const fallback = await fromZoneOutcomes({ asFallback: true });
  if (fallback) return fallback;

  return {
    mlScore: null,
    mlMethod: 'unavailable',
    mlAdjusted: false,
    mlModelVersion: null,
    mlConfidence: null,
    displayScore: opportunityScore,
    trainingRows: null,
  };
}

async function enrichSingleZone(zone, sector, analysis, nearPoint = null, options = {}) {
  const { useCache = true, includeNarrative = false, skipMl = false, lite = false } = options;

  if (useCache) {
    const cached = await scoreCache.getCachedZoneScore(zone.id, sector);
    if (cached) {
      const copy = { ...cached };
      if (nearPoint?.lat != null) {
        copy.distanceKm = Number(
          haversineKm(nearPoint.lat, nearPoint.lng, zone.center.lat, zone.center.lng).toFixed(2)
        );
      }
      return copy;
    }
  }

  const location = { lat: zone.center.lat, lng: zone.center.lng, sector };
  const zoneFeatures = !lite && zone.tableId === 'hsiidc_boundary' ? await getZoneFeatures(zone.id) : null;

  // Lite path: ranking-only — analysis + land ₹. Skips plots/policy/comps/ML (huge speedup for full-district scans).
  if (lite) {
    const landValue = await estimateLandValue(location, sector);
    const analysisPack = {
      ...analysis,
      location,
      landValue,
      insights: buildScoreInsights({ ...analysis, location, landValue }),
    };
    const availability = inferAvailability(zone);
    const cluScore = computeCluScore(analysis.zoning, sector);
    const utilityScore = computeUtilityScore(analysis.details);
    const investableArea = resolveInvestableArea(zone, null, sector);
    zone.investableArea = investableArea;
    const opportunity = computeOpportunityV3(
      zone,
      analysisPack,
      landValue,
      sector,
      {
        cluScore,
        utilityScore,
        policySnippets: [],
        availability,
        plotInventory: null,
      },
      investableArea
    );
    const distanceKm =
      nearPoint?.lat != null && nearPoint?.lng != null
        ? Number(haversineKm(nearPoint.lat, nearPoint.lng, zone.center.lat, zone.center.lng).toFixed(2))
        : null;
    const enriched = {
      ...zone,
      ...opportunity,
      opportunityScore: opportunity.opportunityScore,
      formulaScore: opportunity.opportunityScore,
      mlScore: null,
      mlMethod: 'skipped_lite',
      mlAdjusted: false,
      analysis: analysisPack,
      landValue,
      policySnippets: [],
      regulatoryChecklist: [],
      financialPreview: buildFinancialPreview(zone, landValue, sector, investableArea),
      plotInventory: null,
      investableArea,
      comparables: null,
      availability,
      keyRisk: buildKeyRiskLine(analysisPack),
      cluScore,
      utilityScore,
      utilityReadiness: utilityScore >= 70 ? 'High' : utilityScore >= 45 ? 'Medium' : 'Low',
      benchmark: { districtAverage: null, sampleSize: 0, source: 'lite_rank' },
      dataSource: {
        geometry: zone.tableId,
        scores: 'Live map data (lite rank)',
        cache: 'redis+memory',
        refreshedAt: new Date().toISOString(),
      },
      opportunityBreakdown: buildOpportunityBreakdown(opportunity),
      scoreBreakdown: analysis.scoreBreakdown || [],
      distanceKm,
      components: { ...opportunity.components, displayScore: opportunity.opportunityScore, mlScore: null },
    };
    if (useCache) await scoreCache.setCachedZoneScore(zone.id, sector, enriched);
    return enriched;
  }

  const [landValue, policySnippets, benchmark, plotInventory, comparables] = await Promise.all([
    estimateLandValue(location, sector),
    retrievePolicyContext({ sector, keywords: [zone.district, zone.type, 'auction', 'allotment'] }),
    districtBenchmark(zone.district, sector),
    getPlotInventoryForZone(zone, sector),
    findComparableSites(location, sector, { radiusKm: 12, limit: 8 }),
  ]);

  let analysisPack = {
    ...analysis,
    location,
    landValue,
    zoneFeatures,
    insights: buildScoreInsights({ ...analysis, location, landValue }),
  };

  if (includeNarrative) {
    analysisPack = await enrichWithNarrative(analysisPack);
  }

  const availabilityFromPlots = plotInventory.summary?.aggregateStatus
    ? {
        status: plotInventory.summary.available > 0 ? 'available' : plotInventory.summary.aggregateStatus,
        label:
          plotInventory.summary.available > 0
            ? `${plotInventory.summary.available} plot(s) available`
            : plotInventory.summary.allotted > 0
              ? `${plotInventory.summary.allotted} allotted · ${plotInventory.count} total plots`
              : inferAvailability(zone).label,
      }
    : inferAvailability(zone);

  const cluScore = computeCluScore(analysis.zoning, sector);
  const utilityScore = computeUtilityScore(analysis.details);
  const keyRisk = buildKeyRiskLine(analysisPack);
  const regulatoryChecklist = buildRegulatoryChecklist(sector, analysis.zoning, policySnippets);

  const investableArea = resolveInvestableArea(zone, plotInventory, sector);
  zone.investableArea = investableArea;

  const financialPreview = buildFinancialPreview(zone, landValue, sector, investableArea);

  const opportunity = computeOpportunityV3(zone, analysisPack, landValue, sector, {
    cluScore,
    utilityScore,
    policySnippets,
    availability: availabilityFromPlots,
    plotInventory,
  }, investableArea);

  const ml = skipMl
    ? { displayScore: opportunity.opportunityScore, mlScore: null, mlMethod: 'skipped_batch' }
    : await applyMlOverlay(zone, sector, analysisPack, opportunity.opportunityScore);

  const districtDelta =
    benchmark?.districtAverage != null ? ml.displayScore - benchmark.districtAverage : null;

  const comparableAvg = comparables?.summary?.averageScore;
  const comparableMessage =
    comparableAvg != null
      ? `Similar sites within ${comparables.summary.radiusKm} km average ${comparableAvg}/100 (this zone ${ml.displayScore}).`
      : comparables?.summary?.message || null;

  const distanceKm =
    nearPoint?.lat != null && nearPoint?.lng != null
      ? Number(haversineKm(nearPoint.lat, nearPoint.lng, zone.center.lat, zone.center.lng).toFixed(2))
      : null;

  const enriched = {
    ...zone,
    ...opportunity,
    opportunityScore: ml.displayScore,
    formulaScore: opportunity.opportunityScore,
    ...ml,
    analysis: analysisPack,
    landValue,
    policySnippets,
    regulatoryChecklist,
    financialPreview,
    plotInventory,
    investableArea,
    comparables,
    availability: availabilityFromPlots,
    keyRisk,
    cluScore,
    utilityScore,
    utilityReadiness: utilityScore >= 70 ? 'High' : utilityScore >= 45 ? 'Medium' : 'Low',
    benchmark: {
      ...benchmark,
      deltaVsDistrict: districtDelta,
      comparableAverage: comparableAvg,
      comparableMessage,
      message:
        comparableMessage ||
        (districtDelta != null
          ? `This zone scores ${ml.displayScore} (formula ${opportunity.opportunityScore}); district avg ${benchmark.districtAverage} (${districtDelta >= 0 ? '+' : ''}${districtDelta}).`
          : null),
    },
    dataSource: {
      geometry: zone.tableId,
      scores: zoneFeatures ? 'Cached zone indicators + live map data' : 'Live map data',
      cache: 'redis+memory',
      refreshedAt: new Date().toISOString(),
    },
    opportunityBreakdown: buildOpportunityBreakdown(opportunity),
    scoreBreakdown: analysis.scoreBreakdown || [],
    distanceKm,
    components: { ...opportunity.components, displayScore: ml.displayScore, mlScore: ml.mlScore },
  };

  if (useCache) await scoreCache.setCachedZoneScore(zone.id, sector, enriched);
  return enriched;
}

async function enrichZonesBatch(zones, sector, nearPoint = null, options = {}) {
  if (!zones.length) return [];
  const lite = options.lite === true;
  const concurrency = lite ? ENRICH_CONCURRENCY_LITE : ENRICH_CONCURRENCY;

  const uncached = [];
  const results = [];

  for (const zone of zones) {
    const cached = await scoreCache.getCachedZoneScore(zone.id, sector);
    if (cached) {
      results.push({
        ...cached,
        distanceKm:
          nearPoint?.lat != null
            ? Number(haversineKm(nearPoint.lat, nearPoint.lng, zone.center.lat, zone.center.lng).toFixed(2))
            : cached.distanceKm,
      });
    } else {
      uncached.push(zone);
    }
  }

  if (uncached.length) {
    const analysisByIndex = new Map();
    const BATCH_MAX = 100;
    for (let batchOffset = 0; batchOffset < uncached.length; batchOffset += BATCH_MAX) {
      const slice = uncached.slice(batchOffset, batchOffset + BATCH_MAX);
      const batch = await analysisScoring.scoreBatch({
        sector,
        locations: slice.map((z) => ({ lat: z.center.lat, lng: z.center.lng, sector })),
      });
      batch.results.forEach((r) => analysisByIndex.set(batchOffset + r.index, r));
    }

    for (let offset = 0; offset < uncached.length; offset += concurrency) {
      const chunk = uncached.slice(offset, offset + concurrency);
      const chunkResults = await Promise.all(
        chunk.map((zone, chunkIdx) => {
          const globalIdx = offset + chunkIdx;
          const analysis = analysisByIndex.get(globalIdx);
          return enrichSingleZone(zone, sector, analysis, nearPoint, {
            useCache: true,
            skipMl: true,
            lite,
          });
        })
      );
      results.push(...chunkResults);
    }
  }

  const ranked = results.sort((a, b) => b.opportunityScore - a.opportunityScore);
  ranked.forEach((z, i) => {
    z.formulaRank = i + 1;
  });
  const mlSorted = [...ranked].sort((a, b) => (b.mlScore ?? b.opportunityScore) - (a.mlScore ?? a.opportunityScore));
  mlSorted.forEach((z, i) => {
    z.mlRank = i + 1;
  });
  return ranked;
}

async function clearScoreCache() {
  await scoreCache.clearAll();
}

module.exports = {
  enrichSingleZone,
  enrichZonesBatch,
  clearScoreCache,
  applyMlOverlay,
};
