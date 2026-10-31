const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeOpportunityV3,
  budgetFitsInr,
  nearMeFits,
  riskFitsV3,
  verdictFromScore,
  sectorMatchScore,
} = require('../src/services/investor-opportunity.engine');

describe('investor-opportunity.engine v3', () => {
  const baseZone = {
    name: 'HSIIDC Gurugram Zone',
    type: 'industrial',
    description: 'HSIIDC industrial boundary',
    areaAcres: 10,
    center: { lat: 28.45, lng: 76.9 },
  };

  const baseAnalysis = {
    overallScore: 70,
    scores: {
      infrastructure: 75,
      accessibility: 68,
      environmentalRisk: 62,
      zoneCompatibility: 80,
    },
  };

  test('computeOpportunityV3 blends v3 composite with investor components', () => {
    const landValue = { estimatedPerSqYardInr: 12000, roiProxy: 0.2, method: 'circle_rate' };
    const result = computeOpportunityV3(baseZone, baseAnalysis, landValue, 'industrial');
    assert.ok(result.opportunityScore >= 55 && result.opportunityScore <= 95);
    assert.equal(result.scoringVersion, 'investor-v3.2');
    assert.ok(result.components.estimatedLandCostInr > 0);
    assert.ok(result.explain.length >= 2);
  });

  test('budgetFitsInr respects ₹ bands and fail-closes on null', () => {
    assert.equal(budgetFitsInr(40_000_000, 'low'), true);
    assert.equal(budgetFitsInr(60_000_000, 'low'), false);
    assert.equal(budgetFitsInr(60_000_000, 'medium'), true);
    assert.equal(budgetFitsInr(300_000_000, 'medium'), false);
    assert.equal(budgetFitsInr(300_000_000, 'high'), true);
    assert.equal(budgetFitsInr(null, 'low'), false);
  });

  test('nearMeFits filters by haversine radius', () => {
    assert.equal(nearMeFits(baseZone, 28.45, 76.9, 25), true);
    assert.equal(nearMeFits(baseZone, 29.5, 77.5, 25), false);
    assert.equal(nearMeFits(baseZone, null, null, 25), true);
  });

  test('riskFitsV3 gates on environmental suitability', () => {
    const lowRiskAnalysis = { scores: { environmentalRisk: 75 } };
    const highRiskAnalysis = { scores: { environmentalRisk: 25 } };
    assert.equal(riskFitsV3(lowRiskAnalysis, 'low'), true);
    assert.equal(riskFitsV3(highRiskAnalysis, 'low'), false);
    assert.equal(riskFitsV3(highRiskAnalysis, 'high'), true);
  });

  test('verdictFromScore maps thresholds', () => {
    assert.equal(verdictFromScore(80), 'shortlist');
    assert.equal(verdictFromScore(60), 'review');
    assert.equal(verdictFromScore(40), 'hold');
  });

  test('computeCluScore rewards HSIIDC industrial alignment', () => {
    const { computeCluScore } = require('../src/services/investor-opportunity.engine');
    const inside = computeCluScore({ insideHsiidc: true, landUseClass: 'industrial' }, 'industrial');
    const outside = computeCluScore({ insideHsiidc: false, landUseClass: 'agricultural' }, 'industrial');
    assert.ok(inside > outside);
  });

  test('buildKeyRiskLine surfaces forest proximity', () => {
    const { buildKeyRiskLine } = require('../src/services/investor-opportunity.engine');
    const line = buildKeyRiskLine({
      scores: { environmentalRisk: 40 },
      details: { environmentalRisk: { metrics: { nearestForestKm: 0.8 } }, zoneCompatibility: { metrics: {} } },
    });
    assert.match(line, /forest/i);
  });

  test('resolveInvestableArea uses plot median not full estate', () => {
    const { resolveInvestableArea, estimateZoneLandCostInr } = require('../src/services/investor-opportunity.engine');
    const zone = { name: 'HSIIDC Gurugram', areaAcres: 5239, type: 'industrial' };
    const plots = {
      plots: [{ areaSqm: 2000 }, { areaSqm: 2500 }, { areaSqm: 3000 }],
    };
    const investable = resolveInvestableArea(zone, plots, 'industrial');
    assert.equal(investable.source, 'plot_median');
    assert.ok(investable.acres <= 1);
    const cost = estimateZoneLandCostInr(zone, { estimatedPerSqYardInr: 85000 }, investable);
    const fullEstateCost = Math.round(5239 * 4840 * 85000);
    assert.ok(cost < fullEstateCost / 100);
    assert.ok(cost < 300_000_000);
  });

  test('resolveInvestableArea falls back to sector default for large estates', () => {
    const { resolveInvestableArea } = require('../src/services/investor-opportunity.engine');
    const zone = { name: 'HSIIDC Gurugram', areaAcres: 5239, type: 'industrial' };
    const investable = resolveInvestableArea(zone, { plots: [] }, 'industrial');
    assert.equal(investable.source, 'sector_default');
    assert.equal(investable.acres, 2);
  });
});
