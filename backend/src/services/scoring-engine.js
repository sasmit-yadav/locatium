/**
 * LOCATIUM scoring engine v2 — industry-grade deterministic spatial investment screening.
 * Single source of truth for component formulas, sector weights, and score breakdown.
 */

const SCORING_VERSION = 'v3-investment';

const SECTOR_WEIGHTS = {
  industrial: {
    infrastructure: 0.2,
    accessibility: 0.35,
    environmentalRisk: 0.25,
    zoneCompatibility: 0.2,
  },
  residential: {
    infrastructure: 0.35,
    accessibility: 0.25,
    environmentalRisk: 0.25,
    zoneCompatibility: 0.15,
  },
  commercial: {
    infrastructure: 0.25,
    accessibility: 0.35,
    environmentalRisk: 0.2,
    zoneCompatibility: 0.2,
  },
  agricultural: {
    infrastructure: 0.15,
    accessibility: 0.2,
    environmentalRisk: 0.45,
    zoneCompatibility: 0.2,
  },
};

const DEFAULT_SECTOR = 'industrial';

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function proximityScore(distanceKm, maxKm) {
  if (distanceKm === null || distanceKm === undefined) return 0;
  return clampScore((1 - Math.min(distanceKm / maxKm, 1)) * 100);
}

function riskFromDistance(distanceKm, maxKm) {
  if (distanceKm === null || distanceKm === undefined) return 0;
  return clampScore((1 - Math.min(distanceKm / maxKm, 1)) * 100);
}

/** Logarithmic saturation — prevents dense urban cores from maxing at identical 100. */
function saturatingScore(rawPoints, halfSaturation = 55) {
  if (rawPoints <= 0) return 0;
  return clampScore(100 * (1 - Math.exp(-rawPoints / halfSaturation)));
}

function normalizeSector(sector) {
  const key = typeof sector === 'string' ? sector.trim().toLowerCase() : DEFAULT_SECTOR;
  return SECTOR_WEIGHTS[key] ? key : DEFAULT_SECTOR;
}

function getSectorWeights(sector) {
  return { ...SECTOR_WEIGHTS[normalizeSector(sector)] };
}

/** Sublinear count scoring — sqrt curve differentiates 7 vs 21 hospitals without flat 100. */
function amenityCountScore(count, factor) {
  if (!count || count <= 0) return 0;
  return clampScore(factor * Math.sqrt(count));
}

function computeInfrastructureScore({ hospitals = 0, schools = 0, civicFacilities = 0, iti = 0 }) {
  const healthScore = amenityCountScore(hospitals, 18);
  const educationScore = amenityCountScore(schools, 14);
  const civicScore = amenityCountScore(civicFacilities + iti * 1.2, 12);
  const score = clampScore(healthScore * 0.4 + educationScore * 0.35 + civicScore * 0.25);
  const rawPoints = hospitals * 12 + schools * 8 + civicFacilities * 6 + iti * 10;
  return {
    score,
    metrics: {
      radiusKm: 5,
      hospitals,
      schools,
      civicFacilities,
      iti,
      rawPoints,
      healthScore,
      educationScore,
      civicScore,
      formula: '0.4×18√hospitals + 0.35×14√schools + 0.25×12√(civic+ITI) — sublinear amenity density',
    },
  };
}

function computeAccessibilityScore({
  nearestRoadKm,
  nearestRailKm,
  nearestAirportKm,
  nearestMunicipalBoundaryKm,
  nearestMetroKm,
  busStopsWithin2Km = 0,
  sector = DEFAULT_SECTOR,
}) {
  const highway = proximityScore(nearestRoadKm, 20);
  const rail = proximityScore(nearestRailKm, 30);
  const airport = proximityScore(nearestAirportKm, 60);
  const urban = proximityScore(nearestMunicipalBoundaryKm, 50);
  const metro = proximityScore(nearestMetroKm, 25);
  const busBonus = clampScore(Math.min(busStopsWithin2Km * 4, 20));

  let score;
  let formula;
  if (normalizeSector(sector) === 'residential' || normalizeSector(sector) === 'commercial') {
    score = highway * 0.22 + rail * 0.18 + airport * 0.15 + urban * 0.2 + metro * 0.15 + busBonus * 0.1;
    formula = '0.22×road + 0.18×rail + 0.15×airport + 0.20×urban + 0.15×metro + 0.10×bus (res/commercial)';
  } else {
    score = highway * 0.28 + rail * 0.27 + airport * 0.2 + urban * 0.15 + metro * 0.05 + busBonus * 0.05;
    formula = '0.28×road + 0.27×rail + 0.20×airport + 0.15×urban + 0.05×metro + 0.05×bus (industrial/agri)';
  }

  return {
    score: clampScore(score),
    metrics: {
      nearestRoadKm,
      nearestRailKm,
      nearestAirportKm,
      nearestMunicipalBoundaryKm,
      nearestMetroKm,
      busStopsWithin2Km,
      formula,
    },
  };
}

/** Air-quality proxy when live AQI stations are unavailable (CPCB integration planned). */
function estimateAirQualityRisk({ nearestMunicipalBoundaryKm, nearestIndustrialZoneKm, roadsWithin3Km = 0 }) {
  const urbanRisk = nearestMunicipalBoundaryKm != null ? riskFromDistance(nearestMunicipalBoundaryKm, 15) : 25;
  const industrialRisk =
    nearestIndustrialZoneKm != null ? riskFromDistance(nearestIndustrialZoneKm, 8) : 0;
  const trafficProxy = clampScore(Math.min(roadsWithin3Km * 2.5, 35));
  return clampScore(urbanRisk * 0.35 + industrialRisk * 0.35 + trafficProxy * 0.3);
}

/** Blend CPCB station AQI with spatial proxy when station data exists. */
function resolveAirQualityRisk({
  nearestMunicipalBoundaryKm,
  nearestIndustrialZoneKm,
  roadsWithin3Km = 0,
  stationAqi = null,
}) {
  const proxyRisk = estimateAirQualityRisk({
    nearestMunicipalBoundaryKm,
    nearestIndustrialZoneKm,
    roadsWithin3Km,
  });
  if (stationAqi == null || Number.isNaN(Number(stationAqi))) {
    return { airQualityRisk: proxyRisk, airQualitySource: 'spatial_proxy', stationAqi: null };
  }
  const aqi = Number(stationAqi);
  const aqiRisk = clampScore(Math.min(100, Math.max(0, ((aqi - 50) / 250) * 100)));
  const blended = clampScore(aqiRisk * 0.65 + proxyRisk * 0.35);
  return { airQualityRisk: blended, airQualitySource: 'cpcb_station_blend', stationAqi: aqi };
}

function computeEnvironmentalScore({
  nearestForestKm,
  nearestLowLyingAreaKm,
  nearestWaterBodyKm,
  nearestMunicipalBoundaryKm,
  nearestIndustrialZoneKm,
  roadsWithin3Km = 0,
  stationAqi = null,
}) {
  const forestRisk = riskFromDistance(nearestForestKm, 10);
  const floodRisk = riskFromDistance(nearestLowLyingAreaKm, 10);
  const waterRisk = riskFromDistance(nearestWaterBodyKm, 5);
  const air = resolveAirQualityRisk({
    nearestMunicipalBoundaryKm,
    nearestIndustrialZoneKm,
    roadsWithin3Km,
    stationAqi,
  });

  const risk = forestRisk * 0.32 + floodRisk * 0.24 + waterRisk * 0.18 + air.airQualityRisk * 0.26;

  return {
    score: clampScore(100 - risk),
    risk: clampScore(risk),
    metrics: {
      nearestForestKm,
      nearestLowLyingAreaKm,
      nearestWaterBodyKm,
      airQualityRisk: air.airQualityRisk,
      airQualitySource: air.airQualitySource,
      stationAqi: air.stationAqi,
      formula:
        air.airQualitySource === 'cpcb_station_blend'
          ? 'suitability = 100 − (forest×0.32 + flood×0.24 + water×0.18 + blended_AQI×0.26)'
          : 'suitability = 100 − (forest×0.32 + flood×0.24 + water×0.18 + air_proxy×0.26)',
    },
  };
}

function computeZoneCompatibilityScore({
  sector,
  nearestIndustrialZoneKm,
  nearestLicensedColonyKm,
  waterNetworkWithin2Km = 0,
  powerAssetsWithin3Km = 0,
  roadsWithin3Km = 0,
  environmentalRisk = 0,
  nearestMetroKm,
  hospitalsWithin5Km = 0,
  schoolsWithin5Km = 0,
  nearestWaterBodyKm = null,
  insideHsiidc = false,
  landUseClass = null,
  controlledAreaKm = null,
  developmentPlanKm = null,
}) {
  const normalized = normalizeSector(sector);
  let score = 50;
  const adjustments = [];

  const utilityScore = clampScore(Math.min(waterNetworkWithin2Km + powerAssetsWithin3Km, 12) * (100 / 12));
  score += utilityScore * 0.18;
  adjustments.push(`utilities +${Math.round(utilityScore * 0.18)}`);

  const transportScore = clampScore(Math.min(roadsWithin3Km, 15) * (100 / 15));
  score += transportScore * 0.12;
  adjustments.push(`transport mesh +${Math.round(transportScore * 0.12)}`);

  if (normalized === 'industrial') {
    const clusterBonus = insideHsiidc ? 18 : proximityScore(nearestIndustrialZoneKm, 10) * 0.22;
    score += clusterBonus;
    adjustments.push(insideHsiidc ? 'inside HSIIDC estate +18' : `HSIIDC cluster +${Math.round(clusterBonus)}`);
    if (landUseClass && /industrial|warehouse|logistics/i.test(landUseClass)) {
      score += 8;
      adjustments.push('zoning: industrial land-use +8');
    }
    if (nearestLicensedColonyKm != null) {
      const colonyPenalty = proximityScore(nearestLicensedColonyKm, 3) * 0.18;
      score -= colonyPenalty;
      adjustments.push(`residential adjacency −${Math.round(colonyPenalty)}`);
    }
  } else if (normalized === 'residential') {
    const amenityBonus = saturatingScore(hospitalsWithin5Km * 8 + schoolsWithin5Km * 5, 40) * 0.2;
    score += amenityBonus;
    adjustments.push(`amenity access +${Math.round(amenityBonus)}`);
    if (nearestIndustrialZoneKm != null && nearestIndustrialZoneKm < 3) {
      const industrialPenalty = proximityScore(nearestIndustrialZoneKm, 3) * 0.15;
      score -= industrialPenalty;
      adjustments.push(`industrial adjacency −${Math.round(industrialPenalty)}`);
    }
    if (nearestLicensedColonyKm != null && nearestLicensedColonyKm < 5) {
      score += proximityScore(nearestLicensedColonyKm, 5) * 0.1;
      adjustments.push(`planned colony context +${Math.round(proximityScore(nearestLicensedColonyKm, 5) * 0.1)}`);
    }
  } else if (normalized === 'commercial') {
    const urbanBonus = proximityScore(nearestMetroKm, 15) * 0.2 + proximityScore(nearestIndustrialZoneKm, 20) * 0.05;
    score += urbanBonus;
    adjustments.push(`urban/metro catchment +${Math.round(urbanBonus)}`);
  } else if (normalized === 'agricultural') {
    const waterBonus = clampScore(Math.min(waterNetworkWithin2Km, 8) * 12.5) * 0.15;
    score += waterBonus;
    if (nearestWaterBodyKm != null && nearestWaterBodyKm < 2) {
      score += proximityScore(nearestWaterBodyKm, 2) * 0.08;
    }
    adjustments.push(`irrigation potential +${Math.round(waterBonus)}`);
  }

  if (controlledAreaKm != null && controlledAreaKm < 1) {
    score -= 12;
    adjustments.push('controlled area restriction −12');
  }
  if (developmentPlanKm != null && developmentPlanKm < 2) {
    score += 5;
    adjustments.push('development plan alignment +5');
  }

  const envPenalty = (environmentalRisk / 100) * 28;
  score -= envPenalty;
  adjustments.push(`environmental constraints −${Math.round(envPenalty)}`);

  return {
    score: clampScore(score),
    metrics: {
      sector: normalized,
      nearestIndustrialZoneKm,
      nearestLicensedColonyKm,
      waterNetworkWithin2Km,
      powerAssetsWithin3Km,
      roadsWithin3Km,
      environmentalRisk,
      nearestMetroKm,
      landUseClass,
      insideHsiidc,
      controlledAreaKm,
      developmentPlanKm,
      adjustments,
      formula: 'base 50 + sector zoning/utility/transport bonuses − environmental penalty (continuous)',
    },
  };
}

function computeOverallScore(scores, sector) {
  const weights = getSectorWeights(sector);
  const overall = clampScore(
    scores.infrastructure * weights.infrastructure +
      scores.accessibility * weights.accessibility +
      scores.environmentalRisk * weights.environmentalRisk +
      scores.zoneCompatibility * weights.zoneCompatibility
  );
  return { overallScore: overall, weights };
}

function buildScoreBreakdown({ scores, details, weights, sector }) {
  const normalized = normalizeSector(sector);
  return [
    {
      component: 'Infrastructure',
      key: 'infrastructure',
      score: scores.infrastructure,
      weight: weights.infrastructure,
      weightedContribution: clampScore(scores.infrastructure * weights.infrastructure),
      note: details.infrastructure?.metrics?.summary || 'Roads, power, water and nearby civic assets',
    },
    {
      component: 'Accessibility',
      key: 'accessibility',
      score: scores.accessibility,
      weight: weights.accessibility,
      weightedContribution: clampScore(scores.accessibility * weights.accessibility),
      note: details.accessibility?.metrics?.summary || 'Road, rail, airport and urban access',
    },
    {
      component: 'Environmental suitability',
      key: 'environmentalRisk',
      score: scores.environmentalRisk,
      weight: weights.environmentalRisk,
      weightedContribution: clampScore(scores.environmentalRisk * weights.environmentalRisk),
      note: 'Higher score = lower constraint risk (safer site)',
    },
    {
      component: 'Zone fit',
      key: 'zoneCompatibility',
      score: scores.zoneCompatibility,
      weight: weights.zoneCompatibility,
      weightedContribution: clampScore(scores.zoneCompatibility * weights.zoneCompatibility),
      note: details.zoneCompatibility?.metrics?.summary || 'How well the site matches the chosen sector',
    },
    {
      component: 'Overall',
      key: 'overall',
      score: computeOverallScore(scores, normalized).overallScore,
      weight: 1,
      weightedContribution: computeOverallScore(scores, normalized).overallScore,
      note: `Sector profile: ${normalized}`,
    },
  ];
}

module.exports = {
  SCORING_VERSION,
  SECTOR_WEIGHTS,
  DEFAULT_SECTOR,
  clampScore,
  proximityScore,
  riskFromDistance,
  saturatingScore,
  normalizeSector,
  getSectorWeights,
  estimateAirQualityRisk,
  resolveAirQualityRisk,
  computeInfrastructureScore,
  computeAccessibilityScore,
  computeEnvironmentalScore,
  computeZoneCompatibilityScore,
  computeOverallScore,
  buildScoreBreakdown,
};
