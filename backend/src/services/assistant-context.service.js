/**
 * Context compaction for Ask LOCATIUM.
 *
 * Why this exists: the copilot used to send `JSON.stringify(fullGroundingContext)` into the
 * prompt. On 70B-class models TTFT rises steeply with input length (Groq latency docs), so an
 * unbounded context object costs real wall-clock time on every turn — not just tokens.
 *
 * This module renders the same facts as a terse, labelled block under a token budget, dropping
 * the least decision-relevant fields first. Output is deterministic (stable key order) so it
 * stays prompt-cache friendly.
 */

const { approxTokens } = require('./llm/llm-adapter');

const DEFAULT_TOKEN_BUDGET = Number(process.env.ASSISTANT_CONTEXT_TOKEN_BUDGET) || 1400;

function inr(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Math.round(Number(n)).toLocaleString('en-IN');
}

function km(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return `${Number(n).toFixed(1)}km`;
}

function line(label, value) {
  if (value == null || value === '' || value === false) return null;
  return `${label}: ${value}`;
}

/** Compact one scored map pin. */
function renderScore(s) {
  if (!s) return [];
  const out = [];
  out.push(`SCORED PIN: overall ${s.overallScore}/100 (${s.scoringVersion || 'v3'})`);
  if (s.scores) {
    const c = s.scores;
    out.push(
      `  components: infra ${c.infrastructure}, access ${c.accessibility}, env-suitability ${c.environmentalRisk}, zone-fit ${c.zoneCompatibility ?? c.zoneSuitability}`
    );
  }
  const d = s.distancesKm || {};
  const dist = [
    d.highway != null ? `highway ${km(d.highway)}` : null,
    d.rail != null ? `rail ${km(d.rail)}` : null,
    d.airport != null ? `airport ${km(d.airport)}` : null,
    d.metro != null ? `metro ${km(d.metro)}` : null,
  ].filter(Boolean);
  if (dist.length) out.push(`  distances: ${dist.join(', ')}`);

  const lv = s.landValue;
  if (lv) {
    const bits = [
      lv.estimatedPerSqYardInr ? `est Rs ${inr(lv.estimatedPerSqYardInr)}/sqyd` : null,
      lv.circleRatePerSqYardInr ? `circle-floor Rs ${inr(lv.circleRatePerSqYardInr)}/sqyd` : null,
      lv.estimatedLowPerSqYardInr && lv.estimatedHighPerSqYardInr
        ? `range Rs ${inr(lv.estimatedLowPerSqYardInr)}-${inr(lv.estimatedHighPerSqYardInr)}`
        : null,
      lv.district || null,
      lv.confidence ? `confidence ${lv.confidence}` : null,
    ].filter(Boolean);
    if (bits.length) out.push(`  land: ${bits.join(' | ')}`);
  }

  const z = s.zoning;
  if (z) {
    const bits = [
      z.insideHsiidc ? 'inside HSIIDC estate' : null,
      !z.insideHsiidc && z.nearestHsiidcKm != null ? `nearest HSIIDC ${km(z.nearestHsiidcKm)}` : null,
      z.landUseClass || null,
      z.controlledArea ? `controlled area: ${z.controlledArea}` : null,
    ].filter(Boolean);
    if (bits.length) out.push(`  zoning: ${bits.join(' | ')}`);
  }

  const ins = s.insights;
  if (ins) {
    if (ins.verdict) out.push(`  verdict: ${ins.verdict}`);
    if (ins.summary) out.push(`  summary: ${ins.summary}`);
    if (ins.strengths?.length) out.push(`  strengths: ${ins.strengths.slice(0, 3).join('; ')}`);
    if (ins.cautions?.length) out.push(`  cautions: ${ins.cautions.slice(0, 3).join('; ')}`);
  }
  return out;
}

/**
 * Compact the ranked shortlist. Indexed so follow-ups can say "#2".
 *
 * Source tables legitimately contain several parcels sharing one estate name (e.g. multiple
 * "HSIIDC Gurgaon Zone" polygons), which reads as a duplicate bug and makes "#2" ambiguous.
 * Where names repeat we append a distinguishing detail so each row is identifiable.
 */
function renderOpportunities(rows, limit) {
  if (!rows?.length) return [];
  const out = ['RANKED ZONES (only these exist — never invent others):'];
  const nameCounts = new Map();
  for (const z of rows.slice(0, limit)) {
    nameCounts.set(z.name, (nameCounts.get(z.name) || 0) + 1);
  }
  const seen = new Map();
  rows.slice(0, limit).forEach((z, i) => {
    const bits = [
      `${z.opportunityScore}/100`,
      z.verdict || null,
      z.zoneType || null,
      z.areaAcres != null ? `${Number(z.areaAcres).toFixed(1)}ac` : null,
      z.landValue?.estimatedPerSqYardInr
        ? `Rs ${inr(z.landValue.estimatedPerSqYardInr)}/sqyd`
        : null,
      z.landCostBand || null,
      z.distanceKm != null ? `${km(z.distanceKm)} from pin` : null,
      z.availability || null,
      z.utilityReadiness != null ? `utilities ${z.utilityReadiness}` : null,
      z.keyRisk ? `risk: ${z.keyRisk}` : null,
    ].filter(Boolean);

    let label = z.name;
    if ((nameCounts.get(z.name) || 0) > 1) {
      const n = (seen.get(z.name) || 0) + 1;
      seen.set(z.name, n);
      const detail =
        z.areaAcres != null ? `${Number(z.areaAcres).toFixed(0)} ac parcel` : `parcel ${n}`;
      label = `${z.name} — ${detail}`;
    }
    out.push(`  #${i + 1} [${z.id}] ${label} (${z.district}) — ${bits.join(' | ')}`);
  });
  return out;
}

function renderPolicies(rows) {
  if (!rows?.length) return [];
  const out = ['POLICY EXCERPTS (cite by citation string):'];
  rows.slice(0, 3).forEach((p) => {
    out.push(`  ${p.citation}: ${String(p.excerpt || '').slice(0, 220)}`);
  });
  return out;
}

/**
 * Render grounding context to a compact prompt block within a token budget.
 *
 * Sections are emitted in priority order and truncated from the bottom, so the
 * highest-value facts survive a tight budget.
 *
 * @returns {{text: string, approxTokens: number, dropped: string[], oppCount: number}}
 */
function renderContext(context = {}, { tokenBudget = DEFAULT_TOKEN_BUDGET } = {}) {
  const dropped = [];

  const head = [
    line('SECTOR', context.sector),
    line('DISTRICT', context.district),
    line('BUDGET_INR', context.budgetInr ? `Rs ${inr(context.budgetInr)}` : null),
    line('RISK_FILTER', context.risk),
    line('MAP_PIN', context.mapPoint ? `${context.mapPoint.lat},${context.mapPoint.lng}` : null),
    line('INTENTS', (context.intents || []).join(',')),
  ].filter(Boolean);

  if (context.budgetRelaxed) {
    head.push(
      'NOTE: nothing fit the stated budget, so these are the best options above it. Mention this once, naturally, in a short clause — do not lead with it or labour the point.'
    );
  }
  if (context.coverage?.mode) {
    head.push(
      `COVERAGE: ${context.coverage.mode}${
        context.coverage.candidatesScored ? ` (${context.coverage.candidatesScored} sites scored)` : ''
      }`
    );
  }

  const howItWorks = context.howItWorks
    ? [
        'HOW IT WORKS (explain only from this):',
        `  engine: ${context.howItWorks.engine}`,
        `  components: ${(context.howItWorks.components || []).join(', ')}`,
        `  land: ${context.howItWorks.land}`,
        `  investor: ${context.howItWorks.investor}`,
        `  transparency: ${context.howItWorks.transparency}`,
      ]
    : [];

  // Priority order: identity/filters → pin score → shortlist → policy → notes.
  const glossary = context.glossary?.length
    ? [
        'DEFINITIONS ASKED FOR (answer from these, in the user\'s language):',
        ...context.glossary.slice(0, 3).map((t) => `  ${t.term}: ${t.en} Why: ${t.why}`),
      ]
    : [];

  const sections = [
    { name: 'head', lines: head, required: true },
    { name: 'glossary', lines: glossary, required: true },
    { name: 'howItWorks', lines: howItWorks },
    { name: 'score', lines: renderScore(context.scoredLocation) },
    { name: 'opportunities', lines: renderOpportunities(context.opportunities, 6) },
    { name: 'policies', lines: renderPolicies(context.policies) },
    {
      name: 'notes',
      lines: (context.notes || []).length ? ['NOTES:', ...context.notes.slice(0, 3).map((n) => `  ${n}`)] : [],
    },
  ];

  const kept = [];
  let used = 0;
  for (const section of sections) {
    if (!section.lines.length) continue;
    const text = section.lines.join('\n');
    const cost = approxTokens(text);
    if (!section.required && used + cost > tokenBudget) {
      // Try a shrunken shortlist rather than dropping it wholesale.
      if (section.name === 'opportunities') {
        const small = renderOpportunities(context.opportunities, 3).join('\n');
        if (used + approxTokens(small) <= tokenBudget) {
          kept.push(small);
          used += approxTokens(small);
          dropped.push('opportunities:truncated-to-3');
          continue;
        }
      }
      dropped.push(section.name);
      continue;
    }
    kept.push(text);
    used += cost;
  }

  if (context.opportunities?.length === 0 && context.intents?.includes('opportunities')) {
    kept.push('RANKED ZONES: none matched. Say no match; do NOT name any zone.');
  }

  const text = kept.join('\n');
  return {
    text,
    approxTokens: approxTokens(text),
    dropped,
    oppCount: context.opportunities?.length || 0,
  };
}

module.exports = { renderContext, DEFAULT_TOKEN_BUDGET };
