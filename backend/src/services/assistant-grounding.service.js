/**
 * Multi-tool grounding for Ask LOCATIUM copilot.
 * Pulls live PostGIS / scoring / investor / policy data based on NLU intents.
 */

const scoringOrchestrator = require('./scoringOrchestrator');
const investorOpportunities = require('./investor-opportunities.service');
const { retrievePolicyContext } = require('./policy-rag.service');
const { extractEntities } = require('./assistant-nlu.service');

/**
 * A chat turn must return something useful in seconds. Grounding jobs that overrun this budget
 * are abandoned for *this* answer, but keep running so their result lands in the score cache
 * and the next identical ask is fast.
 *
 * Budget sized from measured cold-cache runs: a capped district scan is ~2s, and a turn with a
 * ₹ ceiling can need a second "relaxed" scan when nothing fits, so ~4s cold / ~1s warm is typical.
 * 12s leaves headroom without ever approaching the old multi-minute wait.
 */
const GROUNDING_BUDGET_MS = Number(process.env.ASSISTANT_GROUNDING_BUDGET_MS) || 12000;

/**
 * Ceiling on candidates scored for a conversational answer (see investor candidateCap).
 * 12 measured fastest end-to-end while still covering the largest parcels in a district —
 * candidates are area-sorted before the cap, so the shortlist keeps the ones worth ranking.
 */
const CONVERSATIONAL_CANDIDATE_CAP = Number(process.env.ASSISTANT_CANDIDATE_CAP) || 12;

function withDeadline(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  return Promise.race([promise.then(() => ({ timedOut: false })), timeout]).finally(() =>
    clearTimeout(timer)
  );
}

function compactScore(result) {
  if (!result) return null;
  const d = result.details || {};
  const access = d.accessibility?.metrics || {};
  const infra = d.infrastructure?.metrics || {};
  return {
    overallScore: result.overallScore,
    scores: result.scores,
    scoringVersion: result.scoringVersion,
    method: result.method,
    location: result.location,
    distancesKm: {
      highway: access.nearestRoadKm ?? infra.nearestRoadKm ?? null,
      rail: access.nearestRailKm ?? null,
      airport: access.nearestAirportKm ?? null,
      metro: access.nearestMetroKm ?? null,
      bus: access.nearestBusKm ?? null,
    },
    landValue: result.landValue
      ? {
          circleRatePerSqYardInr: result.landValue.circleRatePerSqYardInr,
          estimatedPerSqYardInr: result.landValue.estimatedPerSqYardInr,
          estimatedLowPerSqYardInr: result.landValue.estimatedLowPerSqYardInr,
          estimatedHighPerSqYardInr: result.landValue.estimatedHighPerSqYardInr,
          confidence: result.landValue.confidence,
          district: result.landValue.district,
          marketPremiumPct: result.landValue.marketPremiumPct ?? null,
          allInHint: result.landValue.allInAcquisitionNote || null,
        }
      : null,
    zoning: result.zoning
      ? {
          insideHsiidc: result.zoning.insideHsiidc,
          landUseClass: result.zoning.landUseClass,
          nearestHsiidcKm: result.zoning.nearestHsiidcKm,
          controlledArea: result.zoning.controlledArea ?? null,
        }
      : null,
    insights: result.insights
      ? {
          verdict: result.insights.verdict,
          summary: result.insights.summary,
          strengths: (result.insights.strengths || []).slice(0, 4),
          cautions: (result.insights.cautions || []).slice(0, 4),
          opportunities: (result.insights.opportunities || []).slice(0, 3),
        }
      : null,
    comparables: result.comparables?.summary || null,
    scoreBreakdown: (result.scoreBreakdown || []).slice(0, 6),
  };
}

function compactOpportunity(row) {
  return {
    id: row.id,
    name: row.name,
    district: row.district,
    opportunityScore: row.opportunityScore,
    verdict: row.verdict,
    center: row.center,
    areaAcres: row.areaAcres,
    zoneType: row.zoneType,
    landValue: row.landValue
      ? {
          estimatedPerSqYardInr: row.landValue.estimatedPerSqYardInr,
          circleRatePerSqYardInr: row.landValue.circleRatePerSqYardInr,
          confidence: row.landValue.confidence,
        }
      : null,
    landCostBand: row.landCostBand,
    keyRisk: row.keyRisk,
    utilityReadiness: row.utilityReadiness,
    distanceKm: row.distanceKm,
    availability: row.availability?.status || null,
    insightsSummary: row.insightsSummary,
  };
}

function wants(intents, ...keys) {
  return keys.some((k) => intents.includes(k));
}

/**
 * @param {{
 *   query: string,
 *   lat?: number,
 *   lng?: number,
 *   sector?: string,
 *   district?: string,
 *   zoneIds?: string[],
 *   session?: object,
 * }} input
 */
async function fetchGroundingContext(input = {}) {
  const session = input.session || {};
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const entities = extractEntities(input.query, session, { lat, lng });

  if (input.sector) entities.sector = input.sector;
  if (input.district) entities.district = input.district;

  const context = {
    product: 'LOCATIUM',
    role: 'Haryana geospatial investment copilot',
    entities,
    intents: entities.intents,
    primaryIntent: entities.primaryIntent,
    sector: entities.sector,
    district: entities.district,
    budgetInr: entities.budgetInr,
    risk: entities.risk,
    mapPoint: entities.hasPoint ? { lat, lng } : null,
    scoredLocation: null,
    opportunities: [],
    mapHighlights: [],
    compare: null,
    policies: [],
    districtsAvailable: null,
    howItWorks: null,
    notes: [],
    filtersUsed: null,
  };

  if (entities.clarification?.needed) {
    context.clarification = entities.clarification;
    context.notes.push(entities.clarification.question);
    return context;
  }

  if (entities.primaryIntent === 'help') {
    context.notes.push(
      'I am your LOCATIUM copilot: score any map click, rank industrial/residential/commercial zones, explain land ₹ (circle floor + comps), check nearby connectivity, and cite policy notes. Ask in English or Hinglish — even messy wording is fine.'
    );
    return context;
  }

  if (entities.primaryIntent === 'how_it_works') {
    context.howItWorks = {
      engine: 'v3-investment',
      components: ['infrastructure', 'accessibility', 'environmental suitability', 'zone fit'],
      land: 'Official circle_rates floor + land_transactions / HSIIDC auction comps → estimated ₹/sq yd',
      investor: 'investor-v3.2 ranks zones with INR budget fail-closed and stamp+registration all-in cost',
      transparency: 'ScoreBreakdown shows formulae; never invent numbers outside live grounding',
    };
    return context;
  }

  const jobs = [];
  const intents = entities.intents;
  const sector = entities.sector;
  const district = entities.district;
  const budgetInr = entities.budgetInr;
  const hasPoint = entities.hasPoint;

  const needScore =
    wants(intents, 'score', 'nearby', 'how_it_works') ||
    (wants(intents, 'land') && !wants(intents, 'opportunities')) ||
    (wants(intents, 'opportunities') && hasPoint && !district);

  if (needScore) {
    if (hasPoint) {
      jobs.push(
        scoringOrchestrator
          .scoreLocation({ lat, lng, sector }, { requestId: 'assistant-copilot' })
          .then((r) => {
            context.scoredLocation = compactScore(r);
          })
          .catch((err) => {
            context.notes.push(`Score unavailable: ${err.message}`);
          })
      );
    } else if (!district) {
      context.notes.push('No map pin yet — click the map, or name a district.');
    }
  }

  if (wants(intents, 'opportunities', 'land', 'compare', 'navigate')) {
    const oppQuery = {
      sector,
      limit: wants(intents, 'compare') ? 3 : 6,
      district: district || undefined,
      // Near-me filter only when user didn't name a district (pin is often far from other districts).
      nearLat: hasPoint && !district ? lat : undefined,
      nearLng: hasPoint && !district ? lng : undefined,
      risk: entities.risk || undefined,
      candidateCap: input.candidateCap ?? CONVERSATIONAL_CANDIDATE_CAP,
    };
    if (budgetInr) {
      oppQuery.maxLandCr = Math.max(0.5, Math.round((budgetInr / 1e7) * 10) / 10);
    }
    jobs.push(
      investorOpportunities
        .getOpportunities(oppQuery)
        .then(async (r) => {
          let rows = r.opportunities || [];
          context.coverage = r.coverage || null;
          context.totalCandidates = r.totalCandidates ?? null;
          context.totalMatched = r.totalMatched ?? null;
          // If ₹ cap wiped the shortlist, retry without cap and flag it.
          if (!rows.length && oppQuery.maxLandCr && (district || hasPoint)) {
            const relaxed = await investorOpportunities.getOpportunities({
              ...oppQuery,
              maxLandCr: undefined,
            });
            rows = relaxed.opportunities || [];
            context.coverage = relaxed.coverage || context.coverage;
            context.totalCandidates = relaxed.totalCandidates ?? context.totalCandidates;
            context.totalMatched = relaxed.totalMatched ?? context.totalMatched;
            if (rows.length) {
              context.notes.push(
                `No zones fit ~${oppQuery.maxLandCr} Cr all-in land cap — showing best matches without the ₹ ceiling.`
              );
              context.budgetRelaxed = true;
              context.mapHighlights = relaxed.mapHighlights || [];
              context.filtersUsed = relaxed.filters;
            }
          } else {
            context.mapHighlights = r.mapHighlights || [];
            context.filtersUsed = r.filters;
          }
          context.opportunities = rows.map(compactOpportunity);
        })
        .catch((err) => {
          context.notes.push(`Opportunity ranking unavailable: ${err.message}`);
        })
    );
  }

  if (wants(intents, 'compare') && Array.isArray(input.zoneIds) && input.zoneIds.length >= 2) {
    jobs.push(
      investorOpportunities
        .compareZones({ ids: input.zoneIds.join(','), sector })
        .then((r) => {
          context.compare = r;
        })
        .catch((err) => {
          context.notes.push(`Compare unavailable: ${err.message}`);
        })
    );
  }

  if (wants(intents, 'policy') || /clu|eia|incentive|stamp|hsiidc|hsvp/i.test(entities.raw)) {
    jobs.push(
      retrievePolicyContext({
        sector,
        keywords: entities.normalized
          .split(/\W+/)
          .filter((w) => w.length > 3)
          .slice(0, 8),
      })
        .then((rows) => {
          context.policies = (rows || []).slice(0, 5).map((p) => ({
            citation: p.citation,
            title: p.title,
            excerpt: String(p.excerpt || '').slice(0, 320),
          }));
        })
        .catch(() => {
          context.notes.push('Policy corpus unavailable.');
        })
    );
  }

  if (wants(intents, 'opportunities') && !district) {
    jobs.push(
      investorOpportunities
        .listDistricts()
        .then((r) => {
          context.districtsAvailable = Array.isArray(r?.districts) ? r.districts.slice(0, 22) : [];
        })
        .catch(() => {})
    );
  }

  const { timedOut } = await withDeadline(
    Promise.all(jobs),
    input.groundingBudgetMs || GROUNDING_BUDGET_MS
  );
  if (timedOut) {
    context.partial = true;
    context.notes.push(
      'Some live lookups were still running, so this answer uses what had landed in time. Ask again in a moment for the fuller picture.'
    );
  }

  // If compare intent but no zoneIds, use top opportunities as implicit compare set
  if (wants(intents, 'compare') && !context.compare && context.opportunities.length >= 2) {
    context.compare = {
      mode: 'implicit_top_n',
      zones: context.opportunities.slice(0, 3),
    };
  }

  return context;
}

module.exports = {
  fetchGroundingContext,
  compactScore,
  compactOpportunity,
};
