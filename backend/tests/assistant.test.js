const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractEntities,
  detectIntents,
  detectDistrict,
  parseBudgetInr,
} = require('../src/services/assistant-nlu.service');
const { ruleBasedAnswer, buildMapActions, buildFollowUps } = require('../src/services/assistant.service');

test('NLU handles Hinglish and typos', () => {
  const a = extractEntities('ye jagah industrial ke liye kaisi hai?', {}, { lat: 28.4, lng: 76.9 });
  assert.ok(a.intents.includes('score'));

  const b = extractEntities('gurgaon me best warehouse under 5 cr', {});
  assert.equal(b.district, 'Gurugram');
  assert.equal(b.budgetInr, 50000000);
  assert.ok(b.intents.includes('opportunities'));

  assert.equal(detectDistrict('zones in gurgoan'), 'Gurugram');
  assert.equal(parseBudgetInr('budget 50 lakh'), 5000000);
});

test('NLU multi-intent and session follow-up', () => {
  const intents = detectIntents('best zones and land rate in faridabad', {});
  assert.ok(intents.includes('opportunities') || intents.includes('land'));

  const follow = extractEntities('same for sonipat', {
    lastIntent: 'opportunities',
    district: 'Gurugram',
    budgetInr: 3e7,
  });
  assert.equal(follow.district, 'Sonipat');
});

test('clarifies when ask is too vague', () => {
  const e = extractEntities('find zones', {}, {});
  assert.equal(e.clarification.needed, true);
});

test('rule-based answer uses grounding', () => {
  const context = {
    primaryIntent: 'score',
    intents: ['score', 'land'],
    sector: 'industrial',
    scoredLocation: {
      overallScore: 72,
      scoringVersion: 'v3-investment',
      scores: { infrastructure: 80, accessibility: 70, environmentalRisk: 65, zoneCompatibility: 75 },
      distancesKm: { highway: 1.2, metro: 4.5 },
      insights: { verdict: 'Moderate opportunity', summary: 'Solid corridor access.', cautions: ['Check CLU'] },
      landValue: { estimatedPerSqYardInr: 12000, circleRatePerSqYardInr: 9000, district: 'Gurugram' },
    },
    opportunities: [],
    notes: [],
  };
  const text = ruleBasedAnswer('score this', context);
  assert.match(text, /72\/100/);
  assert.match(text, /12,000/);
  assert.match(text, /highway/);
});

test('map actions and follow-ups', () => {
  const actions = buildMapActions({
    opportunities: [{ id: 'z1', name: 'IMT Manesar', center: { lng: 76.9, lat: 28.35 }, opportunityScore: 70 }],
    mapHighlights: [{ id: 'z1', rank: 1 }],
    mapPoint: null,
    scoredLocation: null,
  });
  assert.ok(actions.some((a) => a.type === 'flyTo'));
  assert.ok(actions.some((a) => a.type === 'openInvestor'));

  const chips = buildFollowUps({
    scoredLocation: { overallScore: 70, landValue: { district: 'Gurugram' } },
    sector: 'industrial',
    opportunities: [{ id: 1 }],
    district: 'Gurugram',
  });
  assert.ok(chips.length >= 2);
});
