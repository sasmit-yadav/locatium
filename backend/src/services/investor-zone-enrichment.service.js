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

const ENRICH_CONCURRENCY = 12;

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

  const fromZoneOutcomes = async () => {
    if (!zoneId || !pool) return null;
    try {
      const { rows } = await pool.query(
        `SELECT label_score FROM zone_outcomes WHERE zone_id = $1 LIMIT 1`,
        [zoneId]
      );
      if (rows[0]?.label_score == null) return null;
      const mlScore = Number(rows[0].label_score);
      return {
        mlScore,
        mlMethod: 'zone_outcomes',
        mlAdjusted: true,
        mlModelVersion: 'zone_outcomes-v1',
        mlConfidence: 0.82,
        displayScore: Math.round(opportunityScore * 0.55 + mlScore * 0.45),
        trainingRows: null,
      };
    } catch {
      return null;
    }
  };

  if (zoneId) {
    const labeled = await fromZoneOutcomes();
    if (labeled) return labeled;
  }

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
    if (mlPayload.method === 'ml' && mlScore != null) {
      return {
        mlScore,
        mlMethod: 'ml',
        mlAdjusted,
        mlModelVersion: mlPayload.model_version || mlResult.model_version,
        mlConfidence: mlPayload.confidence,
        displayScore: blendedScore,
        trainingRows: mlResult.trainingRows,
      };
    }

    const fallback = await fromZoneOutcomes();
    if (fallback) return fallback;

    return {
      mlScore,
      mlMethod: mlPayload.method || 'heuristic',
      mlAdjusted,
      mlModelVersion: mlPayload.model_version || mlResult.model_version,
      mlConfidence: mlPayload.confidence,
      displayScore: blendedScore,
      trainingRows: mlResult.trainingRows,
    };
  } catch {
    const fallback = await fromZoneOutcomes();
    if (fallback) return fallback;
    return {
      mlScore: null,
      mlMethod: 'unavailable',
      mlAdjusted: false,
      displayScore: opportunityScore,
    };
  }
}

async function enrichSingleZone(zone, sector, analysis, nearPoint = null, options = {}) {
  const { useCache = true, includeNarrative = false, skipMl = false } = options;

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
  const zoneFeatures = zone.tableId === 'hsiidc_boundary' ? await getZoneFeatures(zone.id) : null;

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
    insights: buildScoreInsights({ ...analysis, location }),
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

  const ml = skipMl ? { displayScore: opportunity.opportunityScore, mlScore: null, mlMethod: 'skipped_batch' } : await applyMlOverlay(zone, sector, analysisPack, opportunity.opportunityScore);

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

async function enrichZonesBatch(zones, sector, nearPoint = null) {
  if (!zones.length) return [];

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

    for (let offset = 0; offset < uncached.length; offset += ENRICH_CONCURRENCY) {
      const chunk = uncached.slice(offset, offset + ENRICH_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map((zone, chunkIdx) => {
          const globalIdx = offset + chunkIdx;
          const analysis = analysisByIndex.get(globalIdx) || batch.results[chunkIdx];
          return enrichSingleZone(zone, sector, analysis, nearPoint, { useCache: true, skipMl: false });
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
