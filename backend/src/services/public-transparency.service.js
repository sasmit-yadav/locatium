/**
 * Public transparency snapshot — what LOCATIUM scores, on which data, with which methods.
 * No PII. Used by GET /api/public/transparency and the in-app Data/Settings surface.
 */

const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');
const telemetry = require('./llm/llm-telemetry');
const { listTableIds } = require('../config/layer-registry');
const { OPPORTUNITY_VERSION } = require('./investor-opportunity.engine');
const { SCORING_VERSION } = require('./scoring-engine');

async function safeCount(pool, sql) {
  try {
    const { rows } = await pool.query(sql);
    return Number(rows[0]?.count) || 0;
  } catch {
    return null;
  }
}

async function getTransparencyStats() {
  const pool = getPool();
  const llm = telemetry.snapshot();

  const catalog = {
    scoringVersion: SCORING_VERSION,
    opportunityVersion: OPPORTUNITY_VERSION,
    spatialTablesConfigured: listTableIds().length,
    methods: {
      locationScore: 'v3-investment (ML when the model loads, heuristic otherwise)',
      opportunityRank: OPPORTUNITY_VERSION,
      landPrice: 'collector-rate + nearby comps band (not a time-series forecast)',
      assistant: 'grounded LLM with deterministic fallback',
    },
  };

  if (!pool) {
    return {
      ...catalog,
      coverage: { available: false, reason: 'database_not_configured' },
      assistant: publicAssistantStats(llm),
      generatedAt: new Date().toISOString(),
    };
  }

  const [districts, hsiidc, hospitals, schools, circleRates, transactions] = await Promise.all([
    safeCount(pool, 'SELECT COUNT(*)::int AS count FROM district_boundary'),
    safeCount(pool, 'SELECT COUNT(*)::int AS count FROM hsiidc_boundary'),
    safeCount(pool, 'SELECT COUNT(*)::int AS count FROM hospitals'),
    safeCount(
      pool,
      `SELECT (
         (SELECT COUNT(*) FROM govt_school) +
         (SELECT COUNT(*) FROM pm_shri_and_sanskriti_school) +
         (SELECT COUNT(*) FROM haryana_police_public_schools_point)
       )::int AS count`
    ),
    safeCount(pool, 'SELECT COUNT(*)::int AS count FROM circle_rates'),
    safeCount(pool, `SELECT COUNT(*)::int AS count FROM land_transactions WHERE source <> 'seed_comparable'`),
  ]);

  return {
    ...catalog,
    coverage: {
      available: true,
      districts,
      industrialEstates: hsiidc,
      hospitals,
      schools,
      collectorRateRows: circleRates,
      marketTransactions: transactions,
    },
    assistant: publicAssistantStats(llm),
    generatedAt: new Date().toISOString(),
  };
}

function publicAssistantStats(llm) {
  return {
    requests: llm.requests || 0,
    fallbackRatePct: llm.fallbackRatePct ?? null,
    cacheHitRatePct: llm.cache?.hitRatePct ?? null,
    latencyMsP50: llm.latencyMs?.total?.p50 ?? null,
  };
}

async function getPublicZoneCard(zoneId) {
  if (!zoneId || typeof zoneId !== 'string') {
    throw AppError.badRequest('zoneId is required');
  }
  const investorOpportunities = require('./investor-opportunities.service');
  const analysis = await investorOpportunities.getZoneAnalysis(zoneId.trim(), {
    includeGeometry: 'false',
  });
  const lv = analysis.landValue || {};
  return {
    zone: {
      id: analysis.zone.id,
      name: analysis.zone.name,
      district: analysis.zone.district,
      type: analysis.zone.type,
      zoneType: analysis.zone.zoneType,
      areaAcres: analysis.zone.areaAcres,
      center: analysis.zone.center,
    },
    opportunity: {
      score: analysis.opportunity?.opportunityScore ?? null,
      verdict: analysis.recommendation?.verdict || analysis.opportunity?.verdict || null,
      scoringVersion: analysis.opportunity?.scoringVersion || OPPORTUNITY_VERSION,
    },
    scores: analysis.analysis?.scores || {},
    landValue: {
      method: lv.method || null,
      estimatedPerSqYardInr: lv.estimatedPerSqYardInr ?? null,
      estimatedLowPerSqYardInr: lv.estimatedLowPerSqYardInr ?? null,
      estimatedHighPerSqYardInr: lv.estimatedHighPerSqYardInr ?? null,
      circleRatePerSqYardInr: lv.circleRatePerSqYardInr ?? null,
      confidence: lv.confidence || null,
      note: lv.note || null,
    },
    keyRisk: analysis.keyRisk || null,
    disclaimer:
      'LOCATIUM screening card from live Haryana spatial data. Not investment advice. Verify on site and with official sources.',
  };
}

module.exports = { getTransparencyStats, getPublicZoneCard, publicAssistantStats };
