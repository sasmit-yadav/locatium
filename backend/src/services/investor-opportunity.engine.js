/**
 * Investor opportunity ranking v3 — aligned with scoring-engine v3-investment.
 */

const { SCORING_VERSION, clampScore, normalizeSector } = require('./scoring-engine');

const OPPORTUNITY_VERSION = 'investor-v3.2';

const BUDGET_INR = {
  micro: { max: 10_000_000 },
  low: { max: 50_000_000 },
  medium: { min: 50_000_000, max: 250_000_000 },
  high: { min: 250_000_000 },
};

/** Illustrative Haryana conveyance stamp + registration on land consideration (company/default). */
const HARYANA_STAMP_DUTY_PCT = 0.05;
const HARYANA_REGISTRATION_PCT = 0.01;

const SQ_YARDS_PER_ACRE = 4840;
const SQ_FT_PER_SQ_YARD = 9;
const SQM_PER_ACRE = 4046.8564224;
const MAX_INVESTABLE_ACRES = 25;
const MAX_PLOT_ACRES_FOR_MEDIAN = 10;

const DEFAULT_INVESTABLE_ACRES = {
  industrial: 2,
  commercial: 0.5,
  residential: 0.15,
  agricultural: 5,
};

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Typical single-parcel area for budget/capex — not full estate boundary. */
function resolveInvestableArea(zone, plotInventory, sector) {
  const plots = plotInventory?.plots || [];
  const normalized = normalizeSector(sector);
  const typicalCap = normalized === 'industrial' ? 5 : normalized === 'commercial' ? 2 : 1;

  const plotAreasSqm = plots
    .map((p) => Number(p.areaSqm))
    .filter((v) => v > 0 && v / SQM_PER_ACRE <= MAX_PLOT_ACRES_FOR_MEDIAN);

  if (plotAreasSqm.length) {
    const medianSqm = median(plotAreasSqm);
    const rawAcres = medianSqm / SQM_PER_ACRE;
    const acres = Number(Math.min(rawAcres, typicalCap, MAX_INVESTABLE_ACRES).toFixed(3));
    return {
      acres,
      sqm: Math.round(acres * SQM_PER_ACRE),
      sqYards: Math.round(acres * SQ_YARDS_PER_ACRE),
      source: 'plot_median',
      plotCount: plotAreasSqm.length,
    };
  }

  const zoneAcres = Number(zone.areaAcres) || 0;
  if (zoneAcres > 0 && zoneAcres <= MAX_INVESTABLE_ACRES) {
    return {
      acres: zoneAcres,
      sqm: Math.round(zoneAcres * SQM_PER_ACRE),
      sqYards: Math.round(zoneAcres * SQ_YARDS_PER_ACRE),
      source: 'zone_parcel',
      plotCount: 0,
    };
  }

  const defaultAcres = Math.min(DEFAULT_INVESTABLE_ACRES[normalized] || DEFAULT_INVESTABLE_ACRES.industrial, typicalCap);
  return {
    acres: defaultAcres,
    sqm: Math.round(defaultAcres * SQM_PER_ACRE),
    sqYards: Math.round(defaultAcres * SQ_YARDS_PER_ACRE),
    source: 'sector_default',
    plotCount: 0,
  };
}

function sectorMatchScore(zone, sector) {
  const requested = normalizeSector(sector);
  const haystack = `${zone.type} ${zone.name} ${zone.description}`.toLowerCase();
  if (requested === 'industrial') return haystack.includes('industrial') || haystack.includes('hsiidc') ? 100 : 62;
  if (requested === 'commercial') return haystack.includes('commercial') ? 100 : haystack.includes('urban') ? 76 : 54;
  if (requested === 'residential') return haystack.includes('residential') ? 100 : haystack.includes('urban') ? 72 : 42;
  if (requested === 'agricultural') return haystack.includes('land-bank') || haystack.includes('land bank') ? 88 : 45;
  return 65;
}

function computeCluScore(zoning, sector) {
  if (!zoning) return 50;
  let score = 50;
  if (zoning.insideHsiidc && normalizeSector(sector) === 'industrial') score += 30;
  if (zoning.developmentPlanKm != null && zoning.developmentPlanKm < 2) score += 12;
  if (zoning.controlledAreaKm != null && zoning.controlledAreaKm < 1) score += 8;
  const lu = (zoning.landUseClass || '').toLowerCase();
  if (normalizeSector(sector) === 'industrial' && (lu.includes('industrial') || lu.includes('manufact'))) score += 18;
  if (normalizeSector(sector) === 'agricultural' && lu.includes('agri')) score += 15;
  if (normalizeSector(sector) === 'agricultural' && lu && !lu.includes('agri') && !lu.includes('unknown')) score -= 18;
  return clampScore(score);
}

function computeUtilityScore(details) {
  const zoneMetrics = details?.zoneCompatibility?.metrics || {};
  const water = Number(zoneMetrics.waterNetworkCount ?? zoneMetrics.waterLines ?? zoneMetrics.utilityWater ?? 0);
  const power = Number(zoneMetrics.powerAssets ?? zoneMetrics.electricAssets ?? zoneMetrics.utilityPower ?? 0);
  const sewer = Number(zoneMetrics.sewerLines ?? zoneMetrics.sewerageLines ?? 0);
  const raw = Math.min(water, 10) * 6 + Math.min(power, 10) * 7 + Math.min(sewer, 6) * 4;
  return clampScore(35 + raw);
}

function buildKeyRiskLine(analysis) {
  const env = analysis?.details?.environmentalRisk?.metrics || {};
  const zone = analysis?.details?.zoneCompatibility?.metrics || {};
  const parts = [];
  if (env.nearestForestKm != null && env.nearestForestKm < 1) {
    parts.push(`forest ${Number(env.nearestForestKm).toFixed(1)} km`);
  }
  if (env.nearestLowLyingAreaKm != null && env.nearestLowLyingAreaKm < 1) {
    parts.push(`flood/low-lying ${Number(env.nearestLowLyingAreaKm).toFixed(1)} km`);
  }
  const water = zone.waterNetworkCount ?? zone.waterLines ?? zone.utilityWater;
  const power = zone.powerAssets ?? zone.electricAssets ?? zone.utilityPower;
  if ((Number(water) || 0) + (Number(power) || 0) === 0) {
    parts.push('no utility mesh within 2 km');
  }
  if ((analysis?.scores?.environmentalRisk ?? 100) < 45) {
    parts.push('low environmental suitability');
  }
  return parts.length ? parts.slice(0, 2).join('; ') : 'No major nearby risk flags in available layers';
}

function buildRegulatoryChecklist(sector, zoning, policySnippets = []) {
  const sec = normalizeSector(sector);
  const items = [
    {
      id: 'eia',
      label: 'EIA screening',
      status: sec === 'industrial' || sec === 'commercial' ? 'likely_required' : 'review',
      note: 'Confirm category with State Environment Impact Assessment Authority',
    },
    {
      id: 'forest',
      label: 'Forest clearance',
      status: zoning?.insideHsiidc ? 'unlikely' : 'review_if_proximate',
      note: 'Required if within 1 km of notified forest (verify on ground)',
    },
    {
      id: 'clu',
      label: 'CLU / DTCP',
      status: zoning?.insideHsiidc ? 'hsiidc_estate_path' : 'clu_likely',
      note: zoning?.landUseClass ? `Land use: ${zoning.landUseClass}` : 'Verify lu_lc class against requested sector',
    },
    {
      id: 'hsiidc',
      label: 'HSIIDC NOC',
      status: zoning?.insideHsiidc ? 'required' : 'n/a',
      note: 'Industrial allotment / change-of-land-use through HSIIDC',
    },
  ];
  if (policySnippets.length) {
    items.push({
      id: 'policy',
      label: 'Policy reference',
      status: 'attached',
      note: policySnippets[0].title,
    });
  }
  return items;
}

function inferAvailability(zone) {
  const props = zone.properties || {};
  const raw = props.status || props.allotment_status || props.category || props.availability;
  if (raw) {
    const label = String(raw).trim();
    const lower = label.toLowerCase();
    let status = 'unknown';
    if (/vacant|available|open|unsold/i.test(lower)) status = 'available';
    else if (/allot|occupied|leased|sold/i.test(lower)) status = 'allotted';
    return { status, label };
  }
  return { status: 'unknown', label: 'Unknown (boundary-level data)' };
}

function estimateZoneLandCostInr(zone, landValue, investableArea) {
  const investable = investableArea || zone.investableArea || resolveInvestableArea(zone, null, 'industrial');
  const sqYards = investable?.sqYards ?? (investable?.acres ? investable.acres * SQ_YARDS_PER_ACRE : null);
  const rate = landValue?.estimatedPerSqYardInr ?? landValue?.circleRatePerSqYardInr;
  if (rate && sqYards) return Math.round(sqYards * rate);
  if (landValue?.estimatedPerSqYardInr && investable?.sqm) {
    return Math.round((Number(investable.sqm) / 0.836127) * landValue.estimatedPerSqYardInr);
  }
  return null;
}

function landCostBand(landValue) {
  const low =
    landValue?.estimatedLowPerSqYardInr ??
    landValue?.circleRatePerSqYardInr ??
    landValue?.estimatedPerSqYardInr;
  const high =
    landValue?.estimatedHighPerSqYardInr ??
    landValue?.estimatedPerSqYardInr ??
    landValue?.comparableMedianPerSqYardInr;
  if (!low && !high) return null;
  return {
    lowPerSqYard: low ? Math.round(low) : null,
    highPerSqYard: high ? Math.round(high) : null,
  };
}

function budgetFitsInr(landCostInr, budget) {
  if (!budget) return true;
  if (landCostInr == null || !Number.isFinite(Number(landCostInr))) return false;
  const band = BUDGET_INR[budget];
  if (!band) return true;
  if (band.max != null && landCostInr > band.max) return false;
  if (band.min != null && landCostInr < band.min) return false;
  return true;
}

/** @deprecated acres fallback removed — budget is INR-only. */
function budgetFitsAcres(_zone, budget) {
  return !budget;
}

function landRoiScore(landValue) {
  const premium = landValue?.marketPremiumVsFloor ?? landValue?.roiProxy;
  if (premium != null) return clampScore(50 + Number(premium) * 50);
  if (landValue?.circleRatePerSqYardInr) {
    if (landValue.confidence === 'high') return 55;
    if (landValue.confidence === 'medium') return 52;
    if (landValue.method === 'circle_rate_sector_proxy') return 42;
    return 48;
  }
  if (landValue?.method === 'insufficient_data') return 35;
  return 50;
}

function estimateAcquisitionCosts(landCostInr) {
  if (landCostInr == null || !Number.isFinite(Number(landCostInr))) return null;
  const stampDutyInr = Math.round(landCostInr * HARYANA_STAMP_DUTY_PCT);
  const registrationInr = Math.round(landCostInr * HARYANA_REGISTRATION_PCT);
  return {
    stampDutyInr,
    registrationInr,
    stampDutyPct: HARYANA_STAMP_DUTY_PCT,
    registrationPct: HARYANA_REGISTRATION_PCT,
    allInLandCostInr: landCostInr + stampDutyInr + registrationInr,
  };
}

function availabilityScore(availability) {
  if (!availability) return 50;
  if (availability.status === 'available') return 85;
  if (availability.status === 'allotted') return 35;
  return 50;
}

function verdictFromScore(score) {
  if (score >= 75) return 'shortlist';
  if (score >= 55) return 'review';
  return 'hold';
}

function buildFinancialPreview(zone, landValue, sector, investableArea) {
  const investable = investableArea || zone.investableArea || resolveInvestableArea(zone, null, sector);
  const sqYards = investable?.sqYards ?? (investable?.acres ? investable.acres * SQ_YARDS_PER_ACRE : null);
  const rate = landValue?.estimatedPerSqYardInr ?? landValue?.circleRatePerSqYardInr;
  const landCostInr = rate && sqYards ? Math.round(sqYards * rate) : null;
  const acquisition = estimateAcquisitionCosts(landCostInr);
  const allInLand = acquisition?.allInLandCostInr ?? landCostInr;
  const buildRatePerSqFt = normalizeSector(sector) === 'industrial' ? 2500 : 3200;
  const far = normalizeSector(sector) === 'industrial' ? 0.55 : 0.75;
  const buildSqFt = sqYards ? Math.round(sqYards * SQ_FT_PER_SQ_YARD * far) : null;
  const buildCostInr = buildSqFt ? Math.round(buildSqFt * buildRatePerSqFt) : null;
  const totalCapexInr = allInLand && buildCostInr ? allInLand + buildCostInr : allInLand;
  const yieldPct = normalizeSector(sector) === 'industrial' ? 0.08 : 0.065;
  const annualRentInr = buildSqFt ? Math.round(buildSqFt * 420 * 12) : null;
  const simpleRoiPct =
    totalCapexInr && annualRentInr ? Number(((annualRentInr / totalCapexInr) * 100).toFixed(1)) : null;
  const paybackYears = simpleRoiPct ? Number((100 / simpleRoiPct).toFixed(1)) : null;

  return {
    landCostInr,
    acquisition,
    allInLandCostInr: allInLand,
    buildCostInr,
    totalCapexInr,
    buildSqFt,
    investableAcres: investable?.acres ?? null,
    investableAreaSource: investable?.source ?? null,
    assumptions: {
      buildRatePerSqFt,
      far,
      yieldPct,
      investableAcres: investable?.acres,
      stampDutyPct: HARYANA_STAMP_DUTY_PCT,
      registrationPct: HARYANA_REGISTRATION_PCT,
    },
    scenarios: [
      { label: 'Conservative', roiPct: simpleRoiPct ? Number((simpleRoiPct * 0.75).toFixed(1)) : null },
      { label: 'Base', roiPct: simpleRoiPct },
      { label: 'Optimistic', roiPct: simpleRoiPct ? Number((simpleRoiPct * 1.25).toFixed(1)) : null },
    ],
    paybackYears,
    disclaimer:
      'Illustrative model — land uses gov floor + market comps (stamp 5% + registration 1%). Build/rent ROI uses proxy rates, not surveyed rents. Not investment advice.',
  };
}

const OPPORTUNITY_COMPONENT_LABELS = {
  v3Composite: 'Location quality',
  zoneTypeMatch: 'Sector fit',
  landRoi: 'Market premium vs floor',
  zoneFit: 'Zone compatibility',
  environmentalSuitability: 'Environmental suitability',
  envSuit: 'Environmental suitability',
  cluScore: 'Zoning certainty',
  cluCertainty: 'Zoning certainty',
  utilityScore: 'Utility readiness',
  utilityReadiness: 'Utility readiness',
  availability: 'Availability',
};

function buildOpportunityBreakdown(opportunity) {
  const { components = {}, weights = {} } = opportunity;
  return Object.entries(weights).map(([key, weight]) => ({
    key,
    label:
      OPPORTUNITY_COMPONENT_LABELS[key] ||
      key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
    score: components[key] ?? 0,
    weight,
    contribution: Math.round((components[key] ?? 0) * weight),
  }));
}

function computeOpportunityV3(zone, analysis, landValue, sector, extras = {}, investableArea = null) {
  const v3Overall = analysis?.overallScore ?? 0;
  const zoneTypeMatch = sectorMatchScore(zone, sector);
  const landRoi = landRoiScore(landValue);
  const zoneFit = analysis?.scores?.zoneCompatibility ?? 50;
  const envSuit = analysis?.scores?.environmentalRisk ?? 50;
  const infra = analysis?.scores?.infrastructure ?? 0;
  const access = analysis?.scores?.accessibility ?? 0;
  const cluScore = extras.cluScore ?? computeCluScore(analysis?.zoning, sector);
  const utilityScore = extras.utilityScore ?? computeUtilityScore(analysis?.details);
  const avail = availabilityScore(extras.availability);

  const opportunityScore = clampScore(
    v3Overall * 0.32 +
      zoneTypeMatch * 0.1 +
      landRoi * 0.12 +
      zoneFit * 0.1 +
      envSuit * 0.1 +
      cluScore * 0.1 +
      utilityScore * 0.08 +
      avail * 0.08
  );

  const investable = investableArea || zone.investableArea || resolveInvestableArea(zone, extras.plotInventory, sector);
  const landCostInr = estimateZoneLandCostInr(zone, landValue, investable);
  const acquisition = estimateAcquisitionCosts(landCostInr);

  return {
    opportunityScore,
    verdict: verdictFromScore(opportunityScore),
    components: {
      v3Composite: v3Overall,
      infrastructure: infra,
      accessibility: access,
      environmentalSuitability: envSuit,
      zoneFit,
      zoneTypeMatch,
      landRoi,
      cluScore,
      utilityScore,
      availability: avail,
      estimatedLandCostInr: landCostInr,
      estimatedAllInLandCostInr: acquisition?.allInLandCostInr ?? landCostInr,
      stampDutyInr: acquisition?.stampDutyInr ?? null,
      registrationInr: acquisition?.registrationInr ?? null,
      investableAcres: investable.acres,
      investableAreaSource: investable.source,
      landPerSqYard: landValue?.estimatedPerSqYardInr ?? landValue?.circleRatePerSqYardInr ?? null,
      landConfidence: landValue?.confidence ?? null,
      circleRateEffectiveFrom: landValue?.circleRateEffectiveFrom ?? null,
      cluLabel: analysis?.zoning?.landUseClass || 'unknown',
    },
    investableArea: investable,
    weights: {
      v3Composite: 0.32,
      zoneTypeMatch: 0.1,
      landRoi: 0.12,
      zoneFit: 0.1,
      environmentalSuitability: 0.1,
      cluScore: 0.1,
      utilityScore: 0.08,
      availability: 0.08,
    },
    scoringVersion: OPPORTUNITY_VERSION,
    analysisScoringVersion: analysis?.scoringVersion || SCORING_VERSION,
    landValue,
    landCostBand: landCostBand(landValue),
    explain: buildExplainLines({
      opportunityScore,
      v3Overall,
      zoneTypeMatch,
      landRoi,
      zoneFit,
      envSuit,
      cluScore,
      utilityScore,
      avail,
      landCostInr,
      allInLandCostInr: acquisition?.allInLandCostInr ?? landCostInr,
      landValue,
      zoning: analysis?.zoning,
    }),
  };
}

function buildExplainLines({
  opportunityScore,
  v3Overall,
  zoneTypeMatch,
  landRoi,
  zoneFit,
  envSuit,
  cluScore,
  utilityScore,
  avail,
  landCostInr,
  allInLandCostInr,
  landValue,
  zoning,
}) {
  const lines = [
    `Overall opportunity score ${opportunityScore}/100 (location quality ${v3Overall}/100).`,
    `Sector fit ${zoneTypeMatch}/100 · zone compatibility ${zoneFit}/100 · environmental suitability ${envSuit}/100.`,
    `Zoning certainty ${cluScore}/100${zoning?.landUseClass ? ` (${zoning.landUseClass})` : ''} · utility readiness ${utilityScore}/100.`,
  ];
  if (landCostInr) {
    const allIn = allInLandCostInr && allInLandCostInr !== landCostInr ? allInLandCostInr : null;
    lines.push(
      allIn
        ? `Estimated land ~₹${landCostInr.toLocaleString('en-IN')} (all-in with stamp/reg ~₹${allIn.toLocaleString('en-IN')}).`
        : `Estimated land cost ~₹${landCostInr.toLocaleString('en-IN')}.`
    );
  }
  if (landValue?.circleRateEffectiveFrom) {
    lines.push(`Collector-rate vintage ${landValue.circleRateEffectiveFrom}${landValue.confidence ? ` · ${landValue.confidence} confidence` : ''}.`);
  }
  lines.push(`Market premium vs floor ${landRoi}/100 · availability ${avail}/100.`);
  return lines;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearMeFits(zone, nearLat, nearLng, radiusKm = 25) {
  if (nearLat == null || nearLng == null) return true;
  return haversineKm(nearLat, nearLng, zone.center.lat, zone.center.lng) <= radiusKm;
}

function riskFitsV3(analysis, risk) {
  if (!risk) return true;
  const env = analysis?.scores?.environmentalRisk ?? 0;
  if (risk === 'low') return env >= 70;
  if (risk === 'medium') return env >= 45;
  return env >= 20;
}

module.exports = {
  OPPORTUNITY_VERSION,
  BUDGET_INR,
  HARYANA_STAMP_DUTY_PCT,
  HARYANA_REGISTRATION_PCT,
  SQ_YARDS_PER_ACRE,
  SQM_PER_ACRE,
  MAX_INVESTABLE_ACRES,
  DEFAULT_INVESTABLE_ACRES,
  resolveInvestableArea,
  sectorMatchScore,
  computeCluScore,
  computeUtilityScore,
  buildKeyRiskLine,
  buildRegulatoryChecklist,
  inferAvailability,
  buildFinancialPreview,
  buildOpportunityBreakdown,
  estimateZoneLandCostInr,
  estimateAcquisitionCosts,
  budgetFitsInr,
  budgetFitsAcres,
  computeOpportunityV3,
  haversineKm,
  nearMeFits,
  riskFitsV3,
  verdictFromScore,
};
