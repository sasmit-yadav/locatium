const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildScoreInsights } = require('../src/services/score-insights.service');

describe('score-insights land pricing', () => {
  const base = {
    overallScore: 72,
    scores: {
      infrastructure: 70,
      accessibility: 68,
      environmentalRisk: 60,
      zoneCompatibility: 70,
    },
    details: {
      infrastructure: { metrics: { hospitals: 2, schools: 3, civicFacilities: 1, iti: 0 } },
      accessibility: { metrics: { nearestRoadKm: 1.2, nearestRailKm: 8, nearestAirportKm: 40, nearestMetroKm: 12 } },
      environmentalRisk: { metrics: {} },
      zoneCompatibility: { metrics: { sector: 'industrial', waterNetworkWithin2Km: 1, powerAssetsWithin3Km: 1, roadsWithin3Km: 10 } },
    },
    location: { lat: 28.45, lng: 76.9, sector: 'industrial' },
    method: 'heuristic',
  };

  test('surfaces gov floor + market comps in strengths', () => {
    const insights = buildScoreInsights({
      ...base,
      landValue: {
        estimatedPerSqYardInr: 25000,
        circleRatePerSqYardInr: 20000,
        marketAvailable: true,
        comparableMedianPerSqYardInr: 28000,
        comparableSampleCount: 5,
        circleRateEffectiveFrom: '2026-04-01',
        confidence: 'high',
        marketPremiumVsFloor: 0.25,
        method: 'comparable_blend',
      },
    });
    assert.ok(insights.strengths.some((s) => /Land pricing/i.test(s) && /gov floor/i.test(s)));
    assert.match(insights.summary, /Land pricing/i);
    assert.ok(insights.opportunities.some((s) => /above gov floor/i.test(s)));
  });

  test('cautions when comps missing', () => {
    const insights = buildScoreInsights({
      ...base,
      landValue: {
        estimatedPerSqYardInr: 15000,
        circleRatePerSqYardInr: 15000,
        marketAvailable: false,
        method: 'circle_rate',
        confidence: 'medium',
        circleRateEffectiveFrom: '2026-04-01',
      },
    });
    assert.ok(insights.cautions.some((s) => /Market comps unavailable/i.test(s)));
  });

  test('cautions on sector proxy', () => {
    const insights = buildScoreInsights({
      ...base,
      landValue: {
        estimatedPerSqYardInr: 12000,
        circleRatePerSqYardInr: 12000,
        method: 'circle_rate_sector_proxy',
        circleRateSector: 'commercial',
        marketAvailable: false,
        confidence: 'low',
      },
    });
    assert.ok(insights.cautions.some((s) => /haircut/i.test(s)));
  });
});
