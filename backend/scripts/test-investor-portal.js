/**
 * Auth E2E tests — investor pipeline, portfolios, search alerts.
 * Run with backend up: node scripts/test-investor-portal.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert').strict;

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 3002}`;

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'analyst@locatium.in', password: 'sas@123456789' }),
  });
  assert.equal(res.status, 200, 'login failed');
  const json = await res.json();
  return json.accessToken;
}

async function authed(token, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function pass(label) {
  console.log(`PASS  ${label}`);
}

async function main() {
  console.log(`\nInvestor portal E2E → ${BASE}\n`);
  const token = await login();
  pass('Auth login');

  const opp = await fetch(`${BASE}/api/investor/opportunities?sector=industrial&limit=3`);
  const oppJson = await opp.json();
  const zoneIds = (oppJson.opportunities || []).slice(0, 2).map((z) => z.id);
  assert.ok(zoneIds.length >= 1, 'need at least one zone');
  pass(`Sample zones: ${zoneIds.join(', ')}`);

  // Pipeline
  const pipeCreate = await authed(token, '/api/portal/pipeline', {
    method: 'POST',
    body: JSON.stringify({ zoneId: zoneIds[0], stage: 'shortlisted', notes: 'E2E test item' }),
  });
  assert.equal(pipeCreate.res.status, 201, 'pipeline create');
  const pipeId = pipeCreate.json.id;
  pass('Pipeline create');

  const pipeList = await authed(token, '/api/portal/pipeline');
  assert.equal(pipeList.res.status, 200);
  assert.ok((pipeList.json.items || pipeList.json.pipeline || []).length >= 1);
  pass('Pipeline list');

  const pipeDelete = await authed(token, `/api/portal/pipeline/${pipeId}`, { method: 'DELETE' });
  assert.equal(pipeDelete.res.status, 200);
  pass('Pipeline delete');

  // Portfolios
  const portCreate = await authed(token, '/api/portal/portfolios', {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E Q3 candidates', zoneIds, notes: 'integration test' }),
  });
  assert.equal(portCreate.res.status, 201);
  const portfolio = portCreate.json;
  assert.ok(portfolio.shareToken, 'portfolio share token');
  pass('Portfolio create');

  const shareRes = await fetch(`${BASE}/api/portal/portfolios/share/${portfolio.shareToken}`);
  assert.equal(shareRes.status, 200);
  const shareJson = await shareRes.json();
  assert.ok(shareJson.zoneIds?.length >= 1, 'shared portfolio has zoneIds');
  pass('Portfolio share (public)');

  const portDelete = await authed(token, `/api/portal/portfolios/${portfolio.id}`, { method: 'DELETE' });
  assert.equal(portDelete.res.status, 200);
  pass('Portfolio delete');

  // Saved search + alert
  const searchCreate = await authed(token, '/api/portal/saved-searches', {
    method: 'POST',
    body: JSON.stringify({
      name: 'E2E investor filters',
      filters: { sector: 'industrial', district: 'Gurugram', budget: 'medium' },
    }),
  });
  assert.equal(searchCreate.res.status, 201);
  const searchId = searchCreate.json.id;
  pass('Saved search create');

  const alertCreate = await authed(token, '/api/portal/search-alerts', {
    method: 'POST',
    body: JSON.stringify({
      savedSearchId: searchId,
      email: 'analyst@locatium.in',
      minScoreDelta: 5,
    }),
  });
  assert.equal(alertCreate.res.status, 201);
  const alertId = alertCreate.json.id;
  pass('Search alert subscribe');

  const alertList = await authed(token, '/api/portal/search-alerts');
  assert.equal(alertList.res.status, 200);
  assert.ok((alertList.json.alerts || []).some((a) => a.id === alertId));
  pass('Search alert list');

  // Run alert processor once (writes to email-outbox when SMTP not configured)
  const { runAllAlerts } = require('../src/services/investor-alert.service');
  const alertRun = await runAllAlerts();
  pass(`Alert processor ran (${alertRun.processed ?? 0} processed)`);

  const alertDelete = await authed(token, `/api/portal/search-alerts/${alertId}`, { method: 'DELETE' });
  assert.equal(alertDelete.res.status, 200);
  pass('Search alert delete');

  await authed(token, `/api/portal/saved-searches/${searchId}`, { method: 'DELETE' });
  pass('Saved search cleanup');

  console.log('\nAll investor portal E2E tests passed.\n');
}

main().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
