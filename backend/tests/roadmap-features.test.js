const test = require('node:test');
const assert = require('node:assert/strict');

const { forecastFromEstimate } = require('../src/services/land-forecast.service');
const { annualisedSteps, maxHorizonFor, usableVintages } = require('../src/services/land-trend.service');
const { classifyGap, gapScoreFromCounts, toFeature } = require('../src/services/facility-gap.service');
const { validateAction, describe, CATALOG } = require('../src/services/assistant-actions.service');
const { narrativeText } = require('../src/services/investor-report.service');
const { publicAssistantStats } = require('../src/services/public-transparency.service');

test('forecastFromEstimate returns the current band only, with forward numbers delegated', () => {
  const out = forecastFromEstimate(
    {
      method: 'comparable_blend',
      estimatedPerSqYardInr: 12000,
      estimatedLowPerSqYardInr: 9000,
      estimatedHighPerSqYardInr: 16000,
      confidence: 'medium',
      district: 'Gurugram',
      note: 'Blend of floor and comps.',
    },
    { lat: 28.4, lng: 77.0, sector: 'industrial' }
  );
  assert.equal(out.horizon, 'current_band');
  assert.equal(out.p10, 9000);
  assert.equal(out.p50, 12000);
  assert.equal(out.p90, 16000);
  // The band itself must never carry a projection; forward numbers live in `outlook`,
  // which is only attached when the caller asks for a horizon.
  assert.equal(out.outlook, undefined);
  assert.match(out.note, /rather than modelling the market/i);
});

test('land outlook refuses to compound a single revision into a long horizon', () => {
  // One measurable revision is one data point. Projecting it five years out turns that
  // into a multiple-of-today claim no caveat text can make honest.
  assert.equal(maxHorizonFor([{}]), 1);
  assert.equal(maxHorizonFor([{}, {}]), 3);
  assert.equal(maxHorizonFor([{}, {}, {}]), 5);
});

test('land outlook ignores vintages too thin to be a district median', () => {
  const series = [
    { effectiveFrom: '2023-04-01', medianRateInr: 1601, sampleCount: 2 },
    { effectiveFrom: '2025-04-01', medianRateInr: 10800, sampleCount: 2 },
    { effectiveFrom: '2026-04-01', medianRateInr: 11000, sampleCount: 5000 },
  ];
  // Two-row vintages are noise, not a median: dropping them leaves too little to trend.
  const usable = usableVintages(series);
  assert.equal(usable.length, 1);
  assert.equal(usable[0].sampleCount, 5000);
});

test('land outlook skips steps whose vintages cover wildly different populations', () => {
  // A 2-row import followed by a 5,000-row import measures coverage, not a price revision.
  const steps = annualisedSteps([
    { effectiveFrom: '2023-04-01', medianRateInr: 1000, sampleCount: 40 },
    { effectiveFrom: '2025-04-01', medianRateInr: 1200, sampleCount: 5000 },
  ]);
  assert.equal(steps.length, 0);

  const comparable = annualisedSteps([
    { effectiveFrom: '2023-04-01', medianRateInr: 1000, sampleCount: 400 },
    { effectiveFrom: '2025-04-01', medianRateInr: 1210, sampleCount: 500 },
  ]);
  assert.equal(comparable.length, 1);
  assert.equal(comparable[0].changePct, 21);
  assert.equal(comparable[0].annualisedPct, 10);
});

test('forecastFromEstimate reports insufficient_data without fabricating prices', () => {
  const out = forecastFromEstimate({ method: 'insufficient_data', reason: 'district_unknown' });
  assert.equal(out.method, 'insufficient_data');
  assert.equal(out.p50, null);
});

test('facility gap score is high when hospitals and schools are absent', () => {
  assert.equal(classifyGap(0), 'severe');
  assert.equal(classifyGap(2), 'gap');
  assert.equal(classifyGap(12), 'served');
  assert.ok(gapScoreFromCounts(0, 0) > gapScoreFromCounts(6, 6));
  const feature = toFeature({
    zone_id: 'hsiidc_boundary:1',
    district: 'Gurugram',
    lat: 28.4,
    lng: 76.9,
    hospitals_5km: 0,
    schools_5km: 1,
  });
  assert.equal(feature.properties.gapClass, 'gap');
  assert.equal(feature.geometry.coordinates[0], 76.9);
});

test('mutating copilot actions always require confirmation', () => {
  for (const type of Object.keys(CATALOG).filter((key) => !CATALOG[key].readOnly)) {
    const verdict = validateAction({ type, params: {} });
    assert.equal(verdict.ok, true, type);
    assert.equal(verdict.needsConfirmation, true, type);
    assert.ok(describe(type).confirm);
  }
});

test('PDF narrative helper prefers memo then summary then insights', () => {
  assert.match(
    narrativeText({
      analysis: { narrative: { memo: 'LLM memo', executiveSummary: 'short' } },
    }),
    /LLM memo/
  );
  assert.equal(
    narrativeText({ analysis: { insights: { summary: 'Rule brief' } } }),
    'Rule brief'
  );
  assert.equal(narrativeText({ analysis: {} }), null);
});

test('public assistant stats omit token spend', () => {
  const publicStats = publicAssistantStats({
    requests: 4,
    fallbackRatePct: 25,
    cache: { hitRatePct: 10 },
    latencyMs: { total: { p50: 800 } },
    tokens: { prompt: 9999, completion: 1111 },
  });
  assert.equal(publicStats.requests, 4);
  assert.equal(publicStats.tokens, undefined);
});
