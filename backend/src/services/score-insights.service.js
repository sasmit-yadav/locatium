const { SCORING_VERSION } = require('./scoring-engine');

function formatKm(km) {
  if (km === null || km === undefined || Number.isNaN(Number(km))) return null;
  return `${Number(km).toFixed(1)} km`;
}

function buildScoreInsights(result) {
  if (!result || typeof result.overallScore !== 'number') {
    return {
      verdict: 'Awaiting analysis',
      summary: 'Select a map location to generate a location intelligence brief.',
      strengths: [],
      cautions: [],
      opportunities: [],
      methodology: '',
    };
  }

  const {
    overallScore,
    scores = {},
    details = {},
    location = {},
    method,
    model_version,
    confidence,
    scoringVersion,
    scoreBreakdown = [],
  } = result;
  const infra = details.infrastructure?.metrics || {};
  const access = details.accessibility?.metrics || {};
  const env = details.environmentalRisk?.metrics || {};
  const zone = details.zoneCompatibility?.metrics || {};

  const strengths = [];
  const cautions = [];
  const opportunities = [];

  if (scores.infrastructure >= 75) {
    strengths.push(
      `Strong social & civic infrastructure — ${infra.hospitals || 0} hospitals, ${infra.schools || 0} schools, ${infra.civicFacilities || 0} power/civic assets, ${infra.iti || 0} ITI within 5 km (log-scaled score ${scores.infrastructure}/100).`
    );
  } else if (scores.infrastructure >= 45) {
    cautions.push(
      `Moderate infrastructure density (${infra.hospitals || 0} hospitals, ${infra.schools || 0} schools within 5 km) — validate workforce and service access.`
    );
  } else {
    cautions.push('Sparse hospitals, schools, and civic facilities within 5 km — factor in longer commutes and capex for amenities.');
  }

  const roadKm = formatKm(access.nearestRoadKm);
  const railKm = formatKm(access.nearestRailKm);
  const airportKm = formatKm(access.nearestAirportKm);
  const metroKm = formatKm(access.nearestMetroKm);

  if (access.nearestRoadKm != null && access.nearestRoadKm < 2) {
    strengths.push(`Primary road network ${roadKm} away — strong last-mile connectivity for trucks and suppliers.`);
  } else if (access.nearestRoadKm != null && access.nearestRoadKm > 8) {
    cautions.push(`Nearest major road ${roadKm} away — expect higher internal road capex.`);
  }

  if (access.nearestRailKm != null && access.nearestRailKm < 5) {
    strengths.push(`Rail corridor ${railKm} from site — favorable for bulk freight and industrial logistics.`);
  } else if (access.nearestRailKm != null && access.nearestRailKm > 25) {
    cautions.push(`Rail link ${railKm} distant — road transport will dominate supply chain costs.`);
  }

  if (access.nearestMetroKm != null && access.nearestMetroKm < 8) {
    strengths.push(`Metro station ${metroKm} away — improves employee commute and commercial catchment.`);
  }

  if (access.nearestAirportKm != null && access.nearestAirportKm < 45) {
    strengths.push(`Airport within ${airportKm} — supports executive access and time-sensitive cargo.`);
  }

  if (scores.accessibility >= 75) {
    strengths.push(`Accessibility score ${scores.accessibility}/100 — multimodal logistics connectivity is above average for Haryana NCR.`);
  } else if (scores.accessibility < 45) {
    cautions.push(`Accessibility score ${scores.accessibility}/100 — transport links are weaker than typical industrial corridors.`);
  }

  if (scores.environmentalRisk >= 70) {
    strengths.push(`Environmental suitability ${scores.environmentalRisk}/100 — flood, forest, water, and air-proxy constraints appear manageable.`);
  } else if (scores.environmentalRisk < 50) {
    cautions.push(`Environmental suitability only ${scores.environmentalRisk}/100 — plan for EIA, buffer-zone, and clearance compliance.`);
    if (env.nearestWaterBodyKm != null && env.nearestWaterBodyKm < 1) {
      cautions.push(`Surface water ${formatKm(env.nearestWaterBodyKm)} away — wetland or buffer rules may apply.`);
    }
    if (env.nearestForestKm != null && env.nearestForestKm < 2) {
      cautions.push(`Forest edge ${formatKm(env.nearestForestKm)} away — clearance and compensatory afforestation may be required.`);
    }
    if (env.airQualityRisk >= 40) {
      cautions.push(
        `Air-quality spatial proxy risk ${env.airQualityRisk}/100 (urban/industrial/traffic density) — ${env.airQualitySource === 'spatial_proxy' ? 'confirm with CPCB station data before final EIA.' : 'review local AQI.'}`
      );
    }
  }

  if (scores.zoneCompatibility >= 65) {
    strengths.push(`Zone fit ${scores.zoneCompatibility}/100 — ${zone.sector || 'industrial'} clustering, utilities, and transport align with intended land use.`);
  } else if (zone.nearestLicensedColonyKm != null && zone.nearestLicensedColonyKm < 2) {
    cautions.push(`Licensed residential colony ${formatKm(zone.nearestLicensedColonyKm)} away — mixed land-use and NOC friction possible.`);
  }

  if ((zone.waterNetworkWithin2Km || 0) > 0) {
    strengths.push(`${zone.waterNetworkWithin2Km} utility feature(s) within 2 km — water/sewer/power hook-up potential exists.`);
  } else {
    cautions.push('No mapped utility network within 2 km — confirm DIS/HVPNL/DWSS availability before acquisition.');
  }

  if ((zone.powerAssetsWithin3Km || 0) > 0) {
    strengths.push(`${zone.powerAssetsWithin3Km} power asset(s) within 3 km — grid connection feasibility improved.`);
  }

  if ((zone.roadsWithin3Km || 0) >= 8) {
    strengths.push(`${zone.roadsWithin3Km} road segments within 3 km — dense transport mesh reduces detour risk.`);
  }

  if (overallScore >= 75) {
    opportunities.push('Strong composite score — prioritize land-parcel shortlisting and utility pre-feasibility while indicators are favorable.');
  } else if (overallScore >= 55) {
    opportunities.push('Moderate score — viable with mitigations; compare 2–3 alternate parcels before commitment.');
  } else {
    opportunities.push('Lower composite score — use as a screening filter only; deep diligence required before investment.');
  }

  if (scores.accessibility >= 70 && scores.infrastructure >= 50) {
    opportunities.push('Profile suits warehousing, light manufacturing, or logistics parks leveraging road/rail/metro access.');
  }

  const verdict =
    overallScore >= 75 ? 'Strong opportunity' : overallScore >= 55 ? 'Moderate opportunity' : 'Proceed with caution';

  const lat = Number(location.lat);
  const lng = Number(location.lng);
  const coords =
    Number.isFinite(lat) && Number.isFinite(lng) ? ` (${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E)` : '';

  const summary = [
    `${(location.sector || 'Industrial').charAt(0).toUpperCase()}${(location.sector || 'industrial').slice(1)} location${coords} scores ${overallScore}/100 — ${verdict.toLowerCase()}.`,
    strengths.length
      ? `Primary advantages: ${strengths.slice(0, 2).map((s) => s.replace(/\.$/, '')).join('; ')}.`
      : 'No dominant strengths detected in current radius — review component scores below.',
    cautions.length
      ? `Watch points: ${cautions.slice(0, 2).map((c) => c.replace(/\.$/, '')).join('; ')}.`
      : 'No major red flags in the automated screening layer.',
  ].join(' ');

  const methodology =
    method === 'ml'
      ? 'Scores use the current location model. Overall may include an AI-assisted adjustment when available.'
      : 'Scores use the current location model with sector-specific priorities and nearby infrastructure context.';

  return {
    verdict,
    summary,
    strengths,
    cautions,
    opportunities,
    methodology,
    scoringVersion: scoringVersion || SCORING_VERSION,
  };
}

module.exports = { buildScoreInsights };
