const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createScoringOrchestrator } = require('../src/services/scoringOrchestrator');

const sampleInput = { lat: 28.45, lng: 76.9, sector: 'industrial' };

const heuristicResult = {
  location: sampleInput,
  overallScore: 72,
  scores: { infrastructure: 70, accessibility: 75, environmentalRisk: 80, zoneCompatibility: 65 },
};

function makeOrchestrator(mlClient) {
  return createScoringOrchestrator({
    mlClient,
    fallbackScoring: {
      scoreLocation: async () => heuristicResult,
      scoreBatch: async () => ({ count: 1, averageScore: 72, results: [heuristicResult] }),
    },
  });
}

describe('scoringOrchestrator', () => {
  test('uses ML metadata when mlClient succeeds with heuristic path', async () => {
    const orchestrator = makeOrchestrator({
      scoreInvestment: async () => ({
        method: 'heuristic',
        confidence: 1.0,
        model_version: 'heuristic-v1',
        result: { overallScore: 72, scores: heuristicResult.scores },
      }),
    });

    const result = await orchestrator.scoreLocation(sampleInput, { requestId: 'req-1' });
    assert.equal(result.method, 'heuristic');
    assert.equal(result.model_version, 'heuristic-v1');
    assert.equal(result.overallScore, 72);
    assert.equal(result.fallback, false);
  });

  test('uses ML overall score when method is ml but keeps Node component scores', async () => {
    const orchestrator = makeOrchestrator({
      scoreInvestment: async () => ({
        method: 'ml',
        confidence: 0.88,
        model_version: 'investment-v1',
        result: {
          overallScore: 81,
          scores: { infrastructure: 40, accessibility: 40, environmentalRisk: 40, zoneCompatibility: 40 },
          mlAdjusted: true,
        },
      }),
    });

    const result = await orchestrator.scoreLocation(sampleInput);
    assert.equal(result.method, 'ml');
    assert.equal(result.overallScore, 81);
    assert.equal(result.scores.infrastructure, 70);
    assert.ok(result.insights);
    assert.ok(result.insights.summary);
  });

  test('falls back on ML timeout', async () => {
    const logs = [];
    const logSpy = mock.method(console, 'log', (line) => logs.push(line));

    const orchestrator = makeOrchestrator({
      scoreInvestment: async () => {
        const err = new Error('ML service request timed out');
        err.reason = 'timeout';
        throw err;
      },
    });

    const result = await orchestrator.scoreLocation(sampleInput);
    assert.equal(result.method, 'heuristic');
    assert.equal(result.model_version, 'heuristic-v1');
    assert.equal(result.fallback, true);
    assert.equal(result.fallbackReason, 'timeout');
    assert.ok(logs.some((line) => line.includes('ml_fallback_triggered')));
    logSpy.mock.restore();
  });

  test('falls back on ML 500', async () => {
    const orchestrator = makeOrchestrator({
      scoreInvestment: async () => {
        const err = new Error('ML service returned 500');
        err.reason = 'http_error';
        throw err;
      },
    });

    const result = await orchestrator.scoreLocation(sampleInput);
    assert.equal(result.fallback, true);
    assert.equal(result.fallbackReason, 'http_error');
    assert.equal(result.overallScore, 72);
  });
});
