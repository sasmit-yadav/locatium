const test = require('node:test');
const assert = require('node:assert/strict');

const lang = require('../src/services/assistant-language.service');
const beginner = require('../src/services/assistant-beginner.service');
const actions = require('../src/services/assistant-actions.service');
const { detectIntents, detectDistrict, detectSector } = require('../src/services/assistant-nlu.service');

/* ---------------------------- language ---------------------------- */

test('detects Devanagari Hindi, Hinglish, and English', () => {
  assert.equal(lang.detectLanguage('गुरुग्राम में ज़मीन का रेट क्या है').language, 'hi');
  assert.equal(lang.detectLanguage('kitna land rate hai yaha').language, 'hinglish');
  assert.equal(lang.detectLanguage('best industrial zones in Gurugram').language, 'en');
  // Mixed script counts as Hinglish so the reply can mirror it.
  assert.equal(lang.detectLanguage('Gurugram me ज़मीन ka rate').language, 'hinglish');
});

test('empty and numeric-only input degrade to English rather than throwing', () => {
  assert.equal(lang.detectLanguage('').language, 'en');
  assert.equal(lang.detectLanguage('12345').language, 'en');
});

test('Devanagari is bridged to the tokens the English NLU matches', () => {
  const bridged = lang.bridgeToEnglishTokens('गुरुग्राम में औद्योगिक ज़मीन का रेट क्या है');
  // District, sector and the land/rate keywords must all survive into Latin tokens.
  assert.match(bridged, /Gurugram/);
  assert.match(bridged, /industrial/);
  assert.match(bridged, /land|rate/);
  // No Devanagari should remain to confuse the matcher.
  assert.ok(!/[ऀ-ॿ]/.test(bridged), `leftover Devanagari: ${bridged}`);
});

test('bridged Hindi actually drives intent, district and sector detection', () => {
  const bridged = lang.bridgeToEnglishTokens('गुरुग्राम में औद्योगिक ज़मीन का रेट क्या है');
  assert.equal(detectDistrict(bridged), 'Gurugram');
  assert.equal(detectSector(bridged), 'industrial');
  const intents = detectIntents(bridged, {});
  assert.ok(intents.includes('land') || intents.includes('opportunities'), JSON.stringify(intents));
});

test('Devanagari digits are converted to Latin numerals', () => {
  assert.match(lang.bridgeToEnglishTokens('२ करोड़'), /2/);
});

test('English text passes through the bridge untouched', () => {
  const s = 'best industrial zones in Gurugram under 5 crore';
  assert.equal(lang.bridgeToEnglishTokens(s), s);
});

test('reply-language instruction pins numerals to Latin for non-English replies', () => {
  // Only meaningful where the reply script differs from the numerals — an English reply
  // is already Latin, so it carries no such clause.
  for (const l of ['hi', 'hinglish']) {
    const instruction = lang.replyLanguageInstruction(l);
    assert.ok(instruction.length > 20);
    assert.match(instruction, /number|numeral/i, `${l} must pin numerals to Latin`);
  }
  assert.match(lang.replyLanguageInstruction('hi'), /Devanagari/);
  assert.match(lang.replyLanguageInstruction('en'), /English/);
  // Unknown codes must fall back, not return undefined.
  assert.ok(lang.replyLanguageInstruction('xx').length > 20);
});

/* ---------------------------- beginner ---------------------------- */

test('glossary detects terms in English, Hinglish and Devanagari', () => {
  assert.ok(beginner.detectTerms('what is circle rate').some((t) => /Circle rate/.test(t.term)));
  assert.ok(beginner.detectTerms('CLU ka matlab').some((t) => /CLU/.test(t.term)));
  // Devanagari reaches the glossary via the bridge, which is how the service is called.
  const bridged = lang.bridgeToEnglishTokens('सर्कल रेट क्या होता है');
  assert.ok(beginner.detectTerms(bridged).some((t) => /Circle rate/.test(t.term)));
});

test('definition questions are recognised despite ASCII-only word boundaries', () => {
  // JS \b does not work around Devanagari, so these must be substring-matched.
  assert.equal(beginner.isDefinitionQuestion('सर्कल रेट क्या होता है?'), true);
  assert.equal(beginner.isDefinitionQuestion('CLU का मतलब?'), true);
  assert.equal(beginner.isDefinitionQuestion('what is circle rate'), true);
  assert.equal(beginner.isDefinitionQuestion('CLU ka matlab kya hai'), true);
  assert.equal(beginner.isDefinitionQuestion('best zones in Gurugram'), false);
});

test('beginner signals are recognised in both scripts', () => {
  assert.equal(beginner.isBeginner('i am new here', {}), true);
  assert.equal(beginner.isBeginner('मैं नया हूँ, कैसे शुरू करूँ?', {}), true);
  assert.equal(beginner.isBeginner('naya hoon, kaise shuru karun', {}), true);
  assert.equal(beginner.isBeginner('compare zone 1 and 2', { turnCount: 5, state: { district: 'Hisar' } }), false);
});

test('every glossary entry has English, Hindi, and a why-it-matters line', () => {
  for (const [key, entry] of Object.entries(beginner.GLOSSARY)) {
    assert.ok(entry.term, `${key} missing term`);
    assert.ok(entry.en?.length > 20, `${key} missing English`);
    assert.ok(entry.hi?.length > 10, `${key} missing Hindi`);
    assert.ok(entry.why?.length > 15, `${key} missing why`);
    assert.ok(/[ऀ-ॿ]/.test(entry.hi), `${key} Hindi is not Devanagari`);
  }
});

test('starter prompts exist per language', () => {
  assert.ok(beginner.starterPrompts('en').length >= 3);
  assert.ok(beginner.starterPrompts('hi').some((s) => /[ऀ-ॿ]/.test(s)));
  assert.ok(beginner.starterPrompts('hinglish').length >= 3);
  // Unknown language must not return undefined.
  assert.ok(beginner.starterPrompts('xx').length >= 3);
});

test('glossary renders in the requested language', () => {
  const terms = beginner.detectTerms('circle rate');
  assert.match(beginner.renderGlossary(terms, 'hi'), /[ऀ-ॿ]/);
  assert.ok(!/[ऀ-ॿ]/.test(beginner.renderGlossary(terms, 'en')));
  assert.equal(beginner.renderGlossary([], 'en'), '');
});

/* ---------------------------- actions ---------------------------- */

test('read-only actions are runnable and mutating ones are only proposals', () => {
  const context = {
    sector: 'industrial',
    district: 'Gurugram',
    opportunities: [
      { id: 'z1', name: 'IMT Manesar', district: 'Gurugram', center: { lat: 28.3, lng: 76.9 } },
      { id: 'z2', name: 'Sohna Estate', district: 'Gurugram', center: { lat: 28.2, lng: 77.0 } },
    ],
    mapHighlights: [],
  };
  const { actions: safe, proposals } = actions.proposeActions(context, { authenticated: true });

  assert.ok(safe.every((a) => a.readOnly === true), 'runnable list must be read-only only');
  assert.ok(proposals.every((p) => p.readOnly === false), 'proposals must all be mutating');
  assert.ok(proposals.every((p) => p.confirm), 'every mutating action needs confirm copy');
  assert.ok(safe.some((a) => a.type === 'flyTo'));
  assert.ok(proposals.some((p) => p.type === 'addToPipeline'));
});

test('actions needing auth are withheld from anonymous users', () => {
  const context = { sector: 'industrial', district: 'Gurugram', opportunities: [], mapHighlights: [] };
  const anon = actions.proposeActions(context, { authenticated: false });
  const authed = actions.proposeActions(context, { authenticated: true });

  const anonTypes = [...anon.actions, ...anon.proposals].map((a) => a.type);
  assert.ok(!anonTypes.includes('saveSearch'));
  assert.ok(!anonTypes.includes('createAlert'));
  assert.ok([...authed.proposals].map((a) => a.type).includes('saveSearch'));
});

test('action validation rejects unknown types and unexpected params', () => {
  assert.equal(actions.validateAction({ type: 'flyTo', params: { lat: 1, lng: 2 } }).ok, true);
  assert.equal(actions.validateAction({ type: 'dropDatabase' }).ok, false);
  assert.equal(actions.validateAction({ type: 'flyTo', params: { evil: 1 } }).ok, false);
});

test('validation always flags mutating actions as needing confirmation', () => {
  const v = actions.validateAction({ type: 'emailReport', params: { zoneId: 'z1' } });
  assert.equal(v.ok, true);
  assert.equal(v.needsConfirmation, true);
  const r = actions.validateAction({ type: 'openInvestor', params: {} });
  assert.equal(r.needsConfirmation, false);
});

test('every catalog entry is self-describing for a newcomer', () => {
  for (const type of Object.keys(actions.CATALOG)) {
    const d = actions.describe(type);
    assert.ok(d.label, `${type} missing label`);
    assert.ok(d.hint, `${type} missing beginner hint`);
    if (!d.readOnly) assert.ok(d.confirm, `${type} is mutating but has no confirm prompt`);
  }
});

test('beginner mode offers orientation, normal mode does not', () => {
  const ctx = { sector: 'industrial', opportunities: [], mapHighlights: [] };
  const withTour = actions.proposeActions(ctx, { beginner: true });
  const without = actions.proposeActions(ctx, { beginner: false });
  assert.ok(withTour.actions.some((a) => a.type === 'startTour'));
  assert.ok(!without.actions.some((a) => a.type === 'startTour'));
});

test('nearby and land-band intents propose overlay chips', () => {
  const nearby = actions.proposeActions(
    {
      primaryIntent: 'nearby',
      district: 'Gurugram',
      facilityGap: { summary: { zones: 12, severe: 2, gap: 4, served: 6 } },
      opportunities: [
        { id: 'z1', name: 'IMT Manesar', district: 'Gurugram', center: { lat: 28.3, lng: 76.9 } },
        { id: 'z2', name: 'Sohna Estate', district: 'Gurugram', center: { lat: 28.2, lng: 77.0 } },
      ],
      scoredLocation: { overallScore: 70 },
      mapHighlights: [],
    },
    { authenticated: true }
  );
  assert.ok(nearby.actions.some((a) => a.type === 'overlayFacilityGap'));
  assert.ok(nearby.actions.some((a) => a.type === 'openFacilities'));

  const land = actions.proposeActions(
    {
      primaryIntent: 'forecast',
      mapPoint: { lat: 28.4, lng: 76.9 },
      forecast: { p50: 12000 },
      opportunities: [],
      mapHighlights: [],
    },
    { authenticated: false }
  );
  assert.ok(land.actions.some((a) => a.type === 'showLandBand'));
});

test('pending act is the first mutating proposal', () => {
  const { proposals } = actions.proposeActions(
    {
      primaryIntent: 'act',
      pendingAct: { type: 'emailReport', params: { zoneId: 'z1' } },
      opportunities: [
        { id: 'z1', name: 'IMT Manesar', district: 'Gurugram', center: { lat: 28.3, lng: 76.9 } },
      ],
      mapHighlights: [],
    },
    { authenticated: true }
  );
  assert.equal(proposals[0].type, 'emailReport');
});

test('glossary covers revenue-law terms a first-timer hits', () => {
  assert.ok(beginner.detectTerms('what is jamabandi').some((t) => /Jamabandi/.test(t.term)));
  assert.ok(beginner.detectTerms('mutation / intkal').some((t) => /Mutation/.test(t.term)));
  assert.ok(beginner.detectTerms('FAR for this plot').some((t) => /FAR/.test(t.term)));
});
