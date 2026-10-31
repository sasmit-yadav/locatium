// Parity check: the one-statement feature query must agree with the per-table fan-out
// it replaced, on every field, at a spread of Haryana points.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const path = require('path');
const Module = require('module');

const SERVICE = path.join(__dirname, '..', '..', 'src/services/analysis-scoring.service.js');

// Reach the two internals without exporting them from production code.
const src = require('fs').readFileSync(SERVICE, 'utf8');
const patched = src.replace(
  /module\.exports = \{/,
  'module.exports = { __gatherCombined: gatherLocationFeatures, __gatherFanOut: gatherLocationFeaturesFanOut,'
);
const m = new Module(SERVICE, null);
m.filename = SERVICE;
m.paths = Module._nodeModulePaths(path.dirname(SERVICE));
m._compile(patched, SERVICE);
const svc = m.exports;

const POINTS = [
  [28.45, 76.9], [29.15, 75.7], [30.2, 77.0], [28.9, 77.1], [29.7, 76.95],
  [28.2, 77.3], [29.4, 76.1], [30.7, 76.8], [27.9, 77.0], [29.0, 75.0],
  [28.6, 76.5], [29.95, 76.2],
];

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let mismatches = 0;
  let combinedMs = 0;
  let fanoutMs = 0;

  for (const [lat, lng] of POINTS) {
    const loc = { lat, lng, sector: 'industrial' };

    let t = Date.now();
    const a = await svc.__gatherCombined(pool, loc);
    combinedMs += Date.now() - t;

    t = Date.now();
    const b = await svc.__gatherFanOut(pool, loc);
    fanoutMs += Date.now() - t;

    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    const diffs = keys.filter((k) => {
      const x = a[k];
      const y = b[k];
      if (x === null || y === null) return x !== y;
      if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) > 1e-6;
      return x !== y;
    });

    if (diffs.length) {
      mismatches += 1;
      console.log(`MISMATCH at ${lat},${lng}:`);
      diffs.forEach((k) => console.log(`   ${k}: combined=${a[k]} fanout=${b[k]}`));
    } else {
      console.log(`ok  ${lat},${lng}  (${Object.keys(a).length} fields identical)`);
    }
  }

  console.log(`\ncombined total ${combinedMs}ms  |  fan-out total ${fanoutMs}ms  |  ${(fanoutMs / combinedMs).toFixed(1)}x faster`);
  console.log(mismatches ? `\n${mismatches} POINT(S) DISAGREE` : '\nEvery point agrees on every field');
  await pool.end();
  process.exit(mismatches ? 1 : 0);
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
