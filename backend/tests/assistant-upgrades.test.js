const test = require('node:test');
const assert = require('node:assert/strict');

const { renderContext } = require('../src/services/assistant-context.service');
const { verifyGrounding, extractNumbers } = require('../src/services/assistant-guardrail.service');
const memory = require('../src/services/assistant-memory.service');
const { approxTokens, buildMessages } = require('../src/services/llm/llm-adapter');
const telemetry = require('../src/services/llm/llm-telemetry');

const SAMPLE_CONTEXT = {
  sector: 'industrial',
  district: 'Gurugram',
  budgetInr: 50000000,
  intents: ['opportunities', 'land'],
  scoredLocation: {
    overallScore: 72,
    scoringVersion: 'v3-investment',
    scores: { infrastructure: 80, accessibility: 70, environmentalRisk: 65, zoneCompatibility: 75 },
    distancesKm: { highway: 1.2, metro: 4.5 },
    insights: { verdict: 'Moderate opportunity', summary: 'Solid corridor access.', cautions: ['Check CLU'] },
    landValue: { estimatedPerSqYardInr: 12000, circleRatePerSqYardInr: 9000, district: 'Gurugram' },
  },
  opportunities: [
    {
      id: 'z1',
      name: 'IMT Manesar',
      district: 'Gurugram',
      opportunityScore: 78,
      verdict: 'Shortlist',
      areaAcres: 120,
      landValue: { estimatedPerSqYardInr: 45000 },
      center: { lat: 28.35, lng: 76.9 },
    },
    {
      id: 'z2',
      name: 'Sohna Industrial Estate',
      district: 'Gurugram',
      opportunityScore: 66,
      verdict: 'Review',
      areaAcres: 60,
      center: { lat: 28.24, lng: 77.06 },
    },
  ],
  policies: [{ citation: 'HSIIDC-2015-4.2', excerpt: 'CLU required outside notified estates.' }],
  notes: [],
};

test('context renders compactly and stays within a token budget', () => {
  const out = renderContext(SAMPLE_CONTEXT);
  assert.ok(out.text.includes('IMT Manesar'));
  assert.ok(out.text.includes('#1'), 'zones must be numbered for follow-up references');
  assert.ok(out.text.includes('72/100'));
  // The whole point: far smaller than a raw JSON dump of the same object.
  assert.ok(out.approxTokens < approxTokens(JSON.stringify(SAMPLE_CONTEXT)));
  assert.ok(out.approxTokens < 1400);
});

test('context drops low-priority sections under a tight budget', () => {
  const out = renderContext(SAMPLE_CONTEXT, { tokenBudget: 60 });
  assert.ok(out.dropped.length > 0, 'should report what it dropped');
  assert.ok(out.text.includes('SECTOR'), 'required header survives');
});

test('empty shortlist is stated explicitly so the model cannot invent zones', () => {
  const out = renderContext({ ...SAMPLE_CONTEXT, opportunities: [] });
  assert.match(out.text, /none matched/i);
});

test('guardrail accepts numbers that came from context', () => {
  const { text } = renderContext(SAMPLE_CONTEXT);
  const answer =
    'This pin scores 72/100. IMT Manesar rates 78/100 at about Rs 45,000/sq yd. Circle floor is Rs 9,000.';
  const res = verifyGrounding(answer, text);
  assert.equal(res.severity, 'none', JSON.stringify(res.violations));
  assert.ok(res.ok);
});

test('guardrail blocks a fabricated rupee figure', () => {
  const { text } = renderContext(SAMPLE_CONTEXT);
  const answer = 'IMT Manesar is going for about Rs 87,650/sq yd right now.';
  const res = verifyGrounding(answer, text);
  assert.equal(res.severity, 'block');
  assert.ok(res.violations.some((v) => v.type === 'number' && v.money));
});

test('guardrail blocks a fabricated zone name', () => {
  const { text } = renderContext(SAMPLE_CONTEXT);
  const answer = 'Consider Bawal Industrial Estate as your top pick.';
  const res = verifyGrounding(answer, text);
  assert.equal(res.severity, 'block');
  assert.ok(res.violations.some((v) => v.type === 'zone_name'));
});

test('guardrail tolerates rounding and ignores list markers', () => {
  const { text } = renderContext(SAMPLE_CONTEXT);
  // 45,000 -> "45,000"; list indices 1./2. and "#1" must not trip it.
  const answer = '1. IMT Manesar — 78/100, ~Rs 45,000/sq yd\n2. Sohna Industrial Estate — 66/100';
  const res = verifyGrounding(answer, text);
  assert.notEqual(res.severity, 'block', JSON.stringify(res.violations));
});

test('numeric extraction understands Indian grouping', () => {
  const nums = extractNumbers('Rs 1,23,456 and 12.5 km');
  assert.ok(nums.some((n) => n.value === 123456));
  assert.ok(nums.some((n) => n.value === 12.5));
});

test('memory upgrades a legacy flat session', () => {
  const mem = memory.normalizeMemory({
    lastIntent: 'opportunities',
    sector: 'industrial',
    district: 'Gurugram',
    budgetInr: 3e7,
  });
  assert.equal(mem.v, memory.MEMORY_VERSION);
  assert.equal(mem.state.district, 'Gurugram');
  assert.equal(mem.lastIntent, 'opportunities');
});

test('memory resolves ordinal and numbered references to real zone ids', () => {
  const mem = memory.normalizeMemory({});
  mem.lastResults = [
    { id: 'z1', name: 'IMT Manesar', district: 'Gurugram' },
    { id: 'z2', name: 'Sohna Estate', district: 'Gurugram' },
    { id: 'z3', name: 'Pataudi Park', district: 'Gurugram' },
  ];

  const byHash = memory.resolveReferences('tell me more about #3', mem);
  assert.deepEqual(byHash.zoneIds, ['z3']);

  const byWord = memory.resolveReferences('what about the second one', mem);
  assert.deepEqual(byWord.zoneIds, ['z2']);

  const compare = memory.resolveReferences('compare 1 and 3', mem);
  assert.deepEqual(compare.zoneIds, ['z1', 'z3']);
  assert.match(compare.rewritten, /IMT Manesar/);

  const last = memory.resolveReferences('open the last one', mem);
  assert.deepEqual(last.zoneIds, ['z3']);
});

test('memory ignores bare digits outside comparison phrasing', () => {
  const mem = memory.normalizeMemory({});
  mem.lastResults = [{ id: 'z1', name: 'A' }, { id: 'z2', name: 'B' }];
  const res = memory.resolveReferences('industrial land under 2 crore', mem);
  assert.deepEqual(res.zoneIds, [], 'budget digits must not be read as list references');
});

test('overrides clear carried-forward filters', () => {
  const base = { sector: 'industrial', district: 'Gurugram', budgetInr: 5e7, risk: 'low' };
  const dropBudget = memory.applyOverrides('forget the budget', base);
  assert.equal(dropBudget.state.budgetInr, null);
  assert.ok(dropBudget.cleared.includes('budgetInr'));

  const anyDistrict = memory.applyOverrides('show me any district', base);
  assert.equal(anyDistrict.state.district, null);

  const untouched = memory.applyOverrides('best warehouse options', base);
  assert.equal(untouched.state.district, 'Gurugram');
});

test('rewrite is triggered only for context-dependent turns', () => {
  const mem = { ...memory.normalizeMemory({}), turnCount: 2 };
  assert.equal(memory.needsQueryRewrite('and there?', mem), true);
  assert.equal(memory.needsQueryRewrite('same but cheaper', mem), true);
  assert.equal(memory.needsQueryRewrite('what about it', mem), true);
  assert.equal(
    memory.needsQueryRewrite('best industrial zones in Sonipat under 5 crore', mem),
    false
  );
  // No prior turns → nothing to resolve against.
  assert.equal(memory.needsQueryRewrite('and there?', memory.normalizeMemory({})), false);
});

test('memory update keeps the shortlist addressable', () => {
  const mem = memory.normalizeMemory({});
  const next = memory.updateMemory({
    memory: mem,
    context: { primaryIntent: 'opportunities', sector: 'industrial', district: 'Gurugram' },
    opportunities: SAMPLE_CONTEXT.opportunities,
  });
  assert.equal(next.turnCount, 1);
  assert.equal(next.lastResults.length, 2);
  assert.equal(next.lastResults[0].id, 'z1');
  assert.equal(next.state.district, 'Gurugram');
});

test('prompt messages put stable content first and the volatile question last', () => {
  const mem = memory.normalizeMemory({ district: 'Gurugram' });
  mem.summary = 'User wants warehouse land.';
  const msgs = memory.buildMessages({
    history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }],
    memory: mem,
    contextText: 'LIVE FACTS',
    query: 'best zones?',
  });
  assert.equal(msgs[0].role, 'system');
  assert.match(msgs[0].content, /Earlier in this conversation/);
  const last = msgs[msgs.length - 1];
  assert.equal(last.role, 'user');
  assert.match(last.content, /LIVE FACTS/);
  assert.match(last.content, /best zones\?/);
});

test('adapter builds cache-friendly message order', () => {
  const msgs = buildMessages({
    systemPrompt: 'SYS',
    stablePrefix: 'STABLE',
    userPrompt: 'VOLATILE',
  });
  assert.deepEqual(msgs.map((m) => m.content), ['SYS', 'STABLE', 'VOLATILE']);
});

test('telemetry aggregates latency and fallback rate', () => {
  telemetry.reset();
  telemetry.recordTurn({ method: 'llm', model: 'm', ttftMs: 120, totalMs: 900, completionTokens: 100 });
  telemetry.recordTurn({ method: 'rule_based_fallback', totalMs: 300 });
  const snap = telemetry.snapshot();
  assert.equal(snap.requests, 2);
  assert.equal(snap.llm.ok, 1);
  assert.equal(snap.fallbackRatePct, 50);
  assert.equal(snap.latencyMs.timeToFirstToken.p50, 120);
  telemetry.reset();
});

test('context renders diligence, land band and cheaper picks', () => {
  const out = renderContext({
    ...SAMPLE_CONTEXT,
    preference: 'cheaper',
    forecast: { p10: 9000, p50: 12000, p90: 16000, confidence: 'medium', note: 'Current band.' },
    diligence: { steps: ['Confirm CLU vs intended use.'], extra: [] },
    cheaperPicks: [
      { name: 'Sohna Industrial Estate', district: 'Gurugram', opportunityScore: 66, landValue: { estimatedPerSqYardInr: 8000 } },
    ],
    pendingAct: { type: 'addToPipeline', params: { zoneId: 'z1' } },
  });
  assert.match(out.text, /LAND PRICE BAND/);
  assert.match(out.text, /DILIGENCE NEXT STEPS/);
  assert.match(out.text, /CHEAPER PICKS/);
  assert.match(out.text, /PENDING ACTION/);
});
