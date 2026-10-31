const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateAcquisitionCost, registrationFee, emi, toSqYd } = require('../src/services/acquisition-cost.service');
const { parseQuery } = require('../src/services/place-search.service');
const { buildPlotSummary, scoreWord } = require('../src/services/plot-summary.service');
const { renderPlotReport } = require('../src/services/plot-report.service');

test('stamp duty follows buyer and urban/rural, on the higher of deal and circle value', () => {
  const base = { area: 100, pricePerSqYd: 10_000 };
  const line = (r) => r.lines.find((l) => l.key === 'stampDuty');
  assert.equal(line(calculateAcquisitionCost({ ...base, buyer: 'man', areaType: 'urban' })).amount, 70_000);
  assert.equal(line(calculateAcquisitionCost({ ...base, buyer: 'woman', areaType: 'urban' })).amount, 50_000);
  assert.equal(line(calculateAcquisitionCost({ ...base, buyer: 'joint', areaType: 'rural' })).amount, 40_000);
  const belowFloor = calculateAcquisitionCost({ ...base, circleRatePerSqYd: 20_000, buyer: 'man', areaType: 'urban' });
  assert.equal(line(belowFloor).amount, 140_000, 'duty charged on circle value when it is higher');
  assert.equal(line(belowFloor).basis, 'circle');
  assert.equal(belowFloor.belowCircleRate, true);
});

test('registration slabs, unit conversion and EMI', () => {
  assert.equal(registrationFee(40_000), 100);
  assert.equal(registrationFee(3_000_000), 25_000);
  assert.equal(registrationFee(90_000_000), 50_000);
  assert.equal(toSqYd(1, 'acre'), 4840);
  assert.equal(Math.round(toSqYd(900, 'sqft')), 100);
  // ₹10 lakh, 10% a year, 10 years ≈ ₹13,215 a month
  assert.equal(Math.round(emi(1_000_000, 10, 10)), 13_215);
  const withLoan = calculateAcquisitionCost({ area: 100, pricePerSqYd: 10_000, withLoan: true });
  assert.ok(withLoan.loan.emi > 0);
  assert.equal(withLoan.loan.upfrontCash, withLoan.total - withLoan.loan.principal);
  assert.throws(() => calculateAcquisitionCost({ area: 0, pricePerSqYd: 1 }));
});

test('place queries understand sectors, plots, hadbast and old names', () => {
  assert.deepEqual(
    { s: parseQuery('Sector 46 Gurgaon').sector, p: parseQuery('Sector 46 Gurgaon').phrase },
    { s: '46', p: 'gurugram' }
  );
  const plot = parseQuery('plot no. 379, sec 18');
  assert.equal(plot.plot, '379');
  assert.equal(plot.sector, '18');
  assert.equal(parseQuery('hadbast 116 bawal').hadbast, '116');
  assert.equal(parseQuery('hadbast 116 bawal').phrase, 'bawal');
});

const sample = {
  overallScore: 64,
  scores: { environmentalRisk: 28 },
  location: { lat: 28.44, lng: 76.9, sector: 'industrial' },
  zoning: { insideHsiidc: false },
  details: {
    accessibility: { metrics: { nearestRoadKm: 0.36, nearestRailKm: 0.13, nearestAirportKm: 23.8, nearestMunicipalBoundaryKm: 0.09 } },
    infrastructure: { metrics: { hospitals: 25, schools: 23 } },
    environmentalRisk: { metrics: { nearestForestKm: 2.1, nearestWaterBodyKm: 0.24, nearestLowLyingAreaKm: 2.4 } },
    zoneCompatibility: { metrics: { nearestIndustrialZoneKm: 5.4 } },
  },
  landValue: { estimatedPerSqYardInr: 31786, circleRatePerSqYardInr: 22203, circleRateEffectiveFrom: '2026-04-01', district: 'Gurgaon', confidence: 'low', comparableSampleCount: 1 },
};

test('plot summary is plain, bilingual and built only from measured values', () => {
  assert.equal(scoreWord(80), 'good');
  assert.equal(scoreWord(60), 'average');
  assert.equal(scoreWord(30), 'weak');
  const en = buildPlotSummary(sample, { lang: 'en' });
  const hi = buildPlotSummary(sample, { lang: 'hi' });
  assert.equal(en.scoreLabel, 'Average');
  assert.equal(hi.scoreLabel, 'ठीक-ठाक');
  assert.ok(en.good.some((g) => g.includes('Main road 360 m')), 'sub-km distances in metres');
  assert.ok(en.watch.some((w) => w.includes('Forest land 2.1 km')));
  assert.equal(en.good.length, hi.good.length, 'both languages say the same things');
  assert.equal(en.watch.length, hi.watch.length);
  assert.equal(en.checklist.length, 9);
  assert.ok(en.checklist.every((c) => c.title && c.detail));
  assert.ok(en.land.source.verifyUrl.startsWith('https://'));
});

test('plot report renders a PDF in both languages', async () => {
  for (const lang of ['en', 'hi']) {
    const buf = await renderPlotReport(buildPlotSummary(sample, { lang }), {
      cost: calculateAcquisitionCost({ area: 200, pricePerSqYd: 31786, withLoan: true }),
      place: 'Harsaru, Gurugram',
    });
    assert.equal(buf.subarray(0, 4).toString(), '%PDF');
    assert.ok(buf.length > 5000);
  }
});
