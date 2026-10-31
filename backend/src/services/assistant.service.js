/**
 * Ask LOCATIUM — spatial investment copilot.
 *
 * Turn pipeline:
 *   memory → overrides → reference resolution → (optional) standalone rewrite
 *          → grounding (deadline-bounded) → context compaction → LLM (streamed)
 *          → groundedness verification → memory update + telemetry
 *
 * Design commitments:
 *  - PostGIS/grounding data is the only source of facts; the model narrates, it never supplies numbers.
 *  - Every stage degrades instead of failing: no LLM → rule-based answer; slow grounding → partial
 *    answer; failed verification → deterministic answer. A turn always returns something honest.
 *  - Latency is a feature: tokens stream as they are produced, context is budgeted, and a chat turn
 *    never blocks on a cold full-district scan.
 */

const crypto = require('crypto');
const llmAdapter = require('./llm/llm-adapter');
const telemetry = require('./llm/llm-telemetry');
const { fetchGroundingContext } = require('./assistant-grounding.service');
const { renderContext } = require('./assistant-context.service');
const memoryService = require('./assistant-memory.service');
const { verifyGrounding } = require('./assistant-guardrail.service');
const language = require('./assistant-language.service');
const { localizeTurn } = require('./assistant-i18n.service');
const beginner = require('./assistant-beginner.service');
const actions = require('./assistant-actions.service');
const redisCache = require('./redis-cache.service');
const { AppError } = require('../middleware/error.middleware');

const SYSTEM_PROMPT = `You are Ask LOCATIUM — a colleague sitting with the user at a Haryana (India) investment map.
You help them pick industrial / commercial / residential / agri land using ONLY the LIVE DATA block supplied each turn (PostGIS scores, official circle rates, comps, ranked zones, policy excerpts, diligence checklist, facility-gap counts, current land-price band).

Personality:
- Talk like a sharp analyst sitting next to them, not a chatbot. Acknowledge what they actually said — including objections ("too expensive", "too risky"), vague asks, and "what next".
- Conversational, not robotic. Simple English is fine; if they wrote Hinglish, a light Hinglish mix is OK. Numbers always stay in English numerals.
- Interpret messy / jumbled / typo-filled questions. Never refuse just because wording is imperfect.
- Be decisive when data supports it; ask ONE clarifying question only when the data block says clarification is needed.

How a turn should feel:
- First answer the question from LIVE DATA.
- Then offer TWO concrete next moves. If a PENDING ACTION or confirm chip exists, say tapping Confirm will actually save / email / generate the report — do not send them to another panel to finish.
- Follow-ups work like a human: "risks?" means risks on the last shortlist; "do it" / "yes" means the last proposed action; "too expensive" means cheaper options from the same conversation.
- If DILIGENCE, LAND PRICE BAND, FACILITY GAP or CHEAPER PICKS blocks exist, use them. Never invent Jamabandi extracts or future-year prices. The land band is a current p10/p50/p90, not a CatBoost forecast.

Hard rules:
- NEVER invent scores, ₹ figures, distances, zone names, or policy claims. Every number you write must appear in the LIVE DATA block. If something is missing → say you don't have it in the live dataset.
- The LIVE DATA block is always the current truth. If a figure quoted earlier in the conversation differs, silently use the LIVE DATA value — do not argue with yourself, correct the transcript, or point out the discrepancy.
- NEVER invent illustrative or hypothetical figures ("for example, if the rate were ₹50,000..."). A beginner will read an example number as a real one. Explain with words, or use only numbers from LIVE DATA.
- Never name a zone that is not listed in RANKED ZONES.
- NEVER report a mutation as already done. Saving, emailing, generating a report, and adding to a pipeline or portfolio only happen after the user taps Confirm. Write what Confirm will do ("tap Confirm and I'll add #1 to your pipeline") — never "done", "added", "saved" or "sent".
- Cite concrete numbers from the data (scores /100, ₹/sq yd, km, verdicts).
- When listing zones: name, district, opportunityScore, one land or risk note — max 5. Refer to them by their #number so the user can follow up.
- If two listed zones share the same name, keep the distinguishing detail the data gives them (e.g. parcel size) so the user can tell them apart.
- Keep answers tight: ~80–180 words unless they asked for a walkthrough (diligence can go to ~220). Brevity is latency.
- No markdown headers. Short bullets OK for zone lists and checklists.

Speaking to beginners:
- Many users have never bought land before. Never assume they know jargon (circle rate, CLU, HSIIDC, sq yd, jamabandi). If you use a term, gloss it in half a clause.
- When a GLOSSARY block is provided, use its wording for definitions — do not improvise legal or regulatory meanings.
- If the user says they are new, orient them in one short paragraph and offer one concrete first step. Do not dump a feature tour.
- You are a screening aid, not a valuer or legal adviser. If asked whether to buy, give the evidence and say the decision needs professional due diligence.
- Reply in the language named in the LANGUAGE line. Numbers, ₹ amounts, units and place names always stay in Latin script/numerals.`;

const CACHE_TTL_MS = Number(process.env.ASSISTANT_ANSWER_CACHE_TTL_MS) || 5 * 60 * 1000;
const CACHE_MAX = 200;
const ANSWER_CACHE = new Map();

const LLM_TIMEOUT_MS = Number(process.env.ASSISTANT_LLM_TIMEOUT_MS) || 20000;
const LLM_MAX_TOKENS = Number(process.env.ASSISTANT_LLM_MAX_TOKENS) || 420;

function formatInr(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function buildMapActions(context) {
  const actions = [];
  const top = context.opportunities?.[0];
  if (top?.center?.lng != null && top?.center?.lat != null) {
    actions.push({
      type: 'flyTo',
      label: `Fly to ${top.name}`,
      lng: top.center.lng,
      lat: top.center.lat,
      zoom: 12,
      name: top.name,
      zoneId: top.id,
    });
  } else if (context.scoredLocation && context.mapPoint) {
    actions.push({
      type: 'flyTo',
      label: 'Center on this site',
      lng: context.mapPoint.lng,
      lat: context.mapPoint.lat,
      zoom: 13,
      name: 'Scored location',
    });
  }

  if (context.opportunities?.length) {
    actions.push({
      type: 'highlightOpportunities',
      label: 'Pin top matches',
      highlights: context.mapHighlights || [],
    });
    actions.push({ type: 'openInvestor', label: 'Open Investor workspace' });
    context.opportunities.slice(0, 3).forEach((z, i) => {
      if (z.center?.lng == null) return;
      actions.push({
        type: 'flyTo',
        label: `#${i + 1} ${z.name}`,
        lng: z.center.lng,
        lat: z.center.lat,
        zoom: 12,
        name: z.name,
        zoneId: z.id,
      });
    });
  }
  if (context.scoredLocation) {
    actions.push({ type: 'openAnalysis', label: 'Open Analysis brief' });
  }
  return actions.slice(0, 8);
}

function buildFollowUps(context) {
  const chips = [];
  if (context.clarification?.suggestions?.length) {
    return context.clarification.suggestions;
  }
  if (context.opportunities?.length) {
    const top = context.opportunities[0];
    chips.push(top?.name ? `What are the risks on #1?` : 'What are the risks here?');
    chips.push('Too expensive — show cheaper');
    chips.push('Walk me through diligence');
    if (top?.id) chips.push('Add #1 to pipeline');
  }
  if (context.scoredLocation) {
    chips.push('Land price band here');
    chips.push('What is missing nearby — hospitals and schools?');
  }
  if (context.diligence && !chips.includes('Add #1 to pipeline')) {
    chips.push('Generate a PDF for #1');
  }
  if (context.primaryIntent === 'help' || !chips.length) {
    chips.push('Score this site for industry');
    chips.push('Best industrial in Gurugram under 5 crore');
    chips.push('I am new — how does this work?');
    chips.push('What should I do after I like a zone?');
  }
  return [...new Set(chips)].slice(0, 4);
}

function ruleBasedAnswer(query, context) {
  // Definitions answer from the vetted glossary — works with no LLM and no map pin.
  // Uses the user's language: a Hindi question must not get an English fallback.
  if (context.glossary?.length) {
    const hindi = context.replyLanguage === 'hi';
    const parts = [];
    for (const t of context.glossary.slice(0, 2)) {
      parts.push(`${t.term}: ${hindi ? t.hi : `${t.en} ${t.why}`}`);
    }
    parts.push(
      hindi
        ? 'अब किसी जगह का स्कोर पूछें, या ज़िले का नाम बताएं।'
        : 'Ask me to score a specific place next, or name a district to see options.'
    );
    return parts.join('\n');
  }

  if (context.clarification?.needed) {
    return context.clarification.question;
  }

  if (context.primaryIntent === 'help') {
    return [
      "I'm sitting on the map with you — score any click, shortlist HSIIDC/industrial zones by district and ₹ budget, decode circle rates, walk diligence, and actually save or email a report when you tap Confirm.",
      'Ask any way you want: “ye jagah kaisi hai”, “gurgaon me warehouse 5 cr ke under”, “too expensive”, “what next”, “add it”. Typos fine.',
      'Click the map for “here/yaha” questions, or name a district to explore.',
    ].join(' ');
  }

  if (context.howItWorks) {
    const h = context.howItWorks;
    return [
      `Scoring engine ${h.engine} blends ${h.components.join(', ')}.`,
      `Land: ${h.land}.`,
      `Investor ranking: ${h.investor}.`,
      h.transparency,
      'Open Analysis → “How this score was calculated” for the live formula on your pin.',
    ].join(' ');
  }

  const parts = [];

  if (context.scoredLocation) {
    const s = context.scoredLocation;
    parts.push(
      `This pin scores ${s.overallScore}/100 — ${s.insights?.verdict || 'see breakdown'} (${s.scoringVersion || 'v3'}).`
    );
    if (s.scores) {
      parts.push(
        `Breakdown: infra ${s.scores.infrastructure}, access ${s.scores.accessibility}, env. suitability ${s.scores.environmentalRisk}, zone fit ${s.scores.zoneCompatibility ?? s.scores.zoneSuitability}.`
      );
    }
    const dist = s.distancesKm || {};
    const distBits = [];
    if (dist.highway != null) distBits.push(`highway ~${Number(dist.highway).toFixed(1)} km`);
    if (dist.metro != null) distBits.push(`metro ~${Number(dist.metro).toFixed(1)} km`);
    if (dist.airport != null) distBits.push(`airport ~${Number(dist.airport).toFixed(1)} km`);
    if (dist.rail != null) distBits.push(`rail ~${Number(dist.rail).toFixed(1)} km`);
    if (distBits.length) parts.push(`Connectivity: ${distBits.join(', ')}.`);

    if (s.landValue?.estimatedPerSqYardInr || s.landValue?.circleRatePerSqYardInr) {
      const est = formatInr(s.landValue.estimatedPerSqYardInr);
      const floor = formatInr(s.landValue.circleRatePerSqYardInr);
      parts.push(
        `Land: ${est ? `est. ${est}/sq yd` : 'estimate pending'}${floor ? ` (circle floor ${floor}/sq yd)` : ''}${s.landValue.district ? ` · ${s.landValue.district}` : ''}${s.landValue.confidence ? ` · confidence ${s.landValue.confidence}` : ''}.`
      );
    }
    if (s.zoning?.insideHsiidc) parts.push('Pin sits inside / on HSIIDC estate context.');
    else if (s.zoning?.nearestHsiidcKm != null) {
      parts.push(`Nearest HSIIDC context ~${Number(s.zoning.nearestHsiidcKm).toFixed(1)} km.`);
    }
    if (s.insights?.summary) parts.push(s.insights.summary);
    if (s.insights?.cautions?.[0]) parts.push(`Watch-out: ${s.insights.cautions[0]}`);
  }

  if (context.opportunities?.length) {
    const where = context.district ? ` in ${context.district}` : '';
    const budget = context.budgetInr ? ` within ~${formatInr(context.budgetInr)}` : '';
    const scanned = context.coverage?.candidatesScored;
    const scanNote =
      context.coverage?.mode === 'full_district' && scanned
        ? ` (scored all ${scanned} investor-eligible sites in ${context.district})`
        : '';
    parts.push(`Top ${context.sector} picks${where}${budget}${scanNote}:`);
    context.opportunities.slice(0, 5).forEach((z, i) => {
      const land = z.landValue?.estimatedPerSqYardInr
        ? `, ~${formatInr(z.landValue.estimatedPerSqYardInr)}/sq yd`
        : '';
      const risk = z.keyRisk ? `; risk: ${z.keyRisk}` : '';
      const dist = z.distanceKm != null ? `, ${Number(z.distanceKm).toFixed(1)} km from pin` : '';
      parts.push(`${i + 1}. ${z.name} (${z.district}) — ${z.opportunityScore}/100, ${z.verdict || 'ranked'}${land}${dist}${risk}`);
    });
  } else if (context.intents?.includes('opportunities')) {
    parts.push(
      'No zones matched those filters right now. Try another district, raise the ₹ cap, or clear risk filters in Investor pro tools.'
    );
  }

  if (context.compare?.zones?.length) {
    parts.push('Quick compare:');
    context.compare.zones.forEach((z) => {
      parts.push(`• ${z.name}: score ${z.opportunityScore}, ${z.verdict || '—'}`);
    });
  }

  if (context.policies?.length) {
    parts.push('Policy notes:');
    context.policies.slice(0, 2).forEach((p) => {
      parts.push(`${p.citation}: ${p.excerpt}`);
    });
  }

  if (context.forecast?.p50 != null) {
    const f = context.forecast;
    parts.push(
      `Current land-price band (not a future forecast): p10 ${formatInr(f.p10)} · p50 ${formatInr(f.p50)} · p90 ${formatInr(f.p90)} per sq yd${f.confidence ? ` · ${f.confidence} confidence` : ''}.`
    );
  }

  if (context.cheaperPicks?.length) {
    parts.push('Cheaper from this shortlist:');
    context.cheaperPicks.slice(0, 3).forEach((z) => {
      parts.push(
        `• ${z.name}: ~${formatInr(z.landValue.estimatedPerSqYardInr)}/sq yd, score ${z.opportunityScore}`
      );
    });
  }

  if (context.facilityGap?.summary) {
    const s = context.facilityGap.summary;
    parts.push(
      `Facility gap (hospitals+schools within 5 km of HSIIDC centroids): ${s.severe || 0} severe, ${s.gap || 0} gap, ${s.served || 0} served of ${s.zones || 0} zones. Screening overlay only.`
    );
  }

  if (context.diligence?.steps?.length) {
    parts.push('If you like this site, next screening steps:');
    context.diligence.steps.slice(0, 5).forEach((step, i) => {
      parts.push(`${i + 1}. ${step}`);
    });
    (context.diligence.extra || []).forEach((line) => parts.push(line));
  }

  if (context.pendingAct?.type) {
    parts.push(`Tap Confirm below and I will actually ${context.pendingAct.type.replace(/([A-Z])/g, ' $1').toLowerCase()} — you do not need to finish it in another panel.`);
  }

  if (context.notes?.length && !parts.length) parts.push(...context.notes);
  else if (context.notes?.length && context.clarification) parts.push(context.notes[0]);

  if (!parts.length) {
    return 'I couldn’t pull enough live data for that. Click the map or name a Haryana district (Gurugram, Faridabad, Sonipat…) and ask again — even jumbled wording is fine.';
  }

  parts.push('Verify on the map + Analysis/Investor panels before you commit.');
  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/* answer cache — exact key over (question + live-data fingerprint)     */
/* Deliberately NOT semantic: serving a near-miss answer with the wrong */
/* rupee figure is worse than recomputing.                             */
/* ------------------------------------------------------------------ */

function fingerprint(...parts) {
  return crypto.createHash('sha1').update(parts.join('||')).digest('hex').slice(0, 20);
}

function redisKey(key) {
  return `assistant:answer:${key}`;
}

async function cacheGet(key) {
  const hit = ANSWER_CACHE.get(key);
  if (hit) {
    if (Date.now() - hit.at > CACHE_TTL_MS) {
      ANSWER_CACHE.delete(key);
    } else {
      return hit.value;
    }
  }
  const raw = await redisCache.getString(redisKey(key));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    ANSWER_CACHE.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

async function cacheSet(key, value) {
  ANSWER_CACHE.set(key, { at: Date.now(), value });
  if (ANSWER_CACHE.size > CACHE_MAX) {
    ANSWER_CACHE.delete(ANSWER_CACHE.keys().next().value);
  }
  await redisCache.setString(redisKey(key), JSON.stringify(value), Math.max(60, Math.round(CACHE_TTL_MS / 1000)));
}

/** Shared per-turn setup: memory, references, rewrite, grounding, prompt assembly. */
async function prepareTurn(input = {}) {
  const { query, lat, lng, sector, district, zoneIds, history, session, signal } = input;
  const startedAt = Date.now();
  // Reject a non-string query outright: String({}) is "[object Object]", which the NLU
  // would happily treat as a real question and answer with a generic clarification.
  if (query != null && typeof query !== 'string') {
    throw AppError.badRequest('query must be a string');
  }
  const q = String(query || '').trim();
  if (!q) throw AppError.badRequest('query is required');

  const memory = memoryService.normalizeMemory(session || {});
  const { state: overriddenState, cleared } = memoryService.applyOverrides(q, memory.state);
  memory.state = overriddenState;

  // Language: mirror whatever the user wrote in. An explicit UI preference wins.
  const detected = language.detectLanguage(q);
  const replyLanguage = input.language || detected.language;

  // Glossary keys and beginner signals are English, so detection runs on the bridged form —
  // otherwise "सर्कल रेट क्या होता है?" matches nothing and falls through to a clarification.
  const bridgedQ = language.bridgeToEnglishTokens(q);
  const detectionText = `${q} ${bridgedQ}`;

  // Beginner signals + jargon the user is likely stuck on.
  const isNewUser = beginner.isBeginner(detectionText, memory);
  const glossaryTerms = beginner.detectTerms(detectionText);

  // Deterministic reference resolution first — free and exact.
  const refs = memoryService.resolveReferences(q, memory);

  // Only pay for an LLM rewrite when the turn genuinely leans on prior context.
  let effectiveQuery = refs.rewritten || q;
  let rewriteInfo = { rewritten: false };
  if (!refs.rewritten && memoryService.needsQueryRewrite(q, memory)) {
    rewriteInfo = await memoryService.rewriteStandalone({
      query: q,
      history,
      memory,
      signal,
    });
    if (rewriteInfo.rewritten) effectiveQuery = rewriteInfo.query;
  }

  // The intent matcher is English-pattern based and JS `\w` is ASCII-only, so Devanagari has to be
  // bridged to English tokens before NLU. The original text still goes to the model verbatim.
  const nluQuery = language.bridgeToEnglishTokens(effectiveQuery);

  const groundingStarted = Date.now();
  const context = await fetchGroundingContext({
    query: nluQuery,
    lat,
    lng,
    // Carried state fills gaps the current sentence omitted.
    sector: sector || memory.state.sector || undefined,
    district: cleared.includes('district') ? undefined : district || memory.state.district || undefined,
    zoneIds: refs.zoneIds.length ? refs.zoneIds : zoneIds,
    session: {
      lastIntent: memory.lastIntent,
      lastResults: memory.lastResults,
      lastProposals: memory.lastProposals,
      sector: memory.state.sector,
      district: cleared.includes('district') ? null : memory.state.district,
      budgetInr: cleared.includes('budgetInr') ? null : memory.state.budgetInr,
      risk: cleared.includes('risk') ? null : memory.state.risk,
    },
  });
  const groundingMs = Date.now() - groundingStarted;

  // A definition question ("what is circle rate?") needs no map pin. The NLU treats land/score
  // intents without a location as under-specified, which is right for "what's the rate here" but
  // wrong for "what does rate mean" — so a recognised glossary question overrides the clarification.
  const isGlossaryQuestion =
    glossaryTerms.length > 0 && beginner.isDefinitionQuestion(detectionText);
  if (isGlossaryQuestion && context.clarification?.needed) {
    context.clarification = { needed: false };
    context.notes = (context.notes || []).filter((n) => !/click a point on the map/i.test(n));
  }
  if (isGlossaryQuestion) {
    context.glossary = glossaryTerms;
    if (!context.primaryIntent || context.primaryIntent === 'help') context.primaryIntent = 'explain';
  }
  // Deterministic fallbacks need the language too, so a blocked Hindi answer stays Hindi.
  context.replyLanguage = replyLanguage;

  // "I'm new, where do I start?" should get oriented, not interrogated for a district.
  if (isNewUser && context.clarification?.needed && !context.district && !context.budgetInr) {
    context.clarification = { needed: false };
    context.primaryIntent = 'help';
    // Must also drop the opportunities intent, or the empty-shortlist guard forces the
    // deterministic answer and the user loses a reply in their own language.
    context.intents = ['help'];
    context.notes = [
      'New user asking how to begin. Explain in 2-3 sentences what this tool does (scores any location in Haryana for industrial/residential/commercial/agri use, shows official government land rates, and ranks available sites), then give ONE concrete first step. Do not list features.',
    ];
  }

  const base = renderContext(context);

  // Language directive and glossary ride with the live data (end of prompt), so the stable system
  // prompt stays byte-identical and cacheable across turns.
  const preamble = [
    `LANGUAGE: ${language.replyLanguageInstruction(replyLanguage)}`,
    isNewUser ? 'USER IS NEW: orient them briefly and offer one concrete first step.' : null,
    beginner.renderGlossary(glossaryTerms, replyLanguage),
  ]
    .filter(Boolean)
    .join('\n');

  const rendered = {
    ...base,
    text: `${preamble}\n${base.text}`,
  };

  const proposed = actions.proposeActions(context, {
    authenticated: Boolean(input.authenticated),
    beginner: isNewUser,
  });

  return {
    q,
    effectiveQuery,
    memory,
    refs,
    rewriteInfo,
    context,
    rendered,
    groundingMs,
    startedAt,
    replyLanguage,
    detectedLanguage: detected,
    isNewUser,
    glossaryTerms,
    proposed,
  };
}

function turnEnvelope({ context, memory, refs, rewriteInfo, rendered, groundingMs, startedAt, answer, method, provider, model, usage, ttftMs, guardrail, cacheHit, nextMemory, replyLanguage, detectedLanguage, isNewUser, glossaryTerms, proposed }) {
  const lang = replyLanguage || 'en';
  // Hindi display text for buttons, chips and the disclaimer (answers are already in Hindi).
  return localizeTurn({
    answer,
    method,
    provider: provider || null,
    model: model || null,
    intent: context.primaryIntent,
    intents: context.intents,
    language: {
      reply: lang,
      detected: detectedLanguage?.language || lang,
      confidence: detectedLanguage?.confidence ?? null,
      // Voice output needs a BCP-47 tag for speechSynthesis.
      speechLocale: lang === 'hi' ? 'hi-IN' : 'en-IN',
    },
    beginner: {
      isNew: Boolean(isNewUser),
      starters: isNewUser ? beginner.starterPrompts(lang) : [],
      terms: (glossaryTerms || []).map((t) => ({
        term: t.term,
        explanation: lang === 'hi' ? t.hi : t.en,
        why: t.why,
      })),
    },
    disclaimer:
      'Grounded on live LOCATIUM data — verify on the map and official sources before decisions.',
    // Read-only, safe to run on click.
    mapActions: proposed?.actions?.length ? proposed.actions : buildMapActions(context),
    // Mutating — the UI must ask before firing these.
    actionProposals: proposed?.proposals || [],
    followUps: buildFollowUps(context),
    session: nextMemory,
    contextSummary: {
      sector: context.sector,
      district: context.district,
      budgetInr: context.budgetInr,
      risk: context.risk,
      opportunityCount: context.opportunities?.length || 0,
      hasScore: Boolean(context.scoredLocation),
      overallScore: context.scoredLocation?.overallScore ?? null,
      clarification: Boolean(context.clarification?.needed),
      coverage: context.coverage || null,
      totalCandidates: context.totalCandidates ?? null,
      totalMatched: context.totalMatched ?? null,
      partial: Boolean(context.partial),
    },
    resolvedReferences: refs.refs.length
      ? { refs: refs.refs, names: refs.resolvedNames }
      : null,
    queryRewrite: rewriteInfo.rewritten
      ? { original: rewriteInfo.original, rewritten: rewriteInfo.query }
      : null,
    grounding: {
      contextTokens: rendered.approxTokens,
      dropped: rendered.dropped,
      elapsedMs: groundingMs,
      partial: Boolean(context.partial),
    },
    guardrail: guardrail
      ? { severity: guardrail.severity, checked: guardrail.checked }
      : null,
    cacheHit: Boolean(cacheHit),
    opportunities: (context.opportunities || []).slice(0, 6),
    scoredLocation: context.scoredLocation
      ? {
          overallScore: context.scoredLocation.overallScore,
          verdict: context.scoredLocation.insights?.verdict,
          landValue: context.scoredLocation.landValue,
        }
      : null,
    usage: usage || null,
    ttftMs: ttftMs ?? null,
    elapsedMs: Date.now() - startedAt,
  }, lang);
}

/** True when the model must not be trusted to narrate (nothing to narrate from). */
function mustUseDeterministic(context) {
  if (context.clarification?.needed) return 'clarify';
  const conversational = ['act', 'diligence', 'help', 'how_it_works', 'risk', 'forecast'].includes(
    context.primaryIntent
  );
  if (
    context.intents?.includes('opportunities') &&
    !(context.opportunities && context.opportunities.length) &&
    !conversational
  ) {
    return 'rule_based'; // no shortlist → model would be tempted to invent zones
  }
  return null;
}

/**
 * Non-streaming turn. Kept for callers that want one JSON blob (tests, scripts, PDF flows).
 */
async function ask(input = {}) {
  const prep = await prepareTurn(input);
  const { q, context, rendered, memory, refs, rewriteInfo, groundingMs, startedAt } = prep;

  const deterministicReason = mustUseDeterministic(context);
  const useLlm = llmAdapter.isEnabled() && !deterministicReason;

  const cacheKey = fingerprint(q.toLowerCase(), rendered.text);
  if (useLlm) {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      const nextMemory = memoryService.updateMemory({
        memory,
        context,
        opportunities: context.opportunities || [],
        proposals: prep.proposed?.proposals || [],
      });
      telemetry.recordTurn({
        method: 'llm_cached',
        totalMs: Date.now() - startedAt,
        groundingMs,
        cacheHit: true,
      });
      return turnEnvelope({
        ...prep,
        answer: cached.answer,
        method: 'llm_cached',
        provider: cached.provider,
        model: cached.model,
        guardrail: cached.guardrail,
        cacheHit: true,
        nextMemory,
        ttftMs: 0,
      });
    }
  }

  let answer;
  let method = 'rule_based';
  let provider = null;
  let model = null;
  let usage = null;
  let ttftMs = null;
  let guardrail = null;

  if (useLlm) {
    try {
      const res = await llmAdapter.complete({
        systemPrompt: SYSTEM_PROMPT,
        messages: memoryService.buildMessages({
          history: input.history || [],
          memory,
          contextText: rendered.text,
          query: prep.effectiveQuery,
        }),
        maxTokens: LLM_MAX_TOKENS,
        temperature: 0.2,
        timeoutMs: LLM_TIMEOUT_MS,
        signal: input.signal,
      });
      guardrail = verifyGrounding(res.text, rendered.text);
      if (guardrail.severity === 'block') {
        // Model asserted a number or zone that isn't in the live data — do not ship it.
        answer = ruleBasedAnswer(q, context);
        method = 'rule_based_guardrail';
      } else {
        answer = res.text;
        method = 'llm';
        provider = res.provider;
        model = res.model;
        usage = res.usage;
        ttftMs = res.ttftMs;
        await cacheSet(cacheKey, { answer, provider, model, guardrail });
      }
    } catch (err) {
      answer = ruleBasedAnswer(q, context);
      method = 'rule_based_fallback';
      telemetry.recordTurn({ method, error: err.message, groundingMs });
    }
  } else {
    answer = ruleBasedAnswer(q, context);
    method = deterministicReason === 'clarify' ? 'clarify' : 'rule_based';
  }

  const summary = await memoryService.maybeSummarize({
    history: input.history || [],
    memory,
    signal: input.signal,
  });
  const nextMemory = memoryService.updateMemory({
    memory,
    context,
    summary,
    opportunities: context.opportunities || [],
    proposals: prep.proposed?.proposals || [],
  });

  telemetry.recordTurn({
    method,
    model,
    ttftMs,
    totalMs: Date.now() - startedAt,
    groundingMs,
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
    cacheHit: false,
  });

  return turnEnvelope({
    ...prep,
    answer,
    method,
    provider,
    model,
    usage,
    ttftMs,
    guardrail,
    nextMemory,
  });
}

/**
 * Streaming turn. Yields, in order:
 *   {type:'status'}   pipeline phase for the UI
 *   {type:'meta'}     everything the UI needs to render cards/actions (before text)
 *   {type:'token'}    real model tokens as they arrive
 *   {type:'guardrail'} only if verification rejected the streamed text
 *   {type:'final'}    complete envelope
 *
 * Tokens are streamed optimistically: verification runs on the finished text, and a violation
 * emits a correction rather than silently shipping an ungrounded number. Violations should be
 * rare, so the common path keeps Groq's sub-100ms first token.
 */
async function* askStream(input = {}) {
  yield { type: 'status', phase: 'understanding' };

  const prep = await prepareTurn(input);
  const { q, context, rendered, memory, groundingMs, startedAt } = prep;

  if (prep.rewriteInfo.rewritten) {
    yield { type: 'status', phase: 'rewritten', detail: prep.effectiveQuery };
  }
  yield { type: 'status', phase: 'grounded', contextTokens: rendered.approxTokens };

  const deterministicReason = mustUseDeterministic(context);
  const useLlm = llmAdapter.isEnabled() && !deterministicReason;

  const emitFinal = async ({ answer, method, provider, model, usage, ttftMs, guardrail, cacheHit }) => {
    const summary = await memoryService.maybeSummarize({
      history: input.history || [],
      memory,
      signal: input.signal,
    });
    const nextMemory = memoryService.updateMemory({
      memory,
      context,
      summary,
      opportunities: context.opportunities || [],
      proposals: prep.proposed?.proposals || [],
    });
    telemetry.recordTurn({
      method,
      model,
      ttftMs,
      totalMs: Date.now() - startedAt,
      groundingMs,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      cacheHit,
    });
    return turnEnvelope({ ...prep, answer, method, provider, model, usage, ttftMs, guardrail, cacheHit, nextMemory });
  };

  // Meta first so the UI can paint score cards / zone list while text streams in.
  const provisional = await (async () => {
    const nextMemory = memoryService.updateMemory({
      memory,
      context,
      opportunities: context.opportunities || [],
      proposals: prep.proposed?.proposals || [],
    });
    return turnEnvelope({
      ...prep,
      answer: '',
      method: useLlm ? 'llm' : 'rule_based',
      nextMemory,
    });
  })();
  yield { type: 'meta', payload: provisional };

  if (!useLlm) {
    const answer = ruleBasedAnswer(q, context);
    yield { type: 'token', text: answer };
    yield {
      type: 'final',
      payload: await emitFinal({
        answer,
        method: deterministicReason === 'clarify' ? 'clarify' : 'rule_based',
      }),
    };
    return;
  }

  const cacheKey = fingerprint(q.toLowerCase(), rendered.text);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    yield { type: 'token', text: cached.answer };
    yield {
      type: 'final',
      payload: await emitFinal({
        answer: cached.answer,
        method: 'llm_cached',
        provider: cached.provider,
        model: cached.model,
        guardrail: cached.guardrail,
        cacheHit: true,
        ttftMs: 0,
      }),
    };
    return;
  }

  let full = '';
  let done = null;
  try {
    const stream = llmAdapter.streamChat({
      systemPrompt: SYSTEM_PROMPT,
      messages: memoryService.buildMessages({
        history: input.history || [],
        memory,
        contextText: rendered.text,
        query: prep.effectiveQuery,
      }),
      maxTokens: LLM_MAX_TOKENS,
      temperature: 0.2,
      timeoutMs: LLM_TIMEOUT_MS,
      signal: input.signal,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'token') {
        full += chunk.text;
        yield chunk;
      } else if (chunk.type === 'done') {
        done = chunk;
      }
    }
  } catch (err) {
    // Nothing usable streamed — fall back cleanly.
    if (!full.trim()) {
      const answer = ruleBasedAnswer(q, context);
      yield { type: 'token', text: answer };
      yield {
        type: 'final',
        payload: await emitFinal({ answer, method: 'rule_based_fallback' }),
      };
      return;
    }
    yield { type: 'status', phase: 'stream_interrupted' };
  }

  const guardrail = verifyGrounding(full, rendered.text);
  if (guardrail.severity === 'block') {
    const grounded = ruleBasedAnswer(q, context);
    yield {
      type: 'guardrail',
      severity: guardrail.severity,
      message:
        'Some figures above could not be verified against the live dataset, so here is the verified version:',
      replacement: grounded,
      checked: guardrail.checked,
    };
    yield {
      type: 'final',
      payload: await emitFinal({
        answer: grounded,
        method: 'rule_based_guardrail',
        provider: done?.provider,
        model: done?.model,
        usage: done?.usage,
        ttftMs: done?.ttftMs,
        guardrail,
      }),
    };
    return;
  }

  if (full.trim()) {
    await cacheSet(cacheKey, {
      answer: full,
      provider: done?.provider,
      model: done?.model,
      guardrail,
    });
  }

  yield {
    type: 'final',
    payload: await emitFinal({
      answer: full,
      method: 'llm',
      provider: done?.provider,
      model: done?.model,
      usage: done?.usage,
      ttftMs: done?.ttftMs,
      guardrail,
    }),
  };
}

module.exports = {
  ask,
  askStream,
  ruleBasedAnswer,
  buildMapActions,
  buildFollowUps,
  SYSTEM_PROMPT,
};
