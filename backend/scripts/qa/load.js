require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const BASE = `http://localhost:${process.env.PORT || 3002}`;

const PINS = [
  [28.45, 76.9], [29.15, 75.7], [30.2, 77.0], [28.9, 77.1], [29.7, 76.95],
  [28.2, 77.3], [29.4, 76.1], [30.7, 76.8], [27.9, 77.0], [29.0, 75.0],
];

async function timed(fn) {
  const t = Date.now();
  try {
    const status = await fn();
    return { ms: Date.now() - t, status };
  } catch (e) {
    return { ms: Date.now() - t, status: 'ERR', err: e.message };
  }
}

function stats(rows, label) {
  const ok = rows.filter((r) => r.status === 200);
  const fail = rows.filter((r) => r.status !== 200);
  const times = ok.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => (times.length ? times[Math.min(times.length - 1, Math.floor(times.length * p))] : 0);
  console.log(
    `${label.padEnd(34)} ok=${ok.length}/${rows.length}  p50=${pct(0.5)}ms  p95=${pct(0.95)}ms  max=${times[times.length - 1] || 0}ms` +
      (fail.length ? `  FAILURES: ${[...new Set(fail.map((f) => f.status + (f.err ? ':' + f.err : '')))].join(', ')}` : '')
  );
  return fail.length;
}

(async () => {
  const l = await (
    await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'qa.investor@locatium.local', password: process.env.QA_USER_PASSWORD }),
    })
  ).json();
  const auth = { Authorization: `Bearer ${l.accessToken}`, 'Content-Type': 'application/json' };
  let failures = 0;

  // 1. Concurrent map scoring — the heaviest PostGIS path the UI can trigger.
  const scores = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      timed(async () => {
        const [lat, lng] = PINS[i % PINS.length];
        const r = await fetch(`${BASE}/api/analysis/score-location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng, sector: 'industrial' }),
        });
        await r.arrayBuffer();
        return r.status;
      })
    )
  );
  failures += stats(scores, '20x concurrent score-location');

  // 2. Concurrent vector tiles — what a pan/zoom burst looks like.
  const tiles = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      timed(async () => {
        const r = await fetch(`${BASE}/api/tiles/roads_line/11/${1455 + (i % 12)}/${840 + (i % 9)}.pbf`);
        await r.arrayBuffer();
        return r.status;
      })
    )
  );
  failures += stats(tiles, '40x concurrent vector tiles');

  // 3. Mixed traffic: scoring + tiles + investor + assistant at once.
  const tagged = (tag, p) => p.then((r) => ({ ...r, tag }));
  const mixedAll = await Promise.all([
    ...Array.from({ length: 6 }, (_, i) =>
      tagged('score', timed(async () => {
        const [lat, lng] = PINS[i];
        const r = await fetch(`${BASE}/api/analysis/score-location`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng, sector: 'commercial' }),
        });
        await r.arrayBuffer();
        return r.status;
      }))
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      tagged('tiles', timed(async () => {
        const r = await fetch(`${BASE}/api/tiles/village_boundary/12/${2918 + i}/1709.pbf`);
        await r.arrayBuffer();
        return r.status;
      }))
    ),
    ...Array.from({ length: 4 }, () =>
      tagged('investor', timed(async () => {
        const r = await fetch(`${BASE}/api/investor/opportunities?sector=industrial&limit=5`, { headers: auth });
        await r.arrayBuffer();
        return r.status;
      }))
    ),
    ...Array.from({ length: 3 }, () =>
      tagged('assistant', timed(async () => {
        const r = await fetch(`${BASE}/api/assistant/ask`, {
          method: 'POST', headers: auth,
          body: JSON.stringify({ query: 'score this pin', lat: 28.45, lng: 76.9, sector: 'industrial' }),
        });
        await r.arrayBuffer();
        return r.status;
      }))
    ),
  ]);
  for (const tag of ['score', 'tiles', 'investor', 'assistant']) {
    failures += stats(mixedAll.filter((r) => r.tag === tag), `  mixed burst / ${tag}`);
  }

  const ready = await fetch(`${BASE}/api/ready`);
  console.log(`\nAPI still healthy after load: ${ready.status === 200 ? 'yes' : 'NO (' + ready.status + ')'}`);
  console.log(failures ? `\n${failures} request failure(s) under load` : '\nNo failures under load');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
