const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  median,
  percentile,
  distanceWeightedMean,
  compsBlendWeight,
  confidenceFrom,
  expandDistrictNames,
  trimIqrRows,
} = require('../src/services/land-value.service');
const {
  budgetFitsInr,
  estimateAcquisitionCosts,
  buildFinancialPreview,
  OPPORTUNITY_VERSION,
} = require('../src/services/investor-opportunity.engine');

describe('land-value pure helpers', () => {
  test('median and percentile', () => {
    assert.equal(median([1, 2, 3]), 2);
    assert.equal(percentile([10, 20, 30, 40, 50], 0.5), 30);
    assert.ok(percentile([10, 20, 30, 40, 50], 0.1) <= 20);
  });

  test('trimIqrRows keeps row association', () => {
    const rows = [
      { price: 10, distanceKm: 1 },
      { price: 11, distanceKm: 2 },
      { price: 12, distanceKm: 3 },
      { price: 13, distanceKm: 4 },
      { price: 14, distanceKm: 5 },
      { price: 15, distanceKm: 6 },
      { price: 16, distanceKm: 7 },
      { price: 1000, distanceKm: 0.1 },
    ];
    const trimmed = trimIqrRows(rows);
    assert.ok(!trimmed.some((r) => r.price === 1000));
    assert.ok(trimmed.every((r) => Number.isFinite(r.distanceKm)));
  });

  test('distanceWeightedMean favors nearer comps', () => {
    const mean = distanceWeightedMean([
      { price: 100, distanceKm: 0.5 },
      { price: 200, distanceKm: 9 },
    ]);
    assert.ok(mean < 150);
    assert.ok(mean > 100);
  });

  test('compsBlendWeight scales with n', () => {
    assert.equal(compsBlendWeight(0), 0);
    assert.equal(compsBlendWeight(1), 0.25);
    assert.equal(compsBlendWeight(2), 0.4);
    assert.equal(compsBlendWeight(3), 0.6);
    assert.equal(compsBlendWeight(10), 0.6);
  });

  test('confidenceFrom demotes sector proxy and vintage lag', () => {
    assert.equal(
      confidenceFrom({
        circleCount: 50,
        compsCount: 10,
        method: 'comparable_blend',
        tehsilMatched: true,
        sectorProxy: true,
      }),
      'low'
    );
    assert.equal(
      confidenceFrom({
        circleCount: 50,
        compsCount: 10,
        method: 'comparable_blend',
        tehsilMatched: true,
        vintageLagYears: 2,
      }),
      'low'
    );
    assert.equal(
      confidenceFrom({
        circleCount: 50,
        compsCount: 10,
        method: 'comparable_blend',
        tehsilMatched: true,
      }),
      'high'
    );
  });

  test('expandDistrictNames aliases Gurugram', () => {
    const names = expandDistrictNames('Gurgaon');
    assert.ok(names.includes('Gurugram'));
    assert.ok(names.includes('Gurgaon'));
  });
});

describe('budget + acquisition industry rules', () => {
  test('budgetFitsInr fail-closed when cost missing', () => {
    assert.equal(budgetFitsInr(null, 'low'), false);
    assert.equal(budgetFitsInr(undefined, 'medium'), false);
    assert.equal(budgetFitsInr(40_000_000, 'low'), true);
    assert.equal(budgetFitsInr(60_000_000, 'low'), false);
  });

  test('estimateAcquisitionCosts applies stamp+registration', () => {
    const acq = estimateAcquisitionCosts(100_000_000);
    assert.equal(acq.stampDutyInr, 5_000_000);
    assert.equal(acq.registrationInr, 1_000_000);
    assert.equal(acq.allInLandCostInr, 106_000_000);
  });

  test('buildFinancialPreview includes all-in land in capex', () => {
    const zone = { name: 'T', type: 'industrial', description: 'hsiidc', areaAcres: 2 };
    const landValue = { estimatedPerSqYardInr: 20000, circleRatePerSqYardInr: 15000 };
    const preview = buildFinancialPreview(zone, landValue, 'industrial');
    assert.ok(preview.acquisition);
    assert.ok(preview.allInLandCostInr > preview.landCostInr);
    assert.ok(preview.totalCapexInr >= preview.allInLandCostInr);
    assert.equal(OPPORTUNITY_VERSION, 'investor-v3.2');
  });
});
