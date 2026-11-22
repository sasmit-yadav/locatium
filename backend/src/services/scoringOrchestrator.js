const { mlOverrideEnabled } = require('../config');
const defaultMlClient = require('./mlClient');
const defaultFallbackScoring = require('./fallbackScoring');
const { buildScoreInsights } = require('./score-insights.service');
const { enrichWithNarrative } = require('./narrative-insights.service');
const { estimateLandValue } = require('./land-value.service');
const { findComparableSites } = require('./comparable-sites.service');
const { logEvent } = require('../utils/structured-logger');
const scoringTelemetry = require('./scoring-telemetry');

const redisCache = require('./redis-cache.service');

const HEURISTIC_VERSION = 'heuristic-v1';
const SCORE_ENDPOINT = '/api/analysis/score-location';

/**
 * Whole-pipeline cache for a scored pin.
 *
 * A map click costs ~30 PostGIS lookups, an ML round trip, land/comparable/policy
 * queries and (optionally) an LLM memo. The underlying HARSAC/PostGIS data is a static
 * import, so re-deriving all of that for a pin somebody just clicked is pure waste —
 * and users click around the same parcel repeatedly while reading the panel.
 *
 * ~111 m of rounding on the key. Every input uses 2-5 km radii, so two clicks this
 * close describe the same site.
 */
const SCORE_CACHE_TTL_SEC = Number(process.env.SCORE_CACHE_TTL_SEC) || 600;
const SCORE_CACHE_MAX = 400;

function scoreCacheKey(input) {
  const lat = Number(input?.lat);
  const lng = Number(input?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const sector = typeof input?.sector === 'string' && input.sector.trim() ? input.sector.trim().toLowerCase() : 'industrial';
  return `score:v1:${sector}:${lat.toFixed(3)}:${lng.toFixed(3)}`;
}

async function readScoreCache(scoreMemory, key) {
  if (!key) return null;
  const mem = scoreMemory.get(key);
  if (mem && Date.now() - mem.at < SCORE_CACHE_TTL_SEC * 1000) return mem.value;
  if (mem) scoreMemory.delete(key);

  const raw = await redisCache.getString(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    scoreMemory.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

async function writeScoreCache(scoreMemory, key, value) {
  if (!key || !value) return;
  scoreMemory.set(key, { at: Date.now(), value });
  if (scoreMemory.size > SCORE_CACHE_MAX) scoreMemory.delete(scoreMemory.keys().next().value);
  await redisCache.setString(key, JSON.stringify(value), SCORE_CACHE_TTL_SEC);
}

function mergeMlInvestment(heuristicResult, mlPayload) {
  const mlResult = mlPayload.result || {};
  const mlAvailable =
    mlPayload.method === 'ml' && mlResult.mlAdjusted && typeof mlResult.overallScore === 'number';
  const useMlOverall = mlAvailable && mlOverrideEnabled();
  const mlExperimental = mlAvailable
    ? {
        overallScore: mlResult.overallScore,
        modelVersion: mlPayload.model_version || null,
        trainingRows: mlResult.trainingRows ?? null,
        appliedToScore: useMlOverall,
        note: 'Experimental: trained on 30 synthetic labels derived from the input features; not validated against real investment outcomes.',
      }
    : null;

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
    method: useMlOverall ? 'ml' : 'heuristic',
    confidence: useMlOverall && typeof mlPayload.confidence === 'number' ? mlPayload.confidence : 1.0,
    model_version: useMlOverall ? mlPayload.model_version || HEURISTIC_VERSION : HEURISTIC_VERSION,
    mlAdjusted: useMlOverall,
    mlExperimental,
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
  // Per-instance so two orchestrators never serve each other's answers. Redis, when
  // configured, is deliberately shared — that is the point of a distributed cache.
  const scoreMemory = new Map();

  async function scoreLocation(input, { requestId } = {}) {
    const startedAt = Date.now();
    const cacheKey = scoreCacheKey(input);
    const cached = await readScoreCache(scoreMemory, cacheKey);
    // A cache hit did no scoring work, so counting it would flatter the health numbers.
    if (cached) return { ...cached, cached: true };

    // The heuristic and the ML call run together, but the heuristic is only awaited
    // *after* the ML round trip. Reifying it into a settled result observes any
    // rejection right away: a bad-input rejection left unobserved across that await is
    // an unhandled rejection, and Node's default policy terminates the process for it —
    // so `POST /api/analysis/score-location {}` used to take the whole API down.
    const heuristicSettled = fallbackScoring
      .scoreLocation(input)
      .then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));

    let mlPayload = null;
    let mlError = null;
    try {
      mlPayload = await mlClient.scoreInvestment(input, { requestId });
    } catch (err) {
      mlError = err;
    }

    const heuristic = await heuristicSettled;
    // Invalid input is a client error whatever the ML service did; surface it as-is
    // rather than reporting it as an ML fallback.
    if (!heuristic.ok) throw heuristic.error;

    let response;
    if (mlError) {
      const reason = mlError.reason || mlError.message || 'unknown';
      if (reason !== 'disabled') logEvent('ml_fallback_triggered', {
        endpoint: SCORE_ENDPOINT,
        reason,
        requestId: requestId || null,
      });
      response = await finalizeScoreResponse(attachFallbackMetadata(heuristic.value, reason));
    } else {
      response = await finalizeScoreResponse(mergeMlInvestment(heuristic.value, mlPayload));
    }

    scoringTelemetry.recordScore({
      method: response?.method,
      modelVersion: response?.model_version,
      fallback: Boolean(response?.fallback),
      reason: response?.fallbackReason,
      elapsedMs: Date.now() - startedAt,
    });

    // Only cache a complete answer. A fallback response is a degraded snapshot of a
    // transient outage and must not be pinned in front of a recovered ML service.
    if (!response?.fallback) await writeScoreCache(scoreMemory, cacheKey, response);
    return response;
  }

  async function scoreBatch(input) {
    const result = await fallbackScoring.scoreBatch(input);
    const rows = result.results || [];
    const enriched = [];
    for (let offset = 0; offset < rows.length; offset += 8) {
      const chunk = rows.slice(offset, offset + 8);
      const chunkOut = await Promise.all(
        chunk.map(async (row) => {
          const loc = row.location || {
            lat: row.lat,
            lng: row.lng,
            sector: row.sector || input.sector || 'industrial',
          };
          const sector = loc.sector || input.sector || 'industrial';
          try {
            const landValue = await estimateLandValue(loc, sector);
            const withLand = { ...row, location: loc, landValue };
            withLand.insights = buildScoreInsights(withLand);
            return withLand;
          } catch {
            return row;
          }
        })
      );
      enriched.push(...chunkOut);
    }
    return {
      ...result,
      results: enriched,
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
