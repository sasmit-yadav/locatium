/**
 * API smoke tests for core LOCATIUM endpoints.
 * Run with: node scripts/test-api-smoke.js
 * Requires backend running and DATABASE_URL in .env
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert').strict;

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;

async function json(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, options);
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function run() {
  console.log(`🧪 API smoke tests → ${API_URL}\n`);

  // Health
  const health = await json('/api/health');
  assert.equal(health.res.status, 200, 'health status');
  assert.equal(health.body.status, 'ok', 'health body');
  console.log('✅ GET /api/health');

  const ready = await json('/api/ready');
  assert.equal(ready.res.status, 200, 'ready status');
  console.log('✅ GET /api/ready');

  // Auth
  const login = await json('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'analyst@locatium.in', password: 'sas@123456789' }),
  });
  assert.equal(login.res.status, 200, 'login status');
  assert.ok(login.body.accessToken, 'access token');
  const authHeader = { Authorization: `Bearer ${login.body.accessToken}` };
  console.log('✅ POST /api/auth/login');

  // Features
  const search = await json('/api/features/search?keyword=gurgaon&limit=3');
  assert.equal(search.res.status, 200);
  assert.ok(Array.isArray(search.body.features), 'features array');
  console.log(`✅ GET /api/features/search (${search.body.features.length} results)`);

  // Analysis
  const score = await json('/api/analysis/score-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 28.45, lng: 76.9, sector: 'industrial' }),
  });
  assert.equal(score.res.status, 200);
  assert.ok(score.body.overallScore >= 0, 'overall score');
  assert.equal(score.body.method, 'heuristic', 'scoring method');
  assert.ok(score.body.model_version, 'model version');
  console.log(`✅ POST /api/analysis/score-location (overall=${score.body.overallScore}, method=${score.body.method})`);

  // Investor
  const opp = await json('/api/investor/opportunities?sector=industrial&limit=3');
  assert.equal(opp.res.status, 200);
  assert.ok(opp.body.opportunities?.length > 0, 'opportunities');
  console.log(`✅ GET /api/investor/opportunities (${opp.body.opportunities.length} zones)`);

  const reports = await json('/api/investor/reports?limit=5');
  assert.equal(reports.res.status, 200);
  assert.ok(Array.isArray(reports.body.reports), 'reports array');
  console.log(`✅ GET /api/investor/reports (${reports.body.reports.length} reports)`);

  // Portal
  const stats = await json('/api/portal/stats', { headers: authHeader });
  assert.equal(stats.res.status, 200);
  assert.ok(typeof stats.body.savedSearchLimit === 'number', 'saved search limit');
  console.log('✅ GET /api/portal/stats');

  // Email report (dev outbox when SMTP not configured)
  const email = await json('/api/investor/email-report', {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: 'stakeholder@example.com',
      zoneId: opp.body.opportunities[0].id,
      sector: 'industrial',
      message: 'Smoke test email',
    }),
  });
  assert.equal(email.res.status, 200);
  assert.equal(email.body.success, true);
  assert.ok(email.body.deliveryMode, 'delivery mode');
  console.log(`✅ POST /api/investor/email-report (${email.body.deliveryMode})`);

  // Admin (default analyst is admin)
  const adminStats = await json('/api/admin/data-analytics', { headers: authHeader });
  assert.equal(adminStats.res.status, 200);
  assert.ok(typeof adminStats.body.reportCount === 'number', 'admin analytics');
  console.log('✅ GET /api/admin/data-analytics');

  const auditLogs = await json('/api/admin/audit-logs?limit=5', { headers: authHeader });
  assert.equal(auditLogs.res.status, 200);
  assert.ok(Array.isArray(auditLogs.body.logs), 'audit logs');
  console.log(`✅ GET /api/admin/audit-logs (${auditLogs.body.logs.length} entries)`);

  console.log('\n🎉 ALL API SMOKE TESTS PASSED\n');
}

run().catch((err) => {
  console.error('\n❌ SMOKE TESTS FAILED:', err.message);
  process.exit(1);
});
