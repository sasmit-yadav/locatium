/**
 * Ask LOCATIUM — spatial investment copilot.
 * Multi-turn, fuzzy NLU, multi-tool grounding, LLM + strong rule fallback.
 */

const llmAdapter = require('./llm/llm-adapter');
const { fetchGroundingContext } = require('./assistant-grounding.service');

const SYSTEM_PROMPT = `You are Ask LOCATIUM — the in-map investment copilot for Haryana (India).
You help users pick industrial / commercial / residential / agri land using ONLY the CONTEXT JSON (live PostGIS scores, circle rates, comps, ranked zones, policy excerpts).

Personality:
- Sharp analyst + friendly guide. Conversational, not robotic. You may reply in simple English; if the user wrote Hinglish, a light Hinglish mix is OK but keep numbers clear in English numerals.
- Act like a copilot: interpret messy / jumbled / typo-filled questions; never refuse just because wording is imperfect.
- Be decisive when data supports it; ask ONE clarifying question only when CONTEXT.clarification is set or critical filters are missing.

Hard rules:
- NEVER invent scores, ₹ figures, distances, zone names, or policy claims. If null/missing → say you don't have it in the live dataset.
- Cite concrete numbers from CONTEXT (scores /100, ₹/sq yd, km, verdicts).
- When listing zones: name, district, opportunityScore, one land or risk note — max 5.
- Offer a concrete next step (fly to zone, open Investor, click map, tighten budget).
- Keep answers tight: ~80–180 words unless user asked for deep breakdown.
- No markdown headers. Short bullets OK for zone lists.
- If CONTEXT.howItWorks is present, explain methodology from that object only.
- If CONTEXT.clarification.needed, ask that question and suggest the provided chips.`;

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
  if (context.scoredLocation) {
    chips.push('Explain this score breakdown');
    chips.push('Land rate + all-in cost here');
    if (context.district || context.scoredLocation.landValue?.district) {
      const d = context.district || context.scoredLocation.landValue.district;
      chips.push(`Better ${context.sector} zones in ${d}`);
    }
  }
  if (context.opportunities?.length) {
    chips.push('Compare top 3 side by side');
    chips.push('Only low-risk options');
    if (context.district) chips.push(`Tighten budget in ${context.district}`);
  }
  if (context.primaryIntent === 'help' || !chips.length) {
    chips.push('Score this site for industry');
    chips.push('Best industrial in Gurugram under 5 crore');
    chips.push('kitna land rate hai yaha');
    chips.push('CLU / HSIIDC policy notes');
  }
  return [...new Set(chips)].slice(0, 4);
}

function buildSessionPatch(context) {
  return {
    lastIntent: context.primaryIntent,
    sector: context.sector,
    district: context.district || undefined,
    budgetInr: context.budgetInr || undefined,
  };
}

function ruleBasedAnswer(query, context) {
  if (context.clarification?.needed) {
    return context.clarification.question;
  }

  if (context.primaryIntent === 'help') {
    return [
      "I'm your LOCATIUM copilot — score any map click, shortlist HSIIDC/industrial zones by district & ₹ budget, decode circle rates + market comps, and pull policy notes (CLU/EIA/HSIIDC).",
      'Ask any way you want: “ye jagah kaisi hai”, “gurgaon me warehouse 5 cr ke under”, “faridabad vs sonipat”, typos fine.',
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

  if (context.notes?.length && !parts.length) parts.push(...context.notes);
  else if (context.notes?.length && context.clarification) parts.push(context.notes[0]);

  if (!parts.length) {
    return 'I couldn’t pull enough live data for that. Click the map or name a Haryana district (Gurugram, Faridabad, Sonipat…) and ask again — even jumbled wording is fine.';
  }

  parts.push('Verify on the map + Analysis/Investor panels before you commit.');
  return parts.join('\n');
}

function historyToPrompt(history = []) {
  return (history || [])
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'User' : 'Copilot'}: ${String(m.content || m.text || '').slice(0, 500)}`)
    .join('\n');
}

async function ask({
  query,
  lat,
  lng,
  sector,
  district,
  zoneIds,
  history = [],
  session = {},
  stream = false,
}) {
  const started = Date.now();
  const q = String(query || '').trim();
  if (!q) {
    const err = new Error('query is required');
    err.status = 400;
    throw err;
  }

  const context = await fetchGroundingContext({
    query: q,
    lat,
    lng,
    sector,
    district,
    zoneIds,
    session,
  });

  const mapActions = buildMapActions(context);
  const followUps = buildFollowUps(context);
  const sessionPatch = buildSessionPatch(context);
  const disclaimer =
    'Grounded on live LOCATIUM data — verify on the map and official sources before decisions.';

  let answer;
  let method = 'rule_based';
  let provider = null;
  let model = null;

  const useLlm = llmAdapter.isEnabled() && !context.clarification?.needed;

  // Never let the model invent a shortlist when grounding returned zero zones.
  const emptyShortlist =
    context.intents?.includes('opportunities') &&
    !context.clarification?.needed &&
    !(context.opportunities && context.opportunities.length);

  if (useLlm && !emptyShortlist) {
    try {
      const transcript = historyToPrompt(history);
      const llmResult = await llmAdapter.complete({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: [
          transcript ? `RECENT CHAT:\n${transcript}\n` : '',
          `USER NOW:\n${q}`,
          `\nCONTEXT JSON (authoritative — do not invent beyond this):\n${JSON.stringify(context)}`,
          '\nIf opportunities is empty, say no match — do NOT invent zone names.',
        ]
          .filter(Boolean)
          .join('\n'),
        maxTokens: 900,
        temperature: 0.2,
        timeoutMs: 12000,
      });
      answer = llmResult.text;
      method = 'llm';
      provider = llmResult.provider;
      model = llmResult.model;
    } catch {
      answer = ruleBasedAnswer(q, context);
      method = 'rule_based_fallback';
    }
  } else {
    answer = ruleBasedAnswer(q, context);
    if (context.clarification?.needed) method = 'clarify';
    else if (emptyShortlist) method = 'rule_based';
  }

  return {
    answer,
    method,
    provider,
    model,
    intent: context.primaryIntent,
    intents: context.intents,
    disclaimer,
    mapActions,
    followUps,
    session: sessionPatch,
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
    },
    opportunities: (context.opportunities || []).slice(0, 6),
    scoredLocation: context.scoredLocation
      ? {
          overallScore: context.scoredLocation.overallScore,
          verdict: context.scoredLocation.insights?.verdict,
          landValue: context.scoredLocation.landValue,
        }
      : null,
    elapsedMs: Date.now() - started,
    stream,
  };
}

module.exports = { ask, ruleBasedAnswer, buildMapActions, buildFollowUps };
