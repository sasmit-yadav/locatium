require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const BASE = `http://localhost:${process.env.PORT || 3002}`;
// Password of the two QA accounts this script signs in as (never hardcode it).
const PW = process.env.QA_USER_PASSWORD;
if (!PW) {
  console.error('Set QA_USER_PASSWORD to the password of the QA accounts.');
  process.exit(1);
}

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const j = await r.json();
  if (!j.accessToken) throw new Error(`login ${email} failed: ${JSON.stringify(j)}`);
  return { token: j.accessToken, id: j.user.id };
}
const H = (t, extra = {}) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...extra });

const findings = [];
function check(label, leaked, detail) {
  console.log(`${leaked ? '🚨 LEAK' : '✅ safe'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (leaked) findings.push(label);
}

(async () => {
  const victim = await login('qa.investor@locatium.local');
  const attacker = await login('qa.attacker@locatium.local');
  console.log(`victim=${victim.id}\nattacker=${attacker.id}\n`);

  const opp = await (await fetch(`${BASE}/api/investor/opportunities?sector=industrial&limit=2`)).json();
  const zoneId = opp.opportunities[0].id;

  // --- victim creates private resources ---
  const mk = async (path, body) => {
    const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: H(victim.token), body: JSON.stringify(body) });
    const j = await r.json();
    return { status: r.status, j };
  };

  const pipe = await mk('/api/portal/pipeline', { zoneId, stage: 'shortlisted', notes: 'VICTIM SECRET NOTE' });
  const pipeId = pipe.j.id || pipe.j.item?.id;
  const pf = await mk('/api/portal/portfolios', { name: 'VICTIM PRIVATE PORTFOLIO', zoneIds: [zoneId], sector: 'industrial' });
  const pfId = pf.j.id || pf.j.portfolio?.id;
  const ss = await mk('/api/portal/saved-searches', { name: 'VICTIM SEARCH', filters: { sector: 'industrial', district: 'Gurugram' } });
  const ssId = ss.j.id || ss.j.search?.id;
  const fav = await mk('/api/portal/favorites', { zoneId, notes: 'VICTIM FAV NOTE' });
  const favId = fav.j.id || fav.j.favorite?.id;
  const rep = await fetch(`${BASE}/api/investor/generate-report`, {
    method: 'POST', headers: H(victim.token), body: JSON.stringify({ zoneId, sector: 'industrial' }),
  });
  const repJson = await rep.json().catch(() => ({}));
  const reportId = repJson.reportId || repJson.report?.id || repJson.id;
  console.log(`created: pipeline=${pipeId} portfolio=${pfId} search=${ssId} favorite=${favId} report=${reportId}\n`);

  const asAttacker = (path, opts = {}) => fetch(`${BASE}${path}`, { headers: H(attacker.token), ...opts });

  // --- list endpoints must not include the victim's rows ---
  for (const [label, path, needle] of [
    ['portal/pipeline list', '/api/portal/pipeline', 'VICTIM SECRET NOTE'],
    ['portal/portfolios list', '/api/portal/portfolios', 'VICTIM PRIVATE PORTFOLIO'],
    ['portal/saved-searches list', '/api/portal/saved-searches', 'VICTIM SEARCH'],
    ['portal/favorites list', '/api/portal/favorites', 'VICTIM FAV NOTE'],
    ['investor/reports list', '/api/investor/reports?limit=50', reportId || '__none__'],
  ]) {
    const body = await (await asAttacker(path)).text();
    check(label, needle !== '__none__' && body.includes(needle));
  }

  // --- direct object access by id ---
  const probes = [
    ['GET report by id', `/api/investor/reports/${reportId}/download`, {}],
    ['DELETE victim pipeline item', `/api/portal/pipeline/${pipeId}`, { method: 'DELETE' }],
    ['DELETE victim portfolio', `/api/portal/portfolios/${pfId}`, { method: 'DELETE' }],
    ['DELETE victim saved search', `/api/portal/saved-searches/${ssId}`, { method: 'DELETE' }],
    ['DELETE victim favorite', `/api/portal/favorites/${favId}`, { method: 'DELETE' }],
  ];
  for (const [label, path, opts] of probes) {
    if (/undefined/.test(path)) { console.log(`⚠️  skip ${label} (no id)`); continue; }
    const r = await asAttacker(path, opts);
    check(label, r.status >= 200 && r.status < 300, `status ${r.status}`);
  }

  // --- victim's rows must still be intact after the attacker's attempts ---
  const after = await (await fetch(`${BASE}/api/portal/pipeline`, { headers: H(victim.token) })).json();
  check('victim pipeline survived attacker DELETE', (after.items || []).length === 0, `${(after.items || []).length} items left`);

  // --- assistant memory isolation ---
  await fetch(`${BASE}/api/assistant/memory`, { method: 'PUT', headers: H(victim.token), body: JSON.stringify({ state: { district: 'VICTIMDISTRICT' } }) });
  const mem = await (await asAttacker('/api/assistant/memory')).text();
  check('assistant memory isolation', mem.includes('VICTIMDISTRICT'));

  console.log(`\n${findings.length ? `🚨 ${findings.length} LEAK(S): ${findings.join(', ')}` : '✅ No cross-user leaks found'}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
