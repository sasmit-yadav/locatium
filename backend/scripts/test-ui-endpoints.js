/**
 * Exhaustive UI-button → backend endpoint smoke test.
 * Covers every frontend service/action that hits the API.
 *
 * Run: node scripts/test-ui-endpoints.js
 * Requires backend on PORT from .env (default 3002).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert').strict;

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3002}`;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

const results = [];

async function req(method, path, { body, headers, expectStatus } = {}) {
  const started = Date.now();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  const ms = Date.now() - started;
  const ok =
    expectStatus != null
      ? res.status === expectStatus
      : res.status >= 200 && res.status < 300;
  results.push({
    method,
    path,
    status: res.status,
    ms,
    ok,
    error: ok ? null : json.error || json.message || json.code || text.slice(0, 120),
  });
  if (!ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${results[results.length - 1].error}`);
    err.response = { status: res.status, json };
    throw err;
  }
  return { res, json, ms };
}

function pass(label) {
  console.log(`  ✅ ${label}`);
}

async function run() {
  console.log(`\nUI endpoint smoke → ${API_URL}\n`);

  // ── Health / maps chrome ──────────────────────────────────────────
  console.log('Health & maps');
  await req('GET', '/api/health');
  pass('health');
  await req('GET', '/api/ready');
  pass('ready');
  await req('GET', '/api/maps/status');
  pass('maps status');
  await req('GET', '/api/tiles/list');
  pass('tiles list');
  const tile = await fetch(`${API_URL}/api/tiles/district_boundary/9/365/214.pbf?v=mvt-v5`);
  assert.equal(tile.status, 200, 'tile status');
  assert.match(
    tile.headers.get('content-type') || '',
    /application\/(vnd\.mapbox-vector-tile|x-protobuf|octet-stream)/i,
    'tile content type'
  );
  const tileBuf = Buffer.from(await tile.arrayBuffer());
  assert.ok(tileBuf.length > 0, 'tile has bytes');
  results.push({ method: 'GET', path: '/api/tiles/district_boundary/…', status: 200, ms: 0, ok: true });
  pass(`tile district_boundary (${tileBuf.length}b)`);

  // ── Auth ────────────────────────────────────────────────────────────
  console.log('\nAuth');
  const login = TEST_USER_EMAIL && TEST_USER_PASSWORD
    ? await req('POST', '/api/auth/login', {
        body: { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD },
      })
    : await req('POST', '/api/auth/demo');
  assert.ok(login.json.accessToken, 'accessToken');
  const auth = { Authorization: `Bearer ${login.json.accessToken}` };
  pass('login');
  await req('GET', '/api/auth/profile', { headers: auth });
  pass('profile');
  await req('PUT', '/api/auth/profile', {
    headers: auth,
    body: { displayName: 'Demo investor' },
  });
  pass('update profile');

  // ── Search / geocode (GlobalSearch, CommandPalette) ────────────────
  console.log('\nSearch & geocode');
  const search = await req('GET', '/api/features/search?keyword=gurugram&limit=5');
  assert.ok(Array.isArray(search.json.features), 'search features');
  pass(`features search (${search.json.features.length})`);
  await req('GET', '/api/geocode/search?q=Ambala');
  pass('geocode Ambala');

  // ── Map identify (map click → IdentifyPanel) ───────────────────────
  console.log('\nIdentify');
  const identify = await req('POST', '/api/maps/identify', {
    body: {
      lng: 76.98,
      lat: 28.48,
      layerKeys: ['administrative', 'social-infrastructure'],
      extent4326: { xmin: 76.5, ymin: 28.2, xmax: 77.4, ymax: 28.8 },
      width: 1024,
      height: 768,
      dpi: 96,
    },
  });
  assert.ok(identify.json.layers || identify.json.results, 'identify payload');
  pass('maps identify');

  // ── Facility finder / HARSAC / nearby ──────────────────────────────
  console.log('\nFacilities');
  const nearest = await req('POST', '/api/features/nearest-facility', {
    body: {
      lat: 28.415,
      lng: 76.658,
      facility_type: 'social-infrastructure',
      max_distance_km: 5,
    },
  });
  assert.equal(nearest.json.found, true, 'nearest found');
  assert.ok(nearest.json.facility?.name, 'nearest name');
  assert.ok(Array.isArray(nearest.json.facility?.coordinates), 'nearest coordinates');
  pass(`nearest facility: ${nearest.json.facility.name}`);

  await req('GET', '/api/features/nearby?lat=28.45&lng=76.9&radius=3&type=social-infrastructure');
  pass('features nearby');

  const harsac = await req(
    'GET',
    '/api/harsac/multi-nearby?lat=28.45&lng=76.9&radius=5&layers=social-infrastructure,transportation'
  );
  assert.ok(harsac.json.results || harsac.json.features || harsac.json.count != null, 'harsac payload');
  pass('harsac multi-nearby');

  // ── Analysis (IntelligencePanel score) ─────────────────────────────
  console.log('\nAnalysis');
  const score = await req('POST', '/api/analysis/score-location', {
    body: { lat: 28.45, lng: 76.9, sector: 'industrial' },
  });
  assert.ok(typeof score.json.overallScore === 'number', 'overallScore');
  pass(`score-location (${score.json.overallScore})`);

  const forecast = await req('GET', '/api/analysis/forecast?lat=28.45&lng=76.9&sector=industrial');
  assert.ok(forecast.json.horizon === 'current_band', 'forecast horizon');
  pass(`land forecast (${forecast.json.method})`);

  const gap = await req('GET', '/api/analysis/facility-gap?limit=50');
  assert.equal(gap.json.type, 'FeatureCollection');
  pass(`facility-gap (${gap.json.features?.length || 0} zones)`);

  const transparency = await req('GET', '/api/public/transparency');
  assert.ok(transparency.json.scoringVersion, 'transparency scoringVersion');
  pass('public transparency');

  // ── Investor (opportunities, zone analysis, compare, report) ───────
  console.log('\nInvestor');
  const opp = await req('GET', '/api/investor/opportunities?sector=industrial&limit=5');
  assert.ok(opp.json.opportunities?.length > 0, 'opportunities');
  const zoneId = opp.json.opportunities[0].id;
  pass(`opportunities (${opp.json.opportunities.length}) zone=${zoneId}`);

  await req('GET', `/api/investor/zone-analysis/${encodeURIComponent(zoneId)}?sector=industrial`);
  pass('zone-analysis');

  await req('GET', `/api/public/zones/${encodeURIComponent(zoneId)}/card`);
  pass('public zone card');

  const ids = opp.json.opportunities
    .slice(0, 2)
    .map((z) => z.id)
    .join(',');
  await req('GET', `/api/investor/compare-zones?zones=${encodeURIComponent(ids)}&sector=industrial`);
  pass('compare-zones');

  // generate-report — frontend uses POST and expects a PDF blob
  const reportRes = await fetch(
    `${API_URL}/api/investor/generate-report?zoneId=${encodeURIComponent(zoneId)}&sector=industrial`,
    { method: 'POST', headers: auth }
  );
  assert.equal(reportRes.status, 200, `generate-report status ${reportRes.status}`);
  const reportBuf = Buffer.from(await reportRes.arrayBuffer());
  assert.ok(reportBuf.length > 500, 'pdf has content');
  results.push({
    method: 'POST',
    path: '/api/investor/generate-report',
    status: 200,
    ms: 0,
    ok: true,
  });
  pass(`generate-report PDF (${reportBuf.length}b)`);

  const reports = await req('GET', '/api/investor/reports?limit=5', { headers: auth });
  assert.ok(Array.isArray(reports.json.reports), 'reports list');
  pass(`reports list (${reports.json.reports.length})`);

  if (reports.json.reports[0]?.id) {
    const rid = reports.json.reports[0].id;
    const dl = await fetch(`${API_URL}/api/investor/reports/${encodeURIComponent(rid)}/download`, { headers: auth });
    assert.equal(dl.status, 200, 'download status');
    const buf = Buffer.from(await dl.arrayBuffer());
    assert.ok(buf.length > 100, 'pdf bytes');
    results.push({ method: 'GET', path: `/api/investor/reports/${rid}/download`, status: 200, ms: 0, ok: true });
    pass(`report download (${buf.length}b)`);

    await req('POST', '/api/investor/email-report', {
      headers: auth,
      body: { to: 'stakeholder@example.com', reportId: rid, message: 'UI smoke' },
    });
    pass('email-report by reportId');
  }

  // Zone facilities (Identify → View nearby facilities) — supports table:id and lng/lat
  console.log('\nZone facilities');
  await req('GET', `/api/features/zone-facilities-summary?zoneId=${encodeURIComponent(zoneId)}`);
  pass('zone-facilities-summary (investor zoneId)');
  await req(
    'GET',
    `/api/features/zone-facilities/${encodeURIComponent(zoneId)}/social-infrastructure?sort=distance&limit=10`
  );
  pass('zone-facilities by type');
  await req('GET', '/api/features/zone-facilities-summary?lng=76.9&lat=28.45');
  pass('zone-facilities-summary (map point)');
  await req('GET', '/api/features/zone-facilities/point/social-infrastructure?lng=76.9&lat=28.45&limit=10');
  pass('zone-facilities by type (map point)');

  // Feature bbox (cluster sources)
  console.log('\nFeatures bbox / detail');
  await req('GET', '/api/features/hospitals?bbox=76.5,28.2,77.2,28.8&limit=50');
  pass('features/hospitals bbox');
  await req('GET', '/api/features/statistics');
  pass('features statistics');

  // ── Portal (Projects panel + toolbar share) ────────────────────────
  console.log('\nPortal (projects / share / history)');
  const share = await req('POST', '/api/portal/share', {
    headers: auth,
    body: {
      centerLng: 76.9,
      centerLat: 28.45,
      zoom: 10,
      activeLayers: ['administrative'],
      selectedZoneId: zoneId,
    },
  });
  assert.ok(share.json.token, 'share token');
  pass(`share create (${share.json.token.slice(0, 8)}…)`);
  await req('GET', `/api/portal/share/${share.json.token}`);
  pass('share resolve');

  const saveName = `smoke-${Date.now()}`;
  const saved = await req('POST', '/api/portal/saved-searches', {
    headers: auth,
    body: {
      name: saveName,
      filters: { view: { lng: 76.9, lat: 28.45, zoom: 10 }, activeLayers: ['administrative'] },
    },
  });
  const searchId = saved.json.search?.id || saved.json.id;
  assert.ok(searchId, 'saved search id');
  pass('save search');
  await req('GET', '/api/portal/saved-searches', { headers: auth });
  pass('list searches');
  await req('DELETE', `/api/portal/saved-searches/${searchId}`, { headers: auth });
  pass('delete search');

  const fav = await req('POST', '/api/portal/favorites', {
    headers: auth,
    body: { zoneId, notes: 'smoke bookmark' },
  });
  const favId = fav.json.favorite?.id || fav.json.id;
  assert.ok(favId, 'favorite id');
  pass('add favorite');
  await req('GET', '/api/portal/favorites', { headers: auth });
  pass('list favorites');
  await req('PUT', `/api/portal/favorites/${favId}`, {
    headers: auth,
    body: { notes: 'updated smoke note' },
  });
  pass('update favorite notes');
  await req('DELETE', `/api/portal/favorites/${favId}`, { headers: auth });
  pass('delete favorite');

  await req('POST', '/api/portal/history', {
    headers: auth,
    body: {
      label: 'Smoke analysis',
      sector: 'industrial',
      overallScore: score.json.overallScore,
      lat: 28.45,
      lng: 76.9,
    },
  });
  pass('record history');
  await req('GET', '/api/portal/history', { headers: auth });
  pass('list history');
  await req('GET', '/api/portal/stats', { headers: auth });
  pass('workspace stats');
  await req('GET', '/api/portal/notifications', { headers: auth });
  pass('notifications');
  await req('GET', '/api/assistant/memory', { headers: auth });
  pass('assistant memory');
  await req('DELETE', '/api/portal/history', { headers: auth });
  pass('clear history');

  // ── Admin role boundary (showcase identity must never be admin) ────
  console.log('\nAdmin security');
  for (const path of [
    '/api/admin/layer-status',
    '/api/admin/user-statistics',
    '/api/admin/data-analytics',
    '/api/admin/audit-logs?limit=10',
  ]) {
    await req('GET', path, { headers: auth, expectStatus: 403 });
  }
  pass('investor identity blocked from all admin endpoints');

  // Summary
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'─'.repeat(48)}`);
  console.log(`Passed ${results.filter((r) => r.ok).length}/${results.length} endpoint checks`);
  if (failed.length) {
    console.log('Failures:');
    for (const f of failed) console.log(`  ❌ ${f.method} ${f.path} → ${f.status} ${f.error}`);
    process.exit(1);
  }
  console.log('🎉 All UI-backed endpoints responded successfully\n');
}

run().catch((err) => {
  console.error('\n❌ FAILED:', err.message);
  if (err.response?.json) {
    console.error(JSON.stringify(err.response.json, null, 2).slice(0, 500));
  }
  process.exit(1);
});
