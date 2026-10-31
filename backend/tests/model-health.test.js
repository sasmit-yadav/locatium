const test = require('node:test');
const assert = require('node:assert/strict');

const { overallStatus } = require('../src/services/model-health.service');
const scoringTelemetry = require('../src/services/scoring-telemetry');

const HEALTHY_ML = { reachable: true, status: 'up' };
const HEALTHY_LLM = { enabled: true, requests: 10, fallbackRatePct: 0 };
const FRESH_DATA = { sources: [{ key: 'circle_rates', label: 'Collector rates', status: 'ok' }] };

test('overall verdict is ok when every part reports healthy', () => {
  const verdict = overallStatus({
    ml: HEALTHY_ML,
    scoring: { total: 50, fallbackRatePct: 0, recentSuccessRatePct: 100 },
    llm: HEALTHY_LLM,
    data: FRESH_DATA,
  });
  assert.equal(verdict.level, 'ok');
  assert.deepEqual(verdict.issues, []);
});

test('an unreachable ML service is critical, not a warning', () => {
  const verdict = overallStatus({
    ml: { reachable: false, status: 'unreachable' },
    scoring: { total: 0, fallbackRatePct: 0, recentSuccessRatePct: null },
    llm: HEALTHY_LLM,
    data: FRESH_DATA,
  });
  assert.equal(verdict.level, 'critical');
  assert.match(verdict.issues[0].message, /ML service unreachable/);
});

test('a model that broke recently is judged on the recent window, not the lifetime rate', () => {
  // A long-running process with a good lifetime average must still go critical when the
  // model is failing *now* — that is the whole point of watching the recent window.
  const verdict = overallStatus({
    ml: HEALTHY_ML,
    scoring: { total: 10000, fallbackRatePct: 1, recentSuccessRatePct: 20 },
    llm: HEALTHY_LLM,
    data: FRESH_DATA,
  });
  assert.equal(verdict.level, 'critical');
  assert.match(verdict.issues[0].message, /80% of recent scores fell back/);
});

test('stale and empty data sources surface as warnings', () => {
  const verdict = overallStatus({
    ml: HEALTHY_ML,
    scoring: { total: 5, fallbackRatePct: 0, recentSuccessRatePct: 100 },
    llm: HEALTHY_LLM,
    data: {
      sources: [
        { key: 'land_transactions', label: 'Market comparables', status: 'stale', ageDays: 754 },
        { key: 'aqi_stations', label: 'CPCB AQI stations', status: 'empty' },
      ],
    },
  });
  assert.equal(verdict.level, 'warn');
  assert.equal(verdict.issues.length, 2);
  assert.match(verdict.issues[0].message, /754 days old/);
  assert.match(verdict.issues[1].message, /is empty/);
});

test('a healthy but idle process is not reported as failing', () => {
  // Zero requests means zero evidence; it must not read as a 0% success rate.
  const verdict = overallStatus({
    ml: HEALTHY_ML,
    scoring: { total: 0, fallbackRatePct: 0, recentSuccessRatePct: null },
    llm: { enabled: true, requests: 0, fallbackRatePct: 0 },
    data: FRESH_DATA,
  });
  assert.equal(verdict.level, 'ok');
});

test('scoring telemetry separates ML successes from fallbacks and names the reason', () => {
  scoringTelemetry.reset();
  scoringTelemetry.recordScore({ method: 'ml', modelVersion: 'investment-v2', elapsedMs: 120 });
  scoringTelemetry.recordScore({ method: 'ml', modelVersion: 'investment-v2', elapsedMs: 80 });
  scoringTelemetry.recordScore({
    method: 'heuristic',
    modelVersion: 'heuristic-v1',
    fallback: true,
    reason: 'timeout',
    elapsedMs: 2600,
  });

  const snap = scoringTelemetry.snapshot();
  assert.equal(snap.total, 3);
  assert.equal(snap.byMethod.ml, 2);
  assert.equal(snap.byMethod.heuristic, 1);
  assert.equal(snap.fallbacks, 1);
  assert.equal(snap.fallbackRatePct, 33.3);
  assert.equal(snap.fallbackReasons.timeout, 1);
  assert.equal(snap.byModelVersion['investment-v2'], 2);
  assert.equal(snap.latencyMs.samples, 3);
  scoringTelemetry.reset();
});

test('scoring telemetry bounds the fallback-reason map', () => {
  // An upstream emitting unique error strings must not grow this without limit.
  scoringTelemetry.reset();
  for (let i = 0; i < 40; i += 1) {
    scoringTelemetry.recordScore({ method: 'heuristic', fallback: true, reason: `reason_${i}` });
  }
  const snap = scoringTelemetry.snapshot();
  assert.ok(Object.keys(snap.fallbackReasons).length <= 13, 'reason map stays bounded');
  assert.ok(snap.fallbackReasons.other > 0, 'overflow reasons collapse into `other`');
  scoringTelemetry.reset();
});
