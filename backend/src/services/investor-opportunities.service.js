const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');
const analysisScoring = require('./analysis-scoring.service');
const { estimateLandValue } = require('./land-value.service');
const { enrichSingleZone, enrichZonesBatch } = require('./investor-zone-enrichment.service');
const {
  OPPORTUNITY_VERSION,
  computeOpportunityV3,
  budgetFitsInr,
  budgetFitsAcres,
  nearMeFits,
  riskFitsV3,
  haversineKm,
} = require('./investor-opportunity.engine');

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/** Display aliases so dropdown + filters match DB naming quirks. */
const DISTRICT_DISPLAY = {
  gurgaon: 'Gurugram',
  gurugram: 'Gurugram',
  gurugaon: 'Gurugram',
  gurugrm: 'Gurugram',
  hisar: 'Hisar',
  mahendergarh: 'Mahendragarh',
  mahendragarh: 'Mahendragarh',
  mewat: 'Nuh',
  nuh: 'Nuh',
  fatheabad: 'Fatehabad',
  fatehabad: 'Fatehabad',
};

function titleDistrict(name) {
  const raw = clean(name);
  if (!raw) return '';
  const mapped = DISTRICT_DISPLAY[raw.toLowerCase()];
  if (mapped) return mapped;
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Expand a UI district into all DB name variants used across tables. */
function expandDistrictNames(district) {
  const raw = clean(district);
  if (!raw) return null;
  const key = raw.toLowerCase();
  const groups = {
    gurugram: ['Gurugram', 'Gurgaon', 'Gurugaon', 'Gurugrm'],
    gurgaon: ['Gurugram', 'Gurgaon', 'Gurugaon', 'Gurugrm'],
    hisar: ['Hisar', 'HISAR'],
    mahendragarh: ['Mahendragarh', 'Mahendergarh'],
    mahendergarh: ['Mahendragarh', 'Mahendergarh'],
    nuh: ['Nuh', 'Mewat'],
    mewat: ['Nuh', 'Mewat'],
    fatehabad: ['Fatehabad', 'Fatheabad'],
    fatheabad: ['Fatehabad', 'Fatheabad'],
  };
  const names = groups[key] || [raw, titleDistrict(raw)];
  return [...new Set(names.map((n) => clean(n)).filter(Boolean))];
}

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function districtFilterSql(attrExpr, { spatial = false } = {}) {
  // $2 = text[] of district name variants (null/empty = all districts)
  const attrMatch = `
    LOWER(TRIM(COALESCE(${attrExpr}, ''))) = ANY (
      SELECT LOWER(TRIM(x)) FROM unnest($2::text[]) AS x
    )
  `;
  if (!spatial) {
    return `
      (
        $2::text[] IS NULL
        OR cardinality($2::text[]) = 0
        OR ${attrMatch}
      )
    `;
  }
  return `
    (
      $2::text[] IS NULL
      OR cardinality($2::text[]) = 0
      OR ${attrMatch}
      OR EXISTS (
        SELECT 1
        FROM district_boundary d
        WHERE z.geom && d.geom
          AND ST_Intersects(ST_PointOnSurface(z.geom), d.geom)
          AND LOWER(TRIM(COALESCE(NULLIF(TRIM(d.n_d_name), ''), NULLIF(TRIM(d.dis_abb), ''), '')))
            = ANY (SELECT LOWER(TRIM(x)) FROM unnest($2::text[]) AS x)
      )
    )
  `;
}

const ZONE_SOURCES = {
  hsiidc_boundary: {
    table: 'hsiidc_boundary',
    type: 'industrial',
    zoneType: 'government',
    title: (row) => `HSIIDC ${clean(row.resolved_district) || clean(row.district1) || 'Industrial Estate'} Zone`,
    district: (row) => titleDistrict(row.resolved_district || row.district1) || 'Haryana',
    description: (row) => clean(row.pwd_cir) || clean(row.pwd_div) || 'HSIIDC industrial boundary',
    areaSqm: (row) => Number(row.shape_area) || null,
    areaAcres: (row) => (Number(row.shape_area) ? Number(row.shape_area) / 4046.8564224 : null),
    shortlistSql: (diversify, opts = {}) => `
      WITH base AS (
        SELECT z.id, z.objectid, z.pwd_cir, z.pwd_div, z.district1, z.shape_area, z.geom,
          COALESCE(
            (SELECT COALESCE(NULLIF(TRIM(d.n_d_name), ''), NULLIF(TRIM(d.dis_abb), ''))
             FROM district_boundary d
             WHERE ST_Intersects(ST_PointOnSurface(z.geom), d.geom)
             LIMIT 1),
            z.district1
          ) AS resolved_district
        FROM hsiidc_boundary z
        WHERE ${districtFilterSql('z.district1', { spatial: opts.spatial !== false })}
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(resolved_district, 'Haryana')
            ORDER BY shape_area DESC NULLS LAST
          ) AS rn
        FROM base
      )
      SELECT id, objectid, pwd_cir, pwd_div, district1, shape_area, resolved_district,
        ST_X(ST_PointOnSurface(geom)) AS lng,
        ST_Y(ST_PointOnSurface(geom)) AS lat,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0008))::json AS geometry
      FROM ranked
      WHERE ${diversify ? 'rn <= GREATEST(1, LEAST(3, $1))' : 'TRUE'}
      ORDER BY shape_area DESC NULLS LAST
      LIMIT $1
    `,
  },
  karnal_land_bank: {
    table: 'karnal_land_bank',
    type: 'land-bank',
    zoneType: 'government',
    title: (row) => `${clean(row.n_v_name) || 'Karnal'} Land Bank ${clean(row.n_khas_no) ? `Khasra ${clean(row.n_khas_no)}` : ''}`.trim(),
    district: (row) => titleDistrict(row.resolved_district || row.n_d_name) || 'Karnal',
    description: (row) => [clean(row.category), clean(row.n_t_name), clean(row.n_v_name)].filter(Boolean).join(' / ') || 'Land bank parcel',
    areaSqm: (row) => Number(row.shape_area) || null,
    areaAcres: (row) => Number(row.area_acres) || (Number(row.shape_area) ? Number(row.shape_area) / 4046.8564224 : null),
    shortlistSql: (diversify, opts = {}) => `
      WITH base AS (
        SELECT z.id, z.objectid, z.n_d_name, z.n_t_name, z.n_v_name, z.n_khas_no, z.category,
          z.area_acres, z.shape_area, z.geom,
          COALESCE(NULLIF(TRIM(z.n_d_name), ''), 'Karnal') AS resolved_district
        FROM karnal_land_bank z
        WHERE COALESCE(z.area_acres, 0) >= 0.5
          AND ${districtFilterSql('z.n_d_name', { spatial: !!opts.spatial })}
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(resolved_district, 'Karnal')
            ORDER BY area_acres DESC NULLS LAST, shape_area DESC NULLS LAST
          ) AS rn
        FROM base
      )
      SELECT id, objectid, n_d_name, n_t_name, n_v_name, n_khas_no, category, area_acres, shape_area, resolved_district,
        ST_X(ST_PointOnSurface(geom)) AS lng,
        ST_Y(ST_PointOnSurface(geom)) AS lat,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0008))::json AS geometry
      FROM ranked
      WHERE ${diversify ? 'rn <= GREATEST(1, LEAST(2, $1))' : 'TRUE'}
      ORDER BY area_acres DESC NULLS LAST, shape_area DESC NULLS LAST
      LIMIT $1
    `,
  },
  hsvp_plots: {
    table: 'hsvp_plots',
    type: 'urban-plot',
    zoneType: 'government',
    title: (row) => `Plot ${clean(row.plot_no) || row.id}, Sector ${clean(row.sector) || 'HSVP'}`,
    district: (row) => titleDistrict(row.resolved_district || row.district || row.estate) || 'Haryana',
    description: (row) => [clean(row.parcel_subtype), clean(row.estate), clean(row.zone)].filter(Boolean).join(' / ') || 'HSVP parcel',
    areaSqm: (row) => Number(row.area_sqm) || Number(row.shape_area) || null,
    areaAcres: (row) => {
      const sqm = Number(row.area_sqm) || Number(row.shape_area);
      return sqm ? sqm / 4046.8564224 : null;
    },
    shortlistSql: (diversify, opts = {}) => `
      WITH base AS (
        SELECT z.id, z.objectid, z.zone, z.estate, z.sector, z.plot_no, z.area_sqm, z.parcel_type,
          z.parcel_subtype, z.district, z.shape_area, z.geom,
          COALESCE(NULLIF(TRIM(z.district), ''), z.estate) AS resolved_district
        FROM hsvp_plots z
        WHERE COALESCE(z.area_sqm, 0) >= ${opts.relaxSubtype ? 500 : 1000}
          AND ${
            opts.relaxSubtype
              ? 'TRUE'
              : `(
            z.parcel_subtype ILIKE '%commercial%'
            OR z.parcel_subtype ILIKE '%industrial%'
            OR z.parcel_subtype ILIKE '%institution%'
          )`
          }
          AND ${districtFilterSql('z.district', { spatial: !!opts.spatial })}
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(resolved_district, 'Haryana')
            ORDER BY area_sqm DESC NULLS LAST, shape_area DESC NULLS LAST
          ) AS rn
        FROM base
      )
      SELECT id, objectid, zone, estate, sector, plot_no, area_sqm, parcel_type, parcel_subtype,
        district, shape_area, resolved_district,
        ST_X(ST_PointOnSurface(geom)) AS lng,
        ST_Y(ST_PointOnSurface(geom)) AS lat,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0008))::json AS geometry
      FROM ranked
      WHERE ${diversify ? 'rn <= GREATEST(1, LEAST(2, $1))' : 'TRUE'}
      ORDER BY area_sqm DESC NULLS LAST, shape_area DESC NULLS LAST
      LIMIT $1
    `,
  },
  licensed_colony: {
    table: 'licensed_colony',
    type: 'private-development',
    zoneType: 'private',
    title: (row) => clean(row.developer) || `${clean(row.town) || 'Licensed'} Colony ${clean(row.sector_no)}`.trim(),
    district: (row) => titleDistrict(row.resolved_district || row.dist_name) || 'Haryana',
    description: (row) => [clean(row.purpose), clean(row.town), clean(row.license_no)].filter(Boolean).join(' / ') || 'Licensed private development',
    areaSqm: (row) => Number(row.shape_area) || null,
    areaAcres: (row) => (Number(row.shape_area) ? Number(row.shape_area) / 4046.8564224 : null),
    shortlistSql: (diversify, opts = {}) => `
      WITH base AS (
        SELECT z.id, z.objectid, z.developer, z.dist_name, z.town, z.license_no, z.purpose,
          z.sector_no, z.shape_area, z.geom,
          COALESCE(NULLIF(TRIM(z.dist_name), ''), 'Haryana') AS resolved_district
        FROM licensed_colony z
        WHERE ${districtFilterSql('z.dist_name', { spatial: !!opts.spatial })}
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(resolved_district, 'Haryana')
            ORDER BY shape_area DESC NULLS LAST
          ) AS rn
        FROM base
      )
      SELECT id, objectid, developer, dist_name, town, license_no, purpose, sector_no, shape_area, resolved_district,
        ST_X(ST_PointOnSurface(geom)) AS lng,
        ST_Y(ST_PointOnSurface(geom)) AS lat,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0008))::json AS geometry
      FROM ranked
      WHERE ${diversify ? 'rn <= GREATEST(1, LEAST(2, $1))' : 'TRUE'}
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
  const nearLat = query.nearLat ?? query.near_lat;
  const nearLng = query.nearLng ?? query.near_lng;
  return {
    sector: clean(query.sector).toLowerCase() || 'industrial',
    budget: normalizeBudget(query.budget),
    risk: normalizeRisk(query.risk),
    district: clean(query.district),
    zoneType: normalizeZoneType(query.zoneType || query.zone_type),
    nearLat: nearLat != null && nearLat !== '' ? Number(nearLat) : null,
    nearLng: nearLng != null && nearLng !== '' ? Number(nearLng) : null,
    nearRadiusKm: Number(query.nearRadiusKm || query.near_radius_km) || 25,
  };
}

function zoneTypeFits(zone, zoneType) {
  if (!zoneType) return true;
  return zone.zoneType === zoneType;
}

function districtFits(zone, district) {
  if (!district) return true;
  const variants = expandDistrictNames(district).map((d) => d.toLowerCase());
  const zoneDistrict = titleDistrict(zone.district).toLowerCase();
  const raw = clean(zone.district).toLowerCase();
  return variants.some((v) => zoneDistrict.includes(v.toLowerCase()) || raw.includes(v.toLowerCase()) || v.toLowerCase().includes(raw));
}

async function fetchSourceCandidates(pool, source, perSourceLimit, districtNames, opts = {}) {
  const { diversify = false, relaxSubtype = false, spatial = source.table === 'hsiidc_boundary' } = opts;
  const sql = source.shortlistSql(diversify, { relaxSubtype, spatial });
  const params = [perSourceLimit, districtNames && districtNames.length ? districtNames : null];
  const { rows } = await pool.query(sql, params);
  return rows
    .map((row) => toZone(source, row))
    .filter((zone) => Number.isFinite(zone.center.lat) && Number.isFinite(zone.center.lng));
}

async function fetchCandidateZones(pool, perSourceLimit, district = '') {
  const districtNames = expandDistrictNames(district);
  const diversify = !districtNames;
  const limit = districtNames
    ? Math.max(8, Math.min(16, perSourceLimit))
    : Math.max(16, Math.min(40, perSourceLimit * 2));

  const batches = await Promise.all(
    Object.values(ZONE_SOURCES).map(async (source) => {
      try {
        let zones = await fetchSourceCandidates(pool, source, limit, districtNames, { diversify });
        if (!zones.length && districtNames && source.table === 'hsvp_plots') {
          zones = await fetchSourceCandidates(pool, source, limit, districtNames, {
            diversify: false,
            relaxSubtype: true,
          });
        }
        // Licensed colonies sometimes lack clean dist_name — spatial fallback (small table).
        if (!zones.length && districtNames && source.table === 'licensed_colony') {
          zones = await fetchSourceCandidates(pool, source, limit, districtNames, {
            diversify: false,
            spatial: true,
          });
        }
        return zones;
      } catch (err) {
        console.error(`[investor] candidate query failed for ${source.table}:`, err.message);
        return [];
      }
    })
  );
  return batches.flat();
}

async function listDistricts() {
  const pool = ensurePool();
  const { rows } = await pool.query(`
    SELECT DISTINCT name FROM (
      SELECT COALESCE(NULLIF(TRIM(n_d_name), ''), NULLIF(TRIM(dis_abb), '')) AS name
      FROM district_boundary
      WHERE geom IS NOT NULL
      UNION
      SELECT DISTINCT NULLIF(TRIM(district), '')
      FROM hsvp_plots
      WHERE district IS NOT NULL AND TRIM(district) <> ''
      UNION
      SELECT DISTINCT NULLIF(TRIM(dist_name), '')
      FROM licensed_colony
      WHERE dist_name IS NOT NULL AND TRIM(dist_name) <> ''
      UNION
      SELECT DISTINCT NULLIF(TRIM(district1), '')
      FROM hsiidc_boundary
      WHERE district1 IS NOT NULL AND TRIM(district1) <> ''
    ) t
    WHERE name IS NOT NULL AND TRIM(name) <> ''
  `);

  const seen = new Map();
  for (const row of rows) {
    const display = titleDistrict(row.name);
    if (!display || display.toLowerCase() === 'haryana') continue;
    const key = display.toLowerCase();
    if (!seen.has(key)) seen.set(key, display);
  }

  const districts = [...seen.values()].sort((a, b) => a.localeCompare(b));
  return { count: districts.length, districts };
}

function budgetFits(zone, budget, landCostInr) {
  if (!budget) return true;
  if (landCostInr != null) return budgetFitsInr(landCostInr, budget);
  return budgetFitsAcres(zone, budget);
}

async function enrichZoneScore(zone, sector, nearPoint = null) {
  const analysis = await analysisScoring.scoreLocation({
    lat: zone.center.lat,
    lng: zone.center.lng,
    sector: sector || 'industrial',
  });
  return enrichSingleZone(zone, sector, analysis, nearPoint);
}

async function scoreZonesParallel(zones, sector, nearPoint = null) {
  return enrichZonesBatch(zones, sector, nearPoint);
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

async function scoreZone(zone, sector) {
  return analysisScoring.scoreLocation({
    lat: zone.center.lat,
    lng: zone.center.lng,
    sector: sector || 'industrial',
  });
}

async function rankZones(zones, options) {
  const prefiltered = zones
    .filter((zone) => zoneTypeFits(zone, options.zoneType) && districtFits(zone, options.district))
    .filter((zone) => nearMeFits(zone, options.nearLat, options.nearLng, options.nearRadiusKm));

  const nearPoint =
    options.nearLat != null && options.nearLng != null
      ? { lat: options.nearLat, lng: options.nearLng }
      : null;
  const scored = await scoreZonesParallel(prefiltered, options.sector, nearPoint);
  const ranked = scored.filter((zone) => {
    if (!riskFitsV3(zone.analysis, options.risk)) return false;
    return budgetFits(zone, options.budget, zone.components?.estimatedLandCostInr);
  });

  ranked.sort((a, b) => b.opportunityScore - a.opportunityScore);
  return ranked;
}

async function getOpportunities(query = {}) {
  const started = Date.now();
  const pool = ensurePool();
  const limit = parseLimit(query.limit);
  const options = normalizeOptions(query);

  const perSource = options.district
    ? Math.max(8, Math.min(16, limit + 4))
    : Math.max(16, Math.min(40, limit + 15));
  let candidates = await fetchCandidateZones(pool, perSource, options.district);
  // Cap scoring workload so district switches stay responsive.
  const scoreCap = options.district ? 24 : 48;
  if (candidates.length > scoreCap) {
    candidates = candidates
      .sort((a, b) => (Number(b.areaAcres) || 0) - (Number(a.areaAcres) || 0))
      .slice(0, scoreCap);
  }
  let ranked = await rankZones(candidates, options);

  // District picks should still return best zones even if risk filter is strict.
  if (!ranked.length && options.district && options.risk) {
    ranked = await rankZones(candidates, { ...options, risk: null });
  }

  return {
    filters: options,
    count: Math.min(limit, ranked.length),
    totalCandidates: candidates.length,
    scoredAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    opportunities: ranked.slice(0, limit).map(sanitizeOpportunityRow),
    mapHighlights: ranked.slice(0, 5).map((zone, index) => ({
      id: zone.id,
      rank: index + 1,
      name: zone.name,
      opportunityScore: zone.opportunityScore,
      center: zone.center,
      geometry: zone.geometry,
    })),
  };
}

function sanitizeOpportunityRow(zone) {
  return {
    id: zone.id,
    name: zone.name,
    district: zone.district,
    type: zone.type,
    zoneType: zone.zoneType,
    tableId: zone.tableId,
    featureId: zone.featureId,
    areaAcres: zone.areaAcres,
    investableArea: zone.investableArea,
    center: zone.center,
    geometry: zone.geometry,
    opportunityScore: zone.opportunityScore,
    formulaScore: zone.formulaScore,
    formulaRank: zone.formulaRank,
    mlRank: zone.mlRank,
    mlScore: zone.mlScore,
    mlMethod: zone.mlMethod,
    mlAdjusted: zone.mlAdjusted,
    verdict: zone.verdict,
    components: zone.components,
    weights: zone.weights,
    explain: zone.explain,
    opportunityBreakdown: zone.opportunityBreakdown,
    scoreBreakdown: zone.scoreBreakdown || zone.analysis?.scoreBreakdown || [],
    v3Scores: zone.analysis?.scores || zone.v3Scores || {},
    insightsSummary: zone.analysis?.insights?.summary || null,
    narrativeSummary: zone.analysis?.narrative?.summary || null,
    landValue: zone.landValue,
    landCostBand: zone.landCostBand,
    availability: zone.availability,
    plotInventory: zone.plotInventory,
    keyRisk: zone.keyRisk,
    utilityReadiness: zone.utilityReadiness,
    regulatoryChecklist: zone.regulatoryChecklist,
    financialPreview: zone.financialPreview,
    benchmark: zone.benchmark,
    policySnippets: zone.policySnippets,
    comparables: zone.comparables,
    dataSource: zone.dataSource,
    distanceKm: zone.distanceKm,
    cacheSource: zone.cacheSource,
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
  if (context.utilities.waterLinesWithin2Km + context.utilities.electricAssetsWithin2Km > 0) positives.push('Nearby utility indicators are present in local map layers');

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

  const benchmarksScored = [];
  for (const candidate of similar) {
    const enriched = await enrichZoneScore(candidate, sector);
    benchmarksScored.push({
      id: candidate.id,
      name: candidate.name,
      district: candidate.district,
      type: candidate.type,
      zoneType: candidate.zoneType,
      areaAcres: candidate.areaAcres,
      opportunityScore: enriched.opportunityScore,
      similarityScore: clampScore(candidate.similarityScore),
    });
  }
  return benchmarksScored;
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

  const enriched = await enrichSingleZone(zone, sector, analysis, null, {
    useCache: false,
    includeNarrative: true,
    skipMl: false,
  });
  const opportunity = {
    opportunityScore: enriched.opportunityScore,
    verdict: enriched.verdict,
    components: enriched.components,
    weights: enriched.weights,
    explain: enriched.explain,
    scoringVersion: enriched.scoringVersion,
    landValue: enriched.landValue,
    landCostBand: enriched.landCostBand,
    opportunityBreakdown: enriched.opportunityBreakdown,
  };
  return {
    sector,
    zone: {
      ...zone,
      geometry: query.includeGeometry === 'false' ? null : zone.geometry,
    },
    opportunity,
    analysis: enriched.analysis,
    landValue: enriched.landValue,
    policySnippets: enriched.policySnippets,
    regulatoryChecklist: enriched.regulatoryChecklist,
    financialPreview: enriched.financialPreview,
    availability: enriched.availability,
    keyRisk: enriched.keyRisk,
    utilityReadiness: enriched.utilityReadiness,
    benchmark: enriched.benchmark,
    context,
    benchmarks,
    recommendation: buildRecommendation(zone, enriched.analysis, opportunity, context),
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
  const compared = await scoreZonesParallel(zones, sector);

  compared.sort((a, b) => b.opportunityScore - a.opportunityScore);
  return {
    sector,
    opportunityVersion: OPPORTUNITY_VERSION,
    winner: compared[0],
    zones: compared,
    matrix: compared.map((zone) => ({
      id: zone.id,
      name: zone.name,
      district: zone.district,
      opportunityScore: zone.opportunityScore,
      verdict: zone.verdict,
      areaAcres: zone.areaAcres,
      distanceKm: zone.distanceKm,
      landCostInr: zone.components?.estimatedLandCostInr,
      landPerSqYard: zone.components?.landPerSqYard ?? zone.landValue?.estimatedPerSqYardInr,
      v3Composite: zone.components?.v3Composite,
      infrastructure: zone.components?.infrastructure,
      accessibility: zone.components?.accessibility,
      environmentalSuitability: zone.components?.environmentalSuitability,
      zoneFit: zone.components?.zoneFit,
      zoneTypeMatch: zone.components?.zoneTypeMatch,
      cluScore: zone.components?.cluScore,
      cluLabel: zone.components?.cluLabel,
      utilityScore: zone.components?.utilityScore,
      utilityReadiness: zone.utilityReadiness,
      availability: zone.availability?.label,
      keyRisk: zone.keyRisk,
      benchmarkMessage: zone.benchmark?.message,
      analysis: { scores: zone.analysis?.scores },
    })),
  };
}

async function getPlotInventory(zoneId, query = {}) {
  const pool = ensurePool();
  const zone = await fetchZoneById(pool, zoneId);
  const sector = clean(query.sector).toLowerCase() || 'industrial';
  const { getPlotInventoryForZone } = require('./plot-inventory.service');
  return { zoneId, sector, ...(await getPlotInventoryForZone(zone, sector)) };
}

module.exports = {
  listDistricts,
  getOpportunities,
  getZones,
  getZoneAnalysis,
  compareZones,
  getPlotInventory,
};
