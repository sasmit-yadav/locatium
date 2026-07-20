const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');
const analysisScoring = require('./analysis-scoring.service');

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const ZONE_SOURCES = {
  hsiidc_boundary: {
    table: 'hsiidc_boundary',
    type: 'industrial',
    zoneType: 'government',
    title: (row) => `HSIIDC ${clean(row.district1) || 'Industrial Estate'} Zone`,
    district: (row) => clean(row.district1) || 'Haryana',
    description: (row) => clean(row.pwd_cir) || clean(row.pwd_div) || 'HSIIDC industrial boundary',
    areaSqm: (row) => Number(row.shape_area) || null,
    areaAcres: (row) => (Number(row.shape_area) ? Number(row.shape_area) / 4046.8564224 : null),
    shortlistSql: `
      SELECT id, objectid, pwd_cir, pwd_div, district1, shape_area,
        ST_X(ST_PointOnSurface(geom)) AS lng,
        ST_Y(ST_PointOnSurface(geom)) AS lat,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0008))::json AS geometry
      FROM hsiidc_boundary
      ORDER BY shape_area DESC NULLS LAST
      LIMIT $1
    `,
  },
  karnal_land_bank: {
    table: 'karnal_land_bank',
    type: 'land-bank',
    zoneType: 'government',
    title: (row) => `${clean(row.n_v_name) || 'Karnal'} Land Bank ${clean(row.n_khas_no) ? `Khasra ${clean(row.n_khas_no)}` : ''}`.trim(),
    district: (row) => clean(row.n_d_name) || 'Karnal',
    description: (row) => [clean(row.category), clean(row.n_t_name), clean(row.n_v_name)].filter(Boolean).join(' / ') || 'Land bank parcel',
    areaSqm: (row) => Number(row.shape_area) || null,
    areaAcres: (row) => Number(row.area_acres) || (Number(row.shape_area) ? Number(row.shape_area) / 4046.8564224 : null),
    shortlistSql: `
      SELECT id, objectid, n_d_name, n_t_name, n_v_name, n_khas_no, category, area_acres, shape_area,
        ST_X(ST_PointOnSurface(geom)) AS lng,
        ST_Y(ST_PointOnSurface(geom)) AS lat,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0008))::json AS geometry
      FROM karnal_land_bank
      WHERE COALESCE(area_acres, 0) >= 0.5
      ORDER BY area_acres DESC NULLS LAST, shape_area DESC NULLS LAST
      LIMIT $1
    `,
  },
  hsvp_plots: {
    table: 'hsvp_plots',
    type: 'urban-plot',
    zoneType: 'government',
    title: (row) => `Plot ${clean(row.plot_no) || row.id}, Sector ${clean(row.sector) || 'HSVP'}`,
    district: (row) => clean(row.district) || clean(row.estate) || 'Haryana',
    description: (row) => [clean(row.parcel_subtype), clean(row.estate), clean(row.zone)].filter(Boolean).join(' / ') || 'HSVP parcel',
    areaSqm: (row) => Number(row.area_sqm) || Number(row.shape_area) || null,
    areaAcres: (row) => {
      const sqm = Number(row.area_sqm) || Number(row.shape_area);
      return sqm ? sqm / 4046.8564224 : null;
    },
    shortlistSql: `
      SELECT id, objectid, zone, estate, sector, plot_no, area_sqm, parcel_type, parcel_subtype, district, shape_area,
        ST_X(ST_PointOnSurface(geom)) AS lng,
        ST_Y(ST_PointOnSurface(geom)) AS lat,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0008))::json AS geometry
      FROM hsvp_plots
      WHERE COALESCE(area_sqm, 0) >= 1000
        AND (
          parcel_subtype ILIKE '%commercial%'
          OR parcel_subtype ILIKE '%industrial%'
          OR parcel_subtype ILIKE '%institution%'
        )
      ORDER BY area_sqm DESC NULLS LAST, shape_area DESC NULLS LAST
      LIMIT $1
    `,
  },
  licensed_colony: {
    table: 'licensed_colony',
    type: 'private-development',
    zoneType: 'private',
    title: (row) => clean(row.developer) || `${clean(row.town) || 'Licensed'} Colony ${clean(row.sector_no)}`.trim(),
    district: (row) => clean(row.dist_name) || 'Haryana',
    description: (row) => [clean(row.purpose), clean(row.town), clean(row.license_no)].filter(Boolean).join(' / ') || 'Licensed private development',
    areaSqm: (row) => Number(row.shape_area) || null,
    areaAcres: (row) => (Number(row.shape_area) ? Number(row.shape_area) / 4046.8564224 : null),
    shortlistSql: `
      SELECT id, objectid, developer, dist_name, town, license_no, purpose, sector_no, shape_area,
        ST_X(ST_PointOnSurface(geom)) AS lng,
        ST_Y(ST_PointOnSurface(geom)) AS lat,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0008))::json AS geometry
      FROM licensed_colony
      ORDER BY shape_area DESC NULLS LAST
      LIMIT $1
    `,
  },
};

function ensurePool() {
  const pool = getPool();
  if (!pool) throw AppError.serviceUnavailable('Database not configured');
  return pool;
}

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseLimit(value, fallback = DEFAULT_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(MAX_LIMIT, Math.round(parsed));
}

function normalizeBudget(value) {
  const budget = clean(value).toLowerCase();
  return ['low', 'medium', 'high'].includes(budget) ? budget : null;
}

function normalizeRisk(value) {
  const risk = clean(value).toLowerCase();
  return ['low', 'medium', 'high'].includes(risk) ? risk : null;
}

function normalizeZoneType(value) {
  const zoneType = clean(value).toLowerCase();
  return ['government', 'private', 'cooperative'].includes(zoneType) ? zoneType : null;
}

function normalizeOptions(query = {}) {
  return {
    sector: clean(query.sector).toLowerCase() || 'industrial',
    budget: normalizeBudget(query.budget),
    risk: normalizeRisk(query.risk),
    district: clean(query.district),
    zoneType: normalizeZoneType(query.zoneType || query.zone_type),
  };
}

function sectorMatchScore(zone, sector) {
  const requested = clean(sector).toLowerCase() || 'industrial';
  const haystack = `${zone.type} ${zone.name} ${zone.description}`.toLowerCase();
  if (requested === 'industrial') return haystack.includes('industrial') || haystack.includes('hsiidc') ? 100 : 62;
  if (requested === 'commercial') return haystack.includes('commercial') ? 100 : haystack.includes('urban') ? 76 : 54;
  if (requested === 'residential') return haystack.includes('residential') ? 100 : haystack.includes('urban') ? 72 : 42;
  if (requested === 'agricultural') return haystack.includes('land-bank') || haystack.includes('land bank') ? 88 : 45;
  return 65;
}

function zoneTypeFits(zone, zoneType) {
  if (!zoneType) return true;
  return zone.zoneType === zoneType;
}

function districtFits(zone, district) {
  if (!district) return true;
  return zone.district.toLowerCase().includes(district.toLowerCase());
}

function budgetFits(zone, budget) {
  if (!budget) return true;
  const acres = Number(zone.areaAcres) || 0;
  if (budget === 'low') return acres <= 2;
  if (budget === 'medium') return acres > 1 && acres <= 25;
  if (budget === 'high') return acres >= 5;
  return true;
}

function riskFits(score, risk) {
  if (!risk) return true;
  const environmental = score?.scores?.environmentalRisk ?? 0;
  if (risk === 'low') return environmental >= 70;
  if (risk === 'medium') return environmental >= 45;
  return environmental >= 20;
}

function growthPotential(score) {
  const infrastructure = score?.scores?.infrastructure ?? 0;
  const accessibility = score?.scores?.accessibility ?? 0;
  return clampScore(infrastructure * 0.45 + accessibility * 0.55);
}

function areaScore(zone, maxAreaAcres) {
  const area = Number(zone.areaAcres) || 0;
  if (!area || !maxAreaAcres) return 0;
  return clampScore((area / maxAreaAcres) * 100);
}

function opportunityScore(zone, score, maxAreaAcres, sector) {
  const infrastructure = score?.scores?.infrastructure ?? 0;
  const accessibility = score?.scores?.accessibility ?? 0;
  const zoneTypeMatch = sectorMatchScore(zone, sector);
  const availableArea = areaScore(zone, maxAreaAcres);
  const growth = growthPotential(score);

  const total = infrastructure * 0.25 + accessibility * 0.2 + zoneTypeMatch * 0.3 + availableArea * 0.15 + growth * 0.1;
  return {
    opportunityScore: clampScore(total),
    components: {
      infrastructure,
      accessibility,
      zoneTypeMatch,
      availableArea,
      growthPotential: growth,
    },
    weights: {
      infrastructure: 0.25,
      accessibility: 0.2,
      zoneTypeMatch: 0.3,
      availableArea: 0.15,
      growthPotential: 0.1,
    },
  };
}

function toZone(source, row) {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  return {
    id: `${source.table}:${row.id}`,
    tableId: source.table,
    featureId: row.id,
    name: source.title(row),
    type: source.type,
    zoneType: source.zoneType,
    district: source.district(row),
    description: source.description(row),
    areaSqm: source.areaSqm(row),
    areaAcres: source.areaAcres(row),
    center: { lat, lng },
    geometry: row.geometry || null,
    properties: Object.fromEntries(Object.entries(row).filter(([key]) => !['lat', 'lng', 'geometry'].includes(key))),
  };
}

async function fetchCandidateZones(pool, perSourceLimit) {
  const batches = await Promise.all(
    Object.values(ZONE_SOURCES).map(async (source) => {
      try {
        const { rows } = await pool.query(source.shortlistSql, [perSourceLimit]);
        return rows.map((row) => toZone(source, row)).filter((zone) => Number.isFinite(zone.center.lat) && Number.isFinite(zone.center.lng));
      } catch (err) {
        console.error(`[investor] candidate query failed for ${source.table}:`, err.message);
        return [];
      }
    })
  );
  return batches.flat();
}

async function scoreZone(zone, sector) {
  const analysis = await analysisScoring.scoreLocation({
    lat: zone.center.lat,
    lng: zone.center.lng,
    sector: sector || 'industrial',
  });
  return analysis;
}

async function rankZones(zones, options) {
  const filteredByBudget = zones.filter(
    (zone) => budgetFits(zone, options.budget) && zoneTypeFits(zone, options.zoneType) && districtFits(zone, options.district)
  );
  const maxAreaAcres = Math.max(...filteredByBudget.map((zone) => Number(zone.areaAcres) || 0), 0);
  const ranked = [];

  for (const zone of filteredByBudget) {
    const analysis = await scoreZone(zone, options.sector);
    if (!riskFits(analysis, options.risk)) continue;
    const opportunity = opportunityScore(zone, analysis, maxAreaAcres, options.sector);
    ranked.push({ ...zone, ...opportunity, analysis });
  }

  ranked.sort((a, b) => b.opportunityScore - a.opportunityScore);
  return ranked;
}

async function getOpportunities(query = {}) {
  const pool = ensurePool();
  const limit = parseLimit(query.limit);
  const options = normalizeOptions(query);

  const candidates = await fetchCandidateZones(pool, Math.max(12, Math.min(35, limit * 2)));
  const ranked = await rankZones(candidates, options);

  return {
    filters: options,
    count: Math.min(limit, ranked.length),
    totalCandidates: candidates.length,
    formula:
      'opportunity = infrastructure*0.25 + accessibility*0.20 + zoneTypeMatch*0.30 + availableArea*0.15 + growthPotential*0.10',
    opportunities: ranked.slice(0, limit),
  };
}

function sortZones(zones, sort) {
  const key = clean(sort).toLowerCase() || 'rank';
  if (key === 'area') return zones.sort((a, b) => (Number(b.areaAcres) || 0) - (Number(a.areaAcres) || 0));
  if (key === 'district') return zones.sort((a, b) => a.district.localeCompare(b.district));
  return zones.sort((a, b) => b.opportunityScore - a.opportunityScore);
}

async function getZones(query = {}) {
  const result = await getOpportunities({ ...query, limit: parseLimit(query.limit, DEFAULT_LIMIT) });
  return {
    ...result,
    zones: sortZones([...result.opportunities], query.sort),
    opportunities: undefined,
  };
}

function parseZoneId(id) {
  const [tableId, rawFeatureId] = clean(id).split(':');
  const source = ZONE_SOURCES[tableId];
  const featureId = Number(rawFeatureId);
  if (!source || !Number.isInteger(featureId)) {
    throw AppError.badRequest(`Invalid zone id "${id}". Expected table:id from investor zones.`);
  }
  return { source, featureId };
}

async function fetchZoneById(pool, id) {
  const { source, featureId } = parseZoneId(id);
  const { rows } = await pool.query(
    `
      SELECT *,
        ST_X(ST_PointOnSurface(geom)) AS lng,
        ST_Y(ST_PointOnSurface(geom)) AS lat,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0008))::json AS geometry
      FROM ${source.table}
      WHERE id = $1
      LIMIT 1
    `,
    [featureId]
  );
  if (!rows[0]) throw AppError.badRequest(`Zone not found: ${id}`);
  return toZone(source, rows[0]);
}

function pointSql() {
  return 'ST_SetSRID(ST_MakePoint($1, $2), 4326)';
}

async function countWithin(pool, table, zone, radiusM) {
  const point = pointSql();
  const radiusDeg = radiusM / 111320.0;
  const { rows } = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM ${table}
      WHERE geom && ST_Expand(${point}, $3)
        AND ST_DWithin(geom, ${point}, $3)
    `,
    [zone.center.lng, zone.center.lat, radiusDeg]
  );
  return rows[0]?.count || 0;
}

async function minDistanceKm(pool, table, zone, maxRadiusM) {
  const point = pointSql();
  const radiusDeg = maxRadiusM / 111320.0;
  const { rows } = await pool.query(
    `
      WITH nearest AS (
        SELECT geom
        FROM ${table}
        WHERE geom && ST_Expand(${point}, $3)
        ORDER BY geom <-> ${point}
        LIMIT 1
      )
      SELECT ST_Distance(geom::geography, ${point}::geography) / 1000.0 AS distance_km
      FROM nearest
      WHERE ST_DWithin(geom, ${point}, $3)
    `,
    [zone.center.lng, zone.center.lat, radiusDeg]
  );
  return rows.length ? Number(rows[0].distance_km) : null;
}

async function safeCountWithin(pool, table, zone, radiusM) {
  try {
    return await countWithin(pool, table, zone, radiusM);
  } catch (err) {
    console.error(`[investor] count failed for ${table}:`, err.message);
    return 0;
  }
}

async function safeMinDistanceKm(pool, table, zone, maxRadiusM) {
  try {
    return await minDistanceKm(pool, table, zone, maxRadiusM);
  } catch (err) {
    console.error(`[investor] distance failed for ${table}:`, err.message);
    return null;
  }
}

async function nearestDistanceAcross(pool, tables, zone, maxRadiusM) {
  const distances = await Promise.all(tables.map((table) => safeMinDistanceKm(pool, table, zone, maxRadiusM)));
  return distances.reduce((best, distance) => {
    if (distance === null || distance === undefined) return best;
    if (best === null || distance < best) return distance;
    return best;
  }, null);
}

async function sumCounts(pool, tables, zone, radiusM) {
  const counts = await Promise.all(tables.map((table) => safeCountWithin(pool, table, zone, radiusM)));
  return counts.reduce((total, count) => total + count, 0);
}

async function getZoneContext(pool, zone) {
  const [
    hospitals2Km,
    hospitals5Km,
    schools2Km,
    schools5Km,
    governmentOffices5Km,
    roads3Km,
    waterLines2Km,
    electricAssets2Km,
    nearestRoadKm,
    nearestRailKm,
    nearestAirportKm,
    nearestBusStopKm,
    nearestForestKm,
    nearestLowLyingAreaKm,
    nearestWaterBodyKm,
  ] = await Promise.all([
    safeCountWithin(pool, 'hospitals', zone, 2000),
    safeCountWithin(pool, 'hospitals', zone, 5000),
    sumCounts(pool, ['govt_school', 'pm_shri_and_sanskriti_school', 'haryana_police_public_schools_point'], zone, 2000),
    sumCounts(pool, ['govt_school', 'pm_shri_and_sanskriti_school', 'haryana_police_public_schools_point'], zone, 5000),
    safeCountWithin(pool, 'jails_point', zone, 5000),
    safeCountWithin(pool, 'roads_line', zone, 3000),
    safeCountWithin(pool, 'water_network', zone, 2000),
    sumCounts(pool, ['electric_station', 'mobile_towers', 'hvpnl_line'], zone, 2000),
    safeMinDistanceKm(pool, 'roads_line', zone, 20000),
    safeMinDistanceKm(pool, 'rail_network', zone, 30000),
    safeMinDistanceKm(pool, 'airports', zone, 60000),
    safeMinDistanceKm(pool, 'bus_stops', zone, 15000),
    safeMinDistanceKm(pool, 'forest_area', zone, 10000),
    safeMinDistanceKm(pool, 'low_lying_area', zone, 10000),
    nearestDistanceAcross(pool, ['haryana_rivers', 'ponds', 'wetlands'], zone, 5000),
  ]);

  return {
    facilities: {
      hospitals: { within2Km: hospitals2Km, within5Km: hospitals5Km },
      schools: { within2Km: schools2Km, within5Km: schools5Km },
      governmentOffices: { within5Km: governmentOffices5Km },
    },
    utilities: {
      waterLinesWithin2Km: waterLines2Km,
      electricAssetsWithin2Km: electricAssets2Km,
    },
    transport: {
      roadsWithin3Km: roads3Km,
      nearestRoadKm,
      nearestRailKm,
      nearestAirportKm,
      nearestBusStopKm,
    },
    environmental: {
      nearestForestKm,
      nearestLowLyingAreaKm,
      nearestWaterBodyKm,
    },
  };
}

function buildRecommendation(zone, analysis, opportunity, context) {
  const positives = [];
  const cautions = [];
  const nextActions = [];

  if (opportunity.opportunityScore >= 75) positives.push('Strong composite opportunity score for shortlisted investor review');
  if (analysis.scores.accessibility >= 70) positives.push('Good access profile based on road, rail, airport, and urban proximity');
  if (context.facilities.hospitals.within5Km + context.facilities.schools.within5Km >= 5) positives.push('Healthy surrounding social infrastructure density');
  if (context.utilities.waterLinesWithin2Km + context.utilities.electricAssetsWithin2Km > 0) positives.push('Nearby utility indicators are present in local PostGIS layers');

  if (analysis.scores.environmentalRisk < 55) cautions.push('Environmental screening should be completed before recommendation');
  if (analysis.scores.zoneCompatibility < 50) cautions.push('Zone compatibility is below preferred threshold for the requested sector');
  if (!zone.areaAcres || zone.areaAcres < 1) cautions.push('Available mapped area is small; confirm parcel aggregation possibilities');

  nextActions.push('Verify ownership, permitted land use, and latest regulatory status with the source department');
  nextActions.push('Run comparison against 2-4 nearby shortlisted zones before final recommendation');
  if (cautions.length) nextActions.push('Resolve caution flags before generating an investor-facing report');

  return {
    verdict: opportunity.opportunityScore >= 75 ? 'shortlist' : opportunity.opportunityScore >= 55 ? 'review' : 'hold',
    positives,
    cautions,
    nextActions,
  };
}

function similarityScore(baseZone, candidate) {
  let score = 0;
  if (candidate.id === baseZone.id) return -1;
  if (candidate.tableId === baseZone.tableId) score += 30;
  if (candidate.zoneType === baseZone.zoneType) score += 20;
  if (candidate.district === baseZone.district) score += 20;
  const baseArea = Number(baseZone.areaAcres) || 0;
  const candidateArea = Number(candidate.areaAcres) || 0;
  if (baseArea && candidateArea) {
    const ratio = Math.min(baseArea, candidateArea) / Math.max(baseArea, candidateArea);
    score += ratio * 30;
  }
  return score;
}

async function getBenchmarks(pool, zone, sector) {
  const candidates = await fetchCandidateZones(pool, 25);
  const similar = candidates
    .map((candidate) => ({ ...candidate, similarityScore: similarityScore(zone, candidate) }))
    .filter((candidate) => candidate.similarityScore >= 0)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 4);

  const maxAreaAcres = Math.max(Number(zone.areaAcres) || 0, ...similar.map((candidate) => Number(candidate.areaAcres) || 0));
  const benchmarks = [];
  for (const candidate of similar) {
    const analysis = await scoreZone(candidate, sector);
    const opportunity = opportunityScore(candidate, analysis, maxAreaAcres, sector);
    benchmarks.push({
      id: candidate.id,
      name: candidate.name,
      district: candidate.district,
      type: candidate.type,
      zoneType: candidate.zoneType,
      areaAcres: candidate.areaAcres,
      opportunityScore: opportunity.opportunityScore,
      similarityScore: clampScore(candidate.similarityScore),
    });
  }
  return benchmarks;
}

async function getZoneAnalysis(zoneId, query = {}) {
  const pool = ensurePool();
  const sector = clean(query.sector).toLowerCase() || 'industrial';
  const zone = await fetchZoneById(pool, zoneId);
  const [analysis, context, benchmarks] = await Promise.all([
    scoreZone(zone, sector),
    getZoneContext(pool, zone),
    getBenchmarks(pool, zone, sector),
  ]);

  const maxAreaAcres = Math.max(Number(zone.areaAcres) || 0, ...benchmarks.map((item) => Number(item.areaAcres) || 0));
  const opportunity = opportunityScore(zone, analysis, maxAreaAcres, sector);
  return {
    sector,
    zone: {
      ...zone,
      geometry: query.includeGeometry === 'false' ? null : zone.geometry,
    },
    opportunity,
    analysis,
    context,
    benchmarks,
    recommendation: buildRecommendation(zone, analysis, opportunity, context),
  };
}

async function compareZones(query = {}) {
  const pool = ensurePool();
  const zoneIds = clean(query.zones)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (zoneIds.length < 2 || zoneIds.length > 4) {
    throw AppError.badRequest('zones must contain 2 to 4 comma-separated zone ids');
  }

  const sector = clean(query.sector).toLowerCase() || 'industrial';
  const zones = await Promise.all(zoneIds.map((id) => fetchZoneById(pool, id)));
  const maxAreaAcres = Math.max(...zones.map((zone) => Number(zone.areaAcres) || 0), 0);
  const compared = [];

  for (const zone of zones) {
    const analysis = await scoreZone(zone, sector);
    const opportunity = opportunityScore(zone, analysis, maxAreaAcres, sector);
    compared.push({ ...zone, ...opportunity, analysis });
  }

  compared.sort((a, b) => b.opportunityScore - a.opportunityScore);
  return {
    sector,
    winner: compared[0],
    zones: compared,
    matrix: compared.map((zone) => ({
      id: zone.id,
      name: zone.name,
      district: zone.district,
      opportunityScore: zone.opportunityScore,
      areaAcres: zone.areaAcres,
      ...zone.components,
      environmentalRisk: zone.analysis.scores.environmentalRisk,
      zoneCompatibility: zone.analysis.scores.zoneCompatibility,
    })),
  };
}

module.exports = {
  getOpportunities,
  getZones,
  getZoneAnalysis,
  compareZones,
};
