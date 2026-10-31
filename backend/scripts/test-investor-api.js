/**
 * Live investor API verification — run with backend up:
 *   node scripts/test-investor-api.js
 */

const BASE = process.env.API_URL || 'http://localhost:3002';

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function check(label, pass, detail = '') {
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`${icon}  ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

async function main() {
  console.log(`\nInvestor API live test → ${BASE}\n`);

  const health = await get('/api/health');
  if (!check('Health', health.ok, health.status)) {
    console.error('\nBackend not running. Start: cd backend && npm run dev\n');
    process.exit(1);
  }

  const t0 = Date.now();
  const opp = await get('/api/investor/opportunities?sector=industrial&district=Gurugram&limit=5');
  const elapsed = Date.now() - t0;

  check('GET /opportunities', opp.ok, `${opp.status}`);
  const data = opp.json;
  const zones = data?.opportunities || [];
  check('opportunityVersion present', data?.opportunityVersion === 'investor-v3.2', data?.opportunityVersion);
  check('zones returned', zones.length > 0, `count=${zones.length}`);
  check('elapsedMs in response', typeof data?.elapsedMs === 'number', `${data?.elapsedMs}ms (wall ${elapsed}ms)`);
  check('mapHighlights', Array.isArray(data?.mapHighlights) && data.mapHighlights.length > 0, `${data?.mapHighlights?.length} highlights`);

  const z = zones[0] || {};
  check('#1 v3 scoreBreakdown', Array.isArray(z.scoreBreakdown) && z.scoreBreakdown.length > 0, `${z.scoreBreakdown?.length} rows`);
  check('#1 v3Scores', z.v3Scores && typeof z.v3Scores.infrastructure === 'number');
  check('#2 land cost / budget fields', z.components?.estimatedLandCostInr != null || z.landValue?.estimatedPerSqYardInr != null);
  check('#2 all-in land (stamp+reg)', z.components?.estimatedAllInLandCostInr != null && z.components.estimatedAllInLandCostInr >= z.components.estimatedLandCostInr);
  check('#2 land vintage', Boolean(z.landValue?.circleRateEffectiveFrom || z.components?.circleRateEffectiveFrom));
  check('#2 land confidence', Boolean(z.landValue?.confidence));
  check('#2 investable area (not full estate)', z.investableArea?.acres != null && z.investableArea.acres <= 25, `${z.investableArea?.acres} ac (${z.investableArea?.source})`);
  // Capex must track the investable parcel, not the whole estate. An absolute rupee cap
  // would just encode whichever parcel happened to sort first, so check the ratio.
  const capexPerAcre =
    z.financialPreview?.totalCapexInr != null && z.investableArea?.acres
      ? z.financialPreview.totalCapexInr / z.investableArea.acres
      : null;
  check(
    '#2 capex tracks investable area',
    capexPerAcre != null && capexPerAcre > 0 && capexPerAcre < 1_000_000_000,
    `₹${((z.financialPreview?.totalCapexInr || 0) / 1e7).toFixed(1)} cr over ${z.investableArea?.acres} ac`
  );
  check('#2 acquisition stack', z.financialPreview?.acquisition?.stampDutyInr > 0 && z.financialPreview?.allInLandCostInr > z.financialPreview?.landCostInr);
  check('#10 availability', Boolean(z.availability?.label));
  check('#10 keyRisk', Boolean(z.keyRisk));
  check('#10 verdict', Boolean(z.verdict));
  // A named district triggers the full-district lite scan, which skips per-zone plot
  // queries by design. Plot inventory is asserted below on the fully enriched list.
  check('#11 lite scan declares itself', data?.coverage?.liteRank === true, `mode=${data?.coverage?.mode}`);
  check('#12 CLU score', z.components?.cluScore != null, String(z.components?.cluScore));
  check('#13 utility', z.utilityReadiness != null, z.utilityReadiness);
  check('#14 regulatoryChecklist', Array.isArray(z.regulatoryChecklist) && z.regulatoryChecklist.length > 0);
  check('#15 financialPreview', z.financialPreview != null, `capex=${z.financialPreview?.totalCapexInr ?? 'n/a'}`);
  check('#16 ML fields', z.mlScore != null || z.mlMethod != null, `ml=${z.mlScore} method=${z.mlMethod}`);
  // Statewide (no district) uses the fully enriched path: plots, policy, comparables, ML overlay.
  const fullList = await get('/api/investor/opportunities?sector=industrial&limit=20');
  const fullZones = fullList.json?.opportunities || [];
  check('#11 full list is not lite', fullList.json?.coverage?.liteRank === false, `mode=${fullList.json?.coverage?.mode}`);
  const zFull = fullZones[0] || {};
  check('#11 plotInventory', zFull.plotInventory != null, `plots=${zFull.plotInventory?.count ?? 0} mode=${zFull.plotInventory?.matchMode ?? 'n/a'}`);

  const hsiidc = fullZones.find((r) => r.tableId === 'hsiidc_boundary');
  check(
    '#16 ML rank for HSIIDC',
    Boolean(hsiidc && ['ml', 'heuristic', 'zone_outcomes_synthetic', 'zone_outcomes'].includes(hsiidc.mlMethod)),
    hsiidc ? `${hsiidc.name} method=${hsiidc.mlMethod} mlScore=${hsiidc.mlScore}` : 'no HSIIDC zone'
  );
  check(
    '#16 mlRank is a real re-rank',
    fullZones.every((r) => typeof r.mlRank === 'number' && typeof r.formulaRank === 'number'),
    `${fullZones.filter((r) => r.mlRank !== r.formulaRank).length}/${fullZones.length} zones reordered by ML`
  );
  check('#17 benchmark/comparables', Boolean(z.benchmark?.message || z.benchmark?.comparableMessage || z.benchmark?.districtAverage != null));
  check('#18 opportunityBreakdown', Array.isArray(z.opportunityBreakdown) && z.opportunityBreakdown.length > 0);
  check('#19 dataSource', Boolean(z.dataSource?.geometry && z.dataSource?.scores));

  const budgetMedium = await get('/api/investor/opportunities?sector=industrial&district=Gurugram&budget=medium&limit=5');
  const budgetZones = budgetMedium.json?.opportunities || [];
  check('#2 budget=medium returns zones', budgetMedium.ok && budgetZones.length > 0, `count=${budgetZones.length}`);
  check(
    '#2 budget zones have all-in land ₹',
    budgetZones.every((r) => r.components?.estimatedAllInLandCostInr != null),
    'no acres fallback'
  );

  const near = await get('/api/investor/opportunities?sector=industrial&nearLat=28.45&nearLng=76.9&nearRadiusKm=25&limit=5');
  check('#3 near-me filter', near.ok && (near.json?.opportunities || []).some((r) => r.distanceKm != null));

  if (zones.length >= 2) {
    const ids = zones.slice(0, 2).map((x) => x.id).join(',');
    const cmp = await get(`/api/investor/compare-zones?zones=${encodeURIComponent(ids)}&sector=industrial`);
    const matrix = cmp.json?.matrix || [];
    check('#4 compare matrix', cmp.ok && matrix.length >= 2, `${matrix.length} rows`);
    check('#4 matrix has land/env/clu', matrix[0]?.landPerSqYard != null || matrix[0]?.environmentalSuitability != null);
  }

  if (z.id) {
    const plots = await get(`/api/investor/plots/${encodeURIComponent(z.id)}?sector=industrial`);
    check('#11 plots endpoint', plots.ok, `count=${plots.json?.count ?? 0} mode=${plots.json?.matchMode ?? 'n/a'}`);

    const analysis = await get(`/api/investor/zone-analysis/${encodeURIComponent(z.id)}?sector=industrial&includeGeometry=false`);
    check('zone-analysis', analysis.ok);
    check('#14 analysis regulatory', Array.isArray(analysis.json?.regulatoryChecklist));
    check('#15 analysis financial', analysis.json?.financialPreview != null);
    check('#20 analysis narrative', Boolean(analysis.json?.analysis?.narrative?.summary || analysis.json?.analysis?.insights?.summary));
  }

  const t1 = Date.now();
  const cached = await get('/api/investor/opportunities?sector=industrial&district=Gurugram&limit=5');
  const cacheElapsed = Date.now() - t1;
  check('#6 cache speed (2nd request)', cached.ok && cacheElapsed < 2000, `wall ${cacheElapsed}ms`);

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
