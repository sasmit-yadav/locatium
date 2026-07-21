const defaultMlClient = require('./mlClient');
const defaultFallbackScoring = require('./fallbackScoring');
const { buildScoreInsights } = require('./score-insights.service');
const { enrichWithNarrative } = require('./narrative-insights.service');
const { estimateLandValue } = require('./land-value.service');
const { findComparableSites } = require('./comparable-sites.service');
const { logEvent } = require('../utils/structured-logger');

const HEURISTIC_VERSION = 'heuristic-v1';
const SCORE_ENDPOINT = '/api/analysis/score-location';

function mergeMlInvestment(heuristicResult, mlPayload) {
  const mlResult = mlPayload.result || {};
  const useMlOverall =
    mlPayload.method === 'ml' && mlResult.mlAdjusted && typeof mlResult.overallScore === 'number';

  return {
    ...heuristicResult,
    overallScore: useMlOverall ? mlResult.overallScore : heuristicResult.overallScore,
    scores: heuristicResult.scores,
    details: heuristicResult.details,
    visualization: {
      ...heuristicResult.visualization,
      properties: {
        ...(heuristicResult.visualization?.properties || {}),
        overallScore: useMlOverall ? mlResult.overallScore : heuristicResult.overallScore,
        ...heuristicResult.scores,
      },
    },
    weights: heuristicResult.weights,
    method: mlPayload.method || 'heuristic',
    confidence: typeof mlPayload.confidence === 'number' ? mlPayload.confidence : 1.0,
    model_version: mlPayload.model_version || HEURISTIC_VERSION,
    mlAdjusted: useMlOverall,
    district: mlResult.district,
    trainingRows: mlResult.trainingRows,
    fallback: false,
  };
}

function attachFallbackMetadata(heuristicResult, reason) {
  return {
    ...heuristicResult,
    method: 'heuristic',
    confidence: 1.0,
    model_version: HEURISTIC_VERSION,
    fallback: true,
    fallbackReason: reason,
  };
}

async function finalizeScoreResponse(merged) {
  const sector = merged.location?.sector || 'industrial';
  const [landValue, comparables] = await Promise.all([
    estimateLandValue(merged.location, sector),
    findComparableSites(merged.location, sector),
  ]);

  merged.landValue = landValue;
  merged.comparables = comparables;
  merged.insights = buildScoreInsights(merged);

  if (comparables.summary?.message) {
    merged.insights.opportunities = [
      comparables.summary.message,
      ...(merged.insights.opportunities || []),
    ].slice(0, 4);
  }

  return enrichWithNarrative(merged);
}

function createScoringOrchestrator({ mlClient = defaultMlClient, fallbackScoring = defaultFallbackScoring } = {}) {
  async function scoreLocation(input, { requestId } = {}) {
    const heuristicPromise = fallbackScoring.scoreLocation(input);

    try {
      const mlPayload = await mlClient.scoreInvestment(input, { requestId });
      const heuristicResult = await heuristicPromise;
      return finalizeScoreResponse(mergeMlInvestment(heuristicResult, mlPayload));
    } catch (err) {
      const reason = err.reason || err.message || 'unknown';
      logEvent('ml_fallback_triggered', {
        endpoint: SCORE_ENDPOINT,
        reason,
        requestId: requestId || null,
      });
      const heuristicResult = await heuristicPromise;
      return finalizeScoreResponse(attachFallbackMetadata(heuristicResult, reason));
    }
  }

  async function scoreBatch(input) {
    const result = await fallbackScoring.scoreBatch(input);
    return {
      ...result,
      method: 'heuristic',
      confidence: 1.0,
      model_version: HEURISTIC_VERSION,
    };
  }

  return { scoreLocation, scoreBatch };
}

const orchestrator = createScoringOrchestrator();

module.exports = {
  createScoringOrchestrator,
  scoreLocation: orchestrator.scoreLocation,
  scoreBatch: orchestrator.scoreBatch,
};
