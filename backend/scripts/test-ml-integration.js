/**
 * ML integration tests for score-location orchestration.
 * Run with: node scripts/test-ml-integration.js
 *
 * Scenarios:
 * 1. ML service up → method + model_version from ml-service
 * 2. ML service down → heuristic fallback, no 500
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert').strict;

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
const ML_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');

async function json(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function mlReachable() {
  try {
    const [health, version] = await Promise.all([
      json(`${ML_URL}/health`),
      json(`${ML_URL}/version`),
    ]);
    return (
      health.res.ok &&
      health.body?.status === 'ok' &&
      version.res.ok &&
      version.body?.service === 'locatium-ml'
    );
  } catch {
    return false;
  }
}

async function run() {
  console.log(`🧪 ML integration → API ${API_URL}, ML ${ML_URL}\n`);

  const mlUp = await mlReachable();
  console.log(mlUp ? 'ℹ️  ML service is reachable' : 'ℹ️  ML service is down (fallback path will be tested)');

  const score = await json(`${API_URL}/api/analysis/score-location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'ml-integration-test' },
    body: JSON.stringify({ lat: 28.45, lng: 76.9, sector: 'industrial' }),
  });

  assert.equal(score.res.status, 200, 'score-location must not 500 when ML is unavailable');
  assert.ok(score.body.overallScore >= 0, 'overallScore present');
  assert.equal(score.body.method, 'heuristic', 'method field required');
  assert.ok(score.body.model_version, 'model_version required');
  assert.equal(typeof score.body.confidence, 'number', 'confidence required');

  if (mlUp) {
    assert.ok(['heuristic-v1', 'investment-v1'].includes(score.body.model_version), 'expected ML model version');
    assert.equal(score.body.fallback, undefined, 'no fallback flag when ML responds');
    console.log(`✅ score-location with ML service up (${score.body.method}, ${score.body.model_version})`);
  } else {
    assert.equal(score.body.fallback, true, 'fallback flag when ML is down');
    assert.equal(score.body.model_version, 'heuristic-v1');
    console.log('✅ score-location with ML service down (heuristic fallback)');
  }

  console.log('\n✅ ML integration tests passed');
}

run().catch((err) => {
  console.error('\n❌ ML integration tests failed:', err.message);
  process.exit(1);
});
