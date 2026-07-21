const llmAdapter = require('./llm/llm-adapter');
const { buildScoreInsights } = require('./score-insights.service');
const { retrievePolicyContext } = require('./policy-rag.service');

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
      memo: null,
      provider: null,
    },
  };

  if (!llmAdapter.isEnabled()) {
    base.narrative.diligenceSteps = ruleInsights.opportunities;
    base.narrative.policyNotes = policyCitations.map((p) => `${p.citation}: ${p.excerpt.slice(0, 160)}…`);
    return base;
  }

  try {
    const contextBlock = buildContextBlock({ ...base, policyCitations });
    const llmResult = await llmAdapter.complete({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Generate an investor memo from this verified context:\n${contextBlock}`,
      maxTokens: 900,
    });

    base.narrative = {
      method: 'llm',
      executiveSummary: llmResult.text.split('\n').slice(0, 3).join(' ').trim(),
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
    return base;
  } catch {
    base.narrative = {
      method: 'rule_based_fallback',
      executiveSummary: ruleInsights.summary,
      memo: null,
      provider: null,
      diligenceSteps: ruleInsights.opportunities,
      policyNotes: policyCitations.map((p) => `${p.citation}: ${p.excerpt.slice(0, 160)}…`),
    };
    return base;
  }
}

module.exports = { enrichWithNarrative, buildContextBlock };
