/**
 * Read-only production smoke test.
 * Usage:
 *   API_URL=https://api.example.com FRONTEND_URL=https://app.example.com npm run deploy:verify
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('node:assert/strict');

const API_URL = String(process.env.API_URL || '').replace(/\/+$/, '');
const FRONTEND_URL = String(process.env.FRONTEND_URL || '').replace(/\/+$/, '');

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    return await fetch(`${API_URL}${path}`, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function json(path, options = {}) {
  const response = await request(path, options);
  const contentType = response.headers.get('content-type') || '';
  assert.match(contentType, /application\/json/i, `${path} must return JSON, not the frontend SPA`);
  const body = await response.json();
  return { response, body };
}

async function main() {
  assert.match(API_URL, /^https:\/\//, 'API_URL must be an HTTPS origin');
  assert.match(FRONTEND_URL, /^https:\/\//, 'FRONTEND_URL must be an HTTPS origin');

  const frontend = await fetch(FRONTEND_URL);
  assert.equal(frontend.status, 200, 'frontend must load');
  assert.match(await frontend.text(), /LOCATIUM/i, 'frontend title/markup must identify LOCATIUM');
  console.log('ok frontend');

  const health = await json('/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, 'ok');
  console.log('ok API liveness');

  const ready = await json('/api/ready');
  assert.equal(ready.response.status, 200, JSON.stringify(ready.body));
  assert.equal(ready.body.database, 'up');
  console.log('ok API/PostGIS readiness');

  const preflight = await request('/api/health', {
    method: 'OPTIONS',
    headers: {
      Origin: FRONTEND_URL,
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(preflight.headers.get('access-control-allow-origin'), FRONTEND_URL);
  console.log('ok CORS');

  const tileList = await json('/api/tiles/list');
  assert.equal(tileList.response.status, 200);
  const layers = tileList.body.layers || tileList.body;
  assert.ok(Array.isArray(layers) && layers.length > 0, 'tile registry must not be empty');
  console.log(`ok layer registry (${layers.length})`);

  const search = await json('/api/features/search?keyword=gurugram&limit=3');
  assert.equal(search.response.status, 200);
  assert.ok(Array.isArray(search.body.features));
  console.log(`ok spatial search (${search.body.features.length})`);

  const score = await json('/api/analysis/score-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 28.4595, lng: 77.0266, sector: 'industrial' }),
  });
  assert.equal(score.response.status, 200, JSON.stringify(score.body));
  assert.ok(Number.isFinite(Number(score.body.overallScore)));
  console.log(`ok scoring (${score.body.method || 'unknown method'})`);

  const opportunities = await json('/api/investor/opportunities?sector=industrial&limit=3');
  assert.equal(opportunities.response.status, 200, JSON.stringify(opportunities.body));
  assert.ok(opportunities.body.opportunities?.length > 0);
  console.log(`ok investor opportunities (${opportunities.body.opportunities.length})`);

  const demo = await json('/api/auth/demo', { method: 'POST' });
  if (demo.response.status === 200) {
    assert.ok(demo.body.accessToken);
    const profile = await json('/api/auth/profile', {
      headers: { Authorization: `Bearer ${demo.body.accessToken}` },
    });
    assert.equal(profile.response.status, 200);
    console.log('ok demo authentication');
  } else if (demo.response.status === 404) {
    console.log('skip demo authentication (DEMO_MODE=false)');
  } else {
    assert.fail(`demo login failed: ${demo.response.status} ${JSON.stringify(demo.body)}`);
  }

  console.log('DEPLOYMENT VERIFIED');
}

main().catch((error) => {
  console.error('DEPLOYMENT VERIFICATION FAILED:', error.message);
  process.exit(1);
});
