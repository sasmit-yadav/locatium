const llmAdapter = require('./llm/llm-adapter');
const { buildScoreInsights } = require('./score-insights.service');
const { retrievePolicyContext } = require('./policy-rag.service');
const redisCache = require('./redis-cache.service');

/**
 * The memo is an enhancement on top of a score that is already complete and correct
 * without it, so it must never be what makes a map click slow.
 *
 * Three guards:
 *  - cache by rounded location + sector + score, because clicks cluster and the memo
 *    for the same parcel is the same memo;
 *  - cap concurrent provider calls, so a burst of clicks degrades to the rule-based
 *    brief instead of queueing behind a rate-limited provider (measured: a 20-click
 *    burst produced a 136s outlier);
 *  - a hard time budget, so a slow provider costs the budget and not the request.
 */
const NARRATIVE_TTL_SEC = Number(process.env.NARRATIVE_CACHE_TTL_SEC) || 900;
const NARRATIVE_MAX_INFLIGHT = Number(process.env.NARRATIVE_MAX_INFLIGHT) || 3;
const NARRATIVE_TIMEOUT_MS = Number(process.env.NARRATIVE_TIMEOUT_MS) || 6000;
const NARRATIVE_MAX_TOKENS = Number(process.env.NARRATIVE_MAX_TOKENS) || 520;

const narrativeMemory = new Map();
let narrativeInFlight = 0;

function narrativeKey(result) {
  const lat = Number(result.location?.lat);
  const lng = Number(result.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // ~111 m of rounding. Every input to the score uses 2-5 km radii, so two clicks this
  // close always describe the same site.
  return [
    'narrative:v1',
    result.location?.sector || 'industrial',
    lat.toFixed(3),
    lng.toFixed(3),
    result.overallScore ?? 'na',
  ].join(':');
}

async function readNarrativeCache(key) {
  if (!key) return null;
  const mem = narrativeMemory.get(key);
  if (mem && Date.now() - mem.at < NARRATIVE_TTL_SEC * 1000) return mem.value;
  if (mem) narrativeMemory.delete(key);

  const raw = await redisCache.getString(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    narrativeMemory.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

async function writeNarrativeCache(key, value) {
  if (!key) return;
  narrativeMemory.set(key, { at: Date.now(), value });
  if (narrativeMemory.size > 500) narrativeMemory.delete(narrativeMemory.keys().next().value);
  await redisCache.setString(key, JSON.stringify(value), NARRATIVE_TTL_SEC);
}

const SYSTEM_PROMPT = `You are LOCATIUM, a Haryana industrial land intelligence analyst.
Rules:
- Use ONLY numbers and facts provided in the context JSON. Never invent scores, distances, or prices.
- If data is missing, say "not available in current dataset".
- Write an investor-grade memo: executive summary (2-3 sentences), key strengths, key risks, diligence next steps.
- Cite policy excerpts by their citation field when relevant.
- Plain professional English. No markdown headers.`;

function buildContextBlock(result) {
  return JSON.stringify(
    {
      location: result.location,
      overallScore: result.overallScore,
      scores: result.scores,
      scoringVersion: result.scoringVersion,
      zoning: result.zoning,
      landValue: result.landValue,
      comparables: result.comparables?.summary,
      environmental: {
        suitability: result.scores?.environmentalRisk,
        risk: result.details?.environmentalRisk?.risk,
        airSource: result.details?.environmentalRisk?.metrics?.airQualitySource,
        stationAqi: result.details?.environmentalRisk?.metrics?.stationAqi,
      },
      ruleInsights: result.insights,
      policies: result.policyCitations,
    },
    null,
    2
  );
}

async function enrichWithNarrative(result) {
  const ruleInsights = result.insights || buildScoreInsights(result);

  const policyCitations = await retrievePolicyContext({
    sector: result.location?.sector,
    keywords: [
      result.zoning?.landUseClass,
      result.scores?.environmentalRisk < 50 ? 'eia' : null,
      result.zoning?.insideHsiidc ? 'hsiidc' : 'clu',
    ].filter(Boolean),
  });

  const base = {
    ...result,
    insights: ruleInsights,
    policyCitations,
    narrative: {
      method: 'rule_based',
      executiveSummary: ruleInsights.summary,
      summary: ruleInsights.summary,
      memo: null,
      provider: null,
    },
  };

  const withoutLlm = () => {
    base.narrative.diligenceSteps = ruleInsights.opportunities;
    base.narrative.policyNotes = policyCitations.map((p) => `${p.citation}: ${p.excerpt.slice(0, 160)}…`);
    return base;
  };

  if (!llmAdapter.isEnabled()) return withoutLlm();

  const cacheKey = narrativeKey(base);
  const cached = await readNarrativeCache(cacheKey);
  if (cached) {
    base.narrative = { ...cached, cached: true };
    base.insights = {
      ...ruleInsights,
      summary: cached.executiveSummary || ruleInsights.summary,
      methodology: `${ruleInsights.methodology} Narrative enhanced by ${cached.provider}/${cached.model} using grounded context only.`,
    };
    return base;
  }

  // Saturated: answer now with the rule-based brief rather than making the user wait
  // behind a provider queue for text that only decorates a score they already have.
  if (narrativeInFlight >= NARRATIVE_MAX_INFLIGHT) {
    const brief = withoutLlm();
    brief.narrative.method = 'rule_based_busy';
    return brief;
  }

  narrativeInFlight += 1;
  try {
    const contextBlock = buildContextBlock({ ...base, policyCitations });
    const llmResult = await llmAdapter.complete({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Generate an investor memo from this verified context:\n${contextBlock}`,
      maxTokens: NARRATIVE_MAX_TOKENS,
      timeoutMs: NARRATIVE_TIMEOUT_MS,
    });

    base.narrative = {
      method: 'llm',
      executiveSummary: llmResult.text.split('\n').slice(0, 3).join(' ').trim(),
      summary: llmResult.text.split('\n').slice(0, 3).join(' ').trim(),
      memo: llmResult.text,
      provider: llmResult.provider,
      model: llmResult.model,
      diligenceSteps: ruleInsights.opportunities,
      policyNotes: policyCitations.map((p) => `${p.citation} — ${p.title}`),
    };
    base.insights = {
      ...ruleInsights,
      summary: base.narrative.executiveSummary || ruleInsights.summary,
      methodology: `${ruleInsights.methodology} Narrative enhanced by ${llmResult.provider}/${llmResult.model} using grounded context only.`,
    };
    await writeNarrativeCache(cacheKey, base.narrative);
    return base;
  } catch {
    base.narrative = {
      method: 'rule_based_fallback',
      executiveSummary: ruleInsights.summary,
      summary: 'Narrative summary unavailable — scores and land pricing below are still from live data.',
      memo: null,
      provider: null,
      diligenceSteps: ruleInsights.opportunities,
      policyNotes: policyCitations.map((p) => `${p.citation}: ${p.excerpt.slice(0, 160)}…`),
    };
    return base;
  } finally {
    narrativeInFlight -= 1;
  }
}

module.exports = { enrichWithNarrative, buildContextBlock };
