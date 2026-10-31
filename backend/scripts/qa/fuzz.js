require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const BASE = `http://localhost:${process.env.PORT || 3002}`;
let token;
const bad = [];

async function probe(label, method, path, opts = {}) {
  const { body, expect = 'client-error', headers } = opts;
  let res, text;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    text = (await res.text()).slice(0, 150);
  } catch (e) {
    bad.push(`${label}: transport ${e.message}`);
    console.log(`TRANSPORT-ERR  ${label} — ${e.message}`);
    return;
  }
  const s = res.status;
  let verdict = 'ok';
  if (s >= 500) verdict = 'SERVER-ERROR';
  else if (expect === 'client-error' && s < 400) verdict = 'ACCEPTED-GARBAGE';
  else if (expect === 'ok' && s >= 400) verdict = 'REJECTED-VALID';
  if (verdict !== 'ok') {
    bad.push(`${label} -> ${s} (${verdict})`);
    console.log(`FAIL  ${label} -> ${s} [${verdict}] ${text}`);
  } else {
    console.log(`ok    ${label} -> ${s}`);
  }
}

const BIG = 'a'.repeat(5000);
const HUGE = 'x'.repeat(1000000);

(async () => {
  const l = await (
    await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'qa.investor@locatium.local', password: process.env.QA_USER_PASSWORD }),
    })
  ).json();
  token = l.accessToken;
  console.log('--- hostile / malformed input: every one must be 4xx, never 5xx ---');

  await probe('score-location: empty body', 'POST', '/api/analysis/score-location', { body: {} });
  await probe('score-location: NaN coords', 'POST', '/api/analysis/score-location', { body: { lat: 'abc', lng: null, sector: 'industrial' } });
  await probe('score-location: outside Haryana', 'POST', '/api/analysis/score-location', { body: { lat: 48.85, lng: 2.35, sector: 'industrial' } });
  await probe('score-location: XSS sector', 'POST', '/api/analysis/score-location', { body: { lat: 28.45, lng: 76.9, sector: '<script>alert(1)</script>' }, expect: 'any' });
  await probe('score-location: broken JSON', 'POST', '/api/analysis/score-location', { body: '{"lat":' });

  await probe('tiles: path traversal', 'GET', '/api/tiles/..%2F..%2Fetc%2Fpasswd/9/362/205.pbf');
  await probe('tiles: SQLi table name', 'GET', '/api/tiles/roads_line%3BDROP%20TABLE%20users/9/362/205.pbf');
  await probe('tiles: absurd zoom', 'GET', '/api/tiles/roads_line/99/1/1.pbf', { expect: 'any' });
  await probe('tiles: negative xy', 'GET', '/api/tiles/roads_line/9/-5/-5.pbf', { expect: 'any' });

  await probe('maps bbox: reversed', 'GET', '/api/maps/administrative?bbox=80,30,70,27', { expect: 'any' });
  await probe('maps bbox: garbage', 'GET', '/api/maps/administrative?bbox=a,b,c,d');
  await probe('maps bbox: missing', 'GET', '/api/maps/administrative');

  await probe('features search: empty', 'GET', '/api/features/search?keyword=', { expect: 'any' });
  await probe('features search: SQLi', 'GET', '/api/features/search?keyword=%27%20OR%201%3D1--', { expect: 'any' });
  await probe('features search: 5k chars', 'GET', `/api/features/search?keyword=${BIG}`, { expect: 'any' });
  await probe('features nearby: huge radius', 'GET', '/api/features/nearby?lat=28.4&lng=76.9&radius=999999999&type=hospitals', { expect: 'any' });
  await probe('features nearby: no coords', 'GET', '/api/features/nearby?type=hospitals');

  await probe('investor opps: limit 1e9', 'GET', '/api/investor/opportunities?sector=industrial&limit=1000000000', { expect: 'any' });
  await probe('investor opps: limit -5', 'GET', '/api/investor/opportunities?sector=industrial&limit=-5', { expect: 'any' });
  await probe('investor opps: unknown district', 'GET', '/api/investor/opportunities?sector=industrial&district=Atlantis', { expect: 'any' });
  await probe('zone-analysis: bogus id', 'GET', '/api/investor/zone-analysis/not_a_table%3A999999');
  await probe('zone-analysis: SQLi id', 'GET', '/api/investor/zone-analysis/hsiidc_boundary%3A1%20OR%201%3D1');

  await probe('pipeline: no zoneId', 'POST', '/api/portal/pipeline', { body: { stage: 'shortlisted' } });
  await probe('pipeline: bad stage', 'POST', '/api/portal/pipeline', { body: { zoneId: 'hsiidc_boundary:19', stage: 'not_a_stage' } });
  await probe('pipeline: 1MB notes', 'POST', '/api/portal/pipeline', { body: { zoneId: 'hsiidc_boundary:19', stage: 'shortlisted', notes: HUGE }, expect: 'any' });
  await probe('saved-search: no name', 'POST', '/api/portal/saved-searches', { body: { filters: {} } });
  await probe('favorites: traversal zoneId', 'POST', '/api/portal/favorites', { body: { zoneId: '../../etc/passwd' } });

  await probe('assistant: empty query', 'POST', '/api/assistant/ask', { body: { query: '' } });
  await probe('assistant: query is object', 'POST', '/api/assistant/ask', { body: { query: { evil: true } } });
  await probe('assistant action: unknown type', 'POST', '/api/assistant/action', { body: { type: 'rm -rf', confirmed: true } });
  await probe('assistant action: unconfirmed mutation', 'POST', '/api/assistant/action', { body: { type: 'addToPipeline', params: { zoneId: 'hsiidc_boundary:19' } }, expect: 'any' });

  await probe('email-report: bad email', 'POST', '/api/investor/email-report', { body: { to: 'not-an-email', zoneId: 'hsiidc_boundary:19', sector: 'industrial' } });
  await probe('email-report: header injection', 'POST', '/api/investor/email-report', { body: { to: 'a@b.com\nBcc: victim@x.com', zoneId: 'hsiidc_boundary:19', sector: 'industrial' } });

  await probe('geocode: empty', 'GET', '/api/geocode/search?q=', { expect: 'any' });
  await probe('public zone card: bogus', 'GET', '/api/public/zones/nope%3A1/card');
  await probe('register: weak password', 'POST', '/api/auth/register', { body: { email: `t${Date.now()}@x.com`, password: '123' } });
  await probe('register: bad email', 'POST', '/api/auth/register', { body: { email: 'nope', password: 'LongEnoughPassword123!' } });
  await probe('login: wrong password', 'POST', '/api/auth/login', { body: { email: 'qa.investor@locatium.local', password: 'wrong' } });
  await probe('refresh: forged token', 'POST', '/api/auth/refresh', { body: { refreshToken: 'aaa.bbb.ccc' } });
  await probe('profile: forged bearer', 'GET', '/api/auth/profile', { headers: { Authorization: 'Bearer aaa.bbb.ccc' } });

  console.log('\n' + (bad.length ? `PROBLEMS (${bad.length}):\n  ` + bad.join('\n  ') : 'every probe behaved correctly'));
})().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
