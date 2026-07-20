const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');
const postgisRegistry = require('../config/postgis-registry');
const layerRegistry = require('../config/layer-registry');

const DEFAULT_LIMIT = 50;
const SEARCH_TABLE_HINTS = [
  { terms: ['hospital', 'health', 'medical'], tables: ['hospitals'] },
  { terms: ['school', 'education'], tables: ['govt_school', 'pm_shri_and_sanskriti_school', 'haryana_police_public_schools_point'] },
  { terms: ['iti', 'training'], tables: ['iti'] },
  { terms: ['road', 'highway', 'street'], tables: ['roads_line'] },
  { terms: ['rail', 'railway', 'train'], tables: ['rail_network'] },
  { terms: ['metro', 'station'], tables: ['rapid_metro_station', 'delhi_metro_station', 'proposed_metro_station', 'rail_network'] },
  { terms: ['airport', 'airstrip'], tables: ['airports'] },
  { terms: ['industrial', 'hsiidc', 'investment'], tables: ['hsiidc_boundary', 'karnal_land_bank'] },
  { terms: ['village'], tables: ['village_boundary'] },
  { terms: ['tehsil'], tables: ['tehsil_boundary'] },
  { terms: ['district'], tables: ['district_boundary'] },
  { terms: ['khasra', 'plot', 'parcel'], tables: ['hsvp_plots'] },
  { terms: ['sector', 'hsvp'], tables: ['hsvp_plots', 'licensed_colony', 'development_plan'] },
  { terms: ['colony', 'license', 'developer'], tables: ['licensed_colony'] },
  { terms: ['development', 'plan', 'town'], tables: ['development_plan'] },
  { terms: ['municipal', 'mc', 'urban'], tables: ['municipal_boundary'] },
  { terms: ['electric', 'substation', 'power'], tables: ['electric_station'] },
  { terms: ['water', 'pipeline'], tables: ['water_network'] },
  { terms: ['forest'], tables: ['forest_area'] },
  { terms: ['wetland', 'lake'], tables: ['wetlands'] },
  { terms: ['pond', 'waterbody'], tables: ['ponds'] },
  { terms: ['river', 'canal'], tables: ['haryana_rivers', 'canal'] },
  { terms: ['low lying', 'flood'], tables: ['low_lying_area'] },
  { terms: ['bus'], tables: ['bus_stops'] },
];
const DEFAULT_SEARCH_TABLES = [
  'district_boundary',
  'tehsil_boundary',
  'village_boundary',
  'hospitals',
  'govt_school',
  'pm_shri_and_sanskriti_school',
  'iti',
  'airports',
  'bus_stops',
  'rail_network',
  'rapid_metro_station',
  'delhi_metro_station',
  'proposed_metro_station',
  'roads_line',
  'electric_station',
  'water_network',
  'forest_area',
  'wetlands',
  'ponds',
  'haryana_rivers',
  'licensed_colony',
  'development_plan',
  'municipal_boundary',
  'hsiidc_boundary',
  'karnal_land_bank',
];
const textColumnsCache = new Map();
const NAME_FIELDS_BY_TABLE = {
  hospitals: ['hospital_name', 'hospital_n', 'name', 'owner_name'],
  govt_school: ['school_name', 'school_nam', 'name', 'udisecode', 'school_code'],
  pm_shri_and_sanskriti_school: ['school_name', 'school_nam', 'name', 'school_code'],
  haryana_police_public_schools_point: ['school_name', 'school_nam', 'name', 'objectid'],
  iti: ['institute', 'iti_name_1', 'name', 'iti_code'],
  airports: ['name', 'airport_name', 'objectid'],
  bus_stops: ['assettypename', 'panchayatname', 'n_v_name', 'gp_name'],
  rail_network: ['category', 'city', 'state'],
  rapid_metro_station: ['name', 'metro_type'],
  delhi_metro_station: ['delhi_metr', 'metrotype'],
  proposed_metro_station: ['name', 'id'],
  roads_line: ['rd_name', 'road_name_dlp', 'start_pt', 'end_pt', 'road_catog', 'type'],
  electric_station: ['substationname', 'substationcode', 'stationtype', 'substationaddress'],
  water_network: ['n_v_name', 'n_t_name', 'n_d_name', 'width'],
  forest_area: ['forest_nam', 'forest_typ', 'village', 'range_name'],
  wetlands: ['lake_name', 'district'],
  low_lying_area: ['village', 'tehsil', 'block', 'district'],
  ponds: ['pond_name', 'village', 'khasra_no', 'murraba_no', 'uid'],
  haryana_rivers: ['river_name', 'objectid'],
  canal: ['name', 'objectid'],
  hsiidc_boundary: ['district1', 'pwd_div', 'pwd_cir', 'objectid'],
  karnal_land_bank: ['n_v_name', 'n_khas_no', 'n_murr_no', 'category'],
  hsvp_plots: ['plot_no', 'sector', 'estate', 'parcel_type', 'district'],
  licensed_colony: ['developer', 'purpose', 'sector_no', 'town', 'license_no'],
  development_plan: ['devplan_na', 'name_of_to', 'dist_name', 'stage'],
  municipal_boundary: ['mc_name', 'mc_type'],
  district_boundary: ['n_d_name', 'district', 'district_n', 'dis_abb'],
  tehsil_boundary: ['n_t_name', 'tehsil', 'n_d_name'],
  village_boundary: ['n_v_name', 'village', 'village_na', 'gp_name'],
};

const SUBTITLE_FIELDS_BY_TABLE = {
  hospitals: ['services', 'address', 'district', 'bed_capacity'],
  govt_school: ['school_category_name', 'district', 'block', 'udisecode'],
  pm_shri_and_sanskriti_school: ['school_category_name__level_', 'district', 'block', 'category'],
  iti: ['district', 'type_of_iti', 'funding_type', 'complete_address'],
  airports: ['lat', 'long'],
  bus_stops: ['n_v_name', 'n_t_name', 'n_d_name', 'block'],
  rail_network: ['city', 'state', 'shape_length'],
  rapid_metro_station: ['metro_type'],
  delhi_metro_station: ['metrotype'],
  roads_line: ['road_catog', 'district', 'ownership', 'department'],
  electric_station: ['substationvoltage', 'divisionname', 'subdivisionname'],
  water_network: ['n_d_name', 'n_t_name', 'n_v_name'],
  forest_area: ['forest_category', 'division_n', 'range_name', 'area_acre'],
  wetlands: ['district', 'lat', 'long'],
  low_lying_area: ['district', 'block', 'tehsil', 'area_acre'],
  ponds: ['village', 'district', 'pond_categ', 'area_acre'],
  haryana_rivers: ['shape_length'],
  hsiidc_boundary: ['district1', 'shape_area'],
  karnal_land_bank: ['n_d_name', 'n_t_name', 'area_acres', 'category'],
  hsvp_plots: ['sector', 'estate', 'area_sqm', 'district'],
  licensed_colony: ['town', 'dist_name', 'purpose', 'license_no'],
  development_plan: ['dist_name', 'total_area', 'stage'],
  municipal_boundary: ['mc_type'],
  district_boundary: ['dis_abb', 'shape_area'],
  tehsil_boundary: ['n_d_name', 'n_t_code'],
  village_boundary: ['n_t_name', 'n_d_name', 'pin_code', 'hadbast_no'],
};

/**
 * Validate that a table name is safe to use in SQL queries.
 * Only allows alphanumeric characters and underscores.
 */
function validateTableName(tableName) {
  if (!tableName || typeof tableName !== 'string') {
    throw new AppError(400, 'invalid_table_name', 'Invalid table name');
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new AppError(400, 'invalid_table_name_format', 'Invalid table name format');
  }
  return tableName;
}

function ensurePool() {
  const pool = getPool();
  if (!pool) throw new AppError(503, 'database_not_configured', 'Database not configured');
  return pool;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getSearchTables(keyword, target) {
  if (target) return postgisRegistry.getTablesForLayer(target);
  const q = keyword.toLowerCase();
  const hinted = SEARCH_TABLE_HINTS
    .filter((entry) => entry.terms.some((term) => q.includes(term)))
    .flatMap((entry) => entry.tables);
  return hinted.length ? unique(hinted) : unique(DEFAULT_SEARCH_TABLES);
}

async function getSearchColumns(pool, tableName) {
  if (textColumnsCache.has(tableName)) return textColumnsCache.get(tableName);
  const { rows } = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name <> 'geom'
       AND udt_name NOT IN ('geometry', 'geography')
     ORDER BY ordinal_position`,
    [tableName]
  );
  const columns = rows
    .map((r) => r.column_name)
    .filter((column) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column))
    .slice(0, 24);
  textColumnsCache.set(tableName, columns);
  return columns;
}

function buildSearchExpression(columns) {
  if (!columns.length) return 'NULL';
  return `concat_ws(' ', ${columns.map((column) => `t.${column}::text`).join(', ')})`;
}

function firstValue(props, fields) {
  return fields
    .map((field) => props[field])
    .find((value) => value !== null && value !== undefined && String(value).trim() !== '');
}

function isMeaningfulLabel(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text) return false;
  if (/^\d+(\.\d+)?$/.test(text)) return false;
  if (/^n\.?a\.?$/i.test(text)) return false;
  return true;
}

function compactJoin(parts, separator = ', ') {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== '')
    .map((part) => String(part).trim())
    .join(separator);
}

function formatSearchName(props, tableId) {
  if (tableId === 'roads_line') {
    if (isMeaningfulLabel(props.rd_name)) return props.rd_name;
    const endpoints = compactJoin([props.start_pt, props.end_pt].filter(isMeaningfulLabel), ' to ');
    if (endpoints) return `Road: ${endpoints}`;
    const district = isMeaningfulLabel(props.district) ? props.district : null;
    return compactJoin([isMeaningfulLabel(props.road_catog) ? props.road_catog : `Road segment #${props.objectid || props.id || ''}`, district], ' - ');
  }

  if (tableId === 'hsiidc_boundary') {
    return compactJoin(['HSIIDC', props.district1 || props.pwd_div || props.pwd_cir || props.objectid], ' ');
  }

  if (tableId === 'karnal_land_bank') {
    return compactJoin(['Land bank', props.n_v_name, props.n_khas_no ? `Khasra ${props.n_khas_no}` : null], ' - ');
  }

  if (tableId === 'hsvp_plots') {
    return compactJoin([props.plot_no ? `Plot ${props.plot_no}` : null, props.sector ? `Sector ${props.sector}` : null, props.estate || props.district], ', ');
  }

  if (tableId === 'bus_stops') {
    return compactJoin(['Bus stop', props.n_v_name || props.panchayatname || props.gp_name], ' - ');
  }

  if (tableId === 'water_network') {
    return compactJoin(['Water network', props.n_v_name || props.n_t_name || props.n_d_name], ' - ');
  }

  if (tableId === 'haryana_rivers') {
    return props.river_name ? `${props.river_name} River` : 'River corridor';
  }

  const firstPreferred = firstValue(props, NAME_FIELDS_BY_TABLE[tableId] || []);
  if (firstPreferred) return firstPreferred;

  return (
    props.name ||
    props.title ||
    props.hospital_name ||
    props.school_name ||
    props.n_d_name ||
    props.n_t_name ||
    props.n_v_name ||
    props.district ||
    props.tehsil ||
    props.village ||
    props.type ||
    tableId
  );
}

function formatSearchSubtitle(props, tableId, layerId) {
  if (tableId === 'roads_line') {
    return compactJoin([
      isMeaningfulLabel(props.type) ? props.type : null,
      isMeaningfulLabel(props.district) ? props.district : null,
      isMeaningfulLabel(props.ownership) ? props.ownership : null,
      isMeaningfulLabel(props.department) ? props.department : null,
    ], ' | ') || `${tableId} | ${layerId}`;
  }
  if (tableId === 'hsvp_plots') {
    return compactJoin([props.parcel_type, props.area_sqm ? `${props.area_sqm} sqm` : null, props.district], ' | ') || `${tableId} | ${layerId}`;
  }
  if (tableId === 'hsiidc_boundary') {
    return compactJoin([props.pwd_div, props.pwd_cir, props.shape_area ? `${Math.round(Number(props.shape_area))} sqm` : null], ' | ') || `${tableId} | ${layerId}`;
  }

  const values = (SUBTITLE_FIELDS_BY_TABLE[tableId] || [])
    .map((field) => props[field])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map((value) => String(value).trim())
    .slice(0, 3);
  return values.length ? values.join(' | ') : `${tableId} | ${layerId}`;
}

async function searchFeatures(req, res) {
  const pool = ensurePool();
  const { keyword, layer } = req.query;
  if (!keyword || typeof keyword !== 'string' || keyword.trim() === '') throw new AppError(400, 'invalid_keyword', 'keyword parameter is required');

  const keywordClean = keyword.trim();
  const q = `%${keywordClean}%`;
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
  const allowed = new Set(postgisRegistry.listLayerKeys());
  const target = layer && allowed.has(layer) ? layer : null;

  const tables = getSearchTables(keywordClean, target);
  const hintedTables = new Set(getSearchTables(keywordClean, null).filter((table) => SEARCH_TABLE_HINTS.some((entry) => entry.tables.includes(table) && entry.terms.some((term) => keywordClean.toLowerCase().includes(term)))));

  const results = [];
  for (const tbl of tables) {
    const safeTbl = validateTableName(tbl);
    const cfg = layerRegistry.getLayerConfig(tbl);
    const tableMatchesQuery = tbl.toLowerCase().includes(keywordClean.toLowerCase().replace(/\s+/g, '_')) || hintedTables.has(tbl);
    const layerId = cfg?.category || target || 'unknown';
    const searchColumns = await getSearchColumns(pool, safeTbl);
    const searchExpression = buildSearchExpression(searchColumns);
    const sql = `
      SELECT
        (to_jsonb(t) - 'geom') as properties,
        ST_AsGeoJSON(
          CASE
            WHEN GeometryType(t.geom) IN ('POINT', 'MULTIPOINT') THEN t.geom
            ELSE ST_SimplifyPreserveTopology(t.geom, 0.0005)
          END
        )::json as geometry,
        ST_AsGeoJSON(ST_PointOnSurface(t.geom))::json as center
      FROM ${safeTbl} t
      WHERE ($3::boolean = true OR ${searchExpression} ILIKE $1)
      LIMIT $2
    `;
    try {
      const { rows } = await pool.query(sql, [q, limit, tableMatchesQuery]);
      for (const r of rows) {
        const props = r.properties || {};
        const center = r.center?.coordinates;
        results.push({
          id: props.id || props.gid || props.objectid || props.pk || `${tbl}-${results.length + 1}`,
          tableId: tbl,
          layerId,
          name: formatSearchName(props, tbl),
          subtitle: formatSearchSubtitle(props, tbl, layerId),
          type: cfg?.geometryType || 'feature',
          properties: props,
          geometry: r.geometry || null,
          center: Array.isArray(center) ? { lng: center[0], lat: center[1] } : null,
        });
        if (results.length >= limit) break;
      }
    } catch (e) {
      console.error('[features] search error', e.message || e);
    }
    if (results.length >= limit) break;
  }

  res.json({ keyword: keywordClean, layer: target || 'all', count: results.length, features: results });
}

async function findNearby(req, res) {
  const pool = ensurePool();
  const { lat, lng, radius = 2, type } = req.query;
  if (!lat || !lng) throw new AppError(400, 'invalid_coordinates', 'lat and lng parameters are required');
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) throw new AppError(400, 'invalid_coordinates', 'Invalid lat/lng values');

  const radiusKm = Number(radius) || 2;
  const radiusM = Math.max(10, Math.min(200000, Math.round(radiusKm * 1000)));
  // Approximate degree expand so GiST can prefilter before expensive geography distance.
  const expandDeg = Math.min(2, Math.max(0.01, radiusM / 111320));

  const layerKeys = type && postgisRegistry.hasLayer(type) ? [type] : postgisRegistry.listLayerKeys();
  const candidates = [];

  for (const key of layerKeys) {
    const tables = postgisRegistry.getTablesForLayer(key);
    for (const tbl of tables) {
      const safeTbl = validateTableName(tbl);
      const cfg = layerRegistry.getLayerConfig(tbl);
      // Facility proximity is for points / stations — skip heavy polygon nets.
      if (cfg?.geometryType === 'polygon' || cfg?.heavy) continue;
      const sql = `
        SELECT (to_jsonb(t) - 'geom') as properties,
               ST_AsGeoJSON(t.geom)::json as geometry,
               ST_Distance(t.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) as distance_m
        FROM ${safeTbl} t
        WHERE t.geom && ST_Expand(ST_SetSRID(ST_MakePoint($1,$2),4326), $4)
          AND ST_DWithin(t.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
        ORDER BY distance_m ASC
        LIMIT 200`;
      try {
        const { rows } = await pool.query(sql, [lngNum, latNum, radiusM, expandDeg]);
        for (const r of rows) {
          const props = r.properties || {};
          const geometry = r.geometry || null;
          candidates.push({
            id: props.id || props.gid || props.objectid || null,
            layerId: key,
            tableId: tbl,
            type: key,
            name: formatSearchName(props, tbl),
            properties: props,
            geometry,
            coordinates: geometry?.coordinates || null,
            distanceKm: +(r.distance_m / 1000).toFixed(3),
          });
        }
      } catch (e) {
        console.error('[features] nearby query error', e.message || e);
      }
    }
  }

  candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  res.json({
    center: { lat: latNum, lng: lngNum },
    lat: latNum,
    lng: lngNum,
    radiusKm,
    type: type || 'all',
    count: Math.min(candidates.length, DEFAULT_LIMIT),
    features: candidates.slice(0, DEFAULT_LIMIT),
  });
}

async function getFeatureDetail(req, res) {
  const pool = ensurePool();
  const { layerId, featureId } = req.params;
  if (!featureId) throw new AppError(400, 'invalid_id', 'featureId is required');

  const searchLayers = layerId && postgisRegistry.hasLayer(layerId) ? [layerId] : postgisRegistry.listLayerKeys();

  for (const key of searchLayers) {
    const tables = postgisRegistry.getTablesForLayer(key);
    for (const tbl of tables) {
      const safeTbl = validateTableName(tbl);
      const sql = `SELECT (to_jsonb(t) - 'geom') as properties, ST_AsGeoJSON(t.geom)::json as geometry FROM ${safeTbl} t WHERE (t.id::text = $1 OR t.gid::text = $1 OR t.pk::text = $1) LIMIT 1`;
      try {
        const { rows } = await pool.query(sql, [String(featureId)]);
        if (rows.length > 0) {
          const r = rows[0];
          const props = r.properties || {};

          // compute nearby count (simple sum across registered tables within 5km)
          let nearbyCount = 0;
          try {
            const geomText = JSON.stringify(r.geometry || {});
            for (const k of postgisRegistry.listLayerKeys()) {
              const tbs = postgisRegistry.getTablesForLayer(k);
            for (const t of tbs) {
              try {
                const safeT = validateTableName(t);
                const cr = await pool.query(`SELECT COUNT(*) as cnt FROM ${safeT} WHERE ST_DWithin(geom::geography, ST_GeomFromGeoJSON($1)::geography, 5000)`, [geomText]);
                  nearbyCount += parseInt(cr.rows[0].cnt || 0, 10);
                } catch (_) {
                  // ignore per-table errors
                }
              }
            }
          } catch (_) {
            nearbyCount = 0;
          }

          res.json({ id: props.id || props.gid || null, layerId: key, name: props.name || '', properties: props, geometry: r.geometry || null, nearbyCount });
          return;
        }
      } catch (e) {
        // continue
      }
    }
  }

  throw new AppError(404, 'feature_not_found', 'Feature not found');
}

async function getLayerStatistics(req, res) {
  const pool = ensurePool();
  const { layer } = req.query;
  const allowed = new Set(postgisRegistry.listLayerKeys());
  const keys = layer && allowed.has(layer) ? [layer] : postgisRegistry.listLayerKeys();

  const stats = [];
  for (const key of keys) {
    const tables = postgisRegistry.getTablesForLayer(key);
    let featureCount = 0;
    let totalArea = 0;
    for (const tbl of tables) {
      try {
        const safeTbl = validateTableName(tbl);
        const c = await pool.query(`SELECT COUNT(*) as cnt, SUM(ST_Area(geom::geography)) as area FROM ${safeTbl}`);
        featureCount += parseInt(c.rows[0].cnt || 0, 10);
        totalArea += parseFloat(c.rows[0].area || 0);
      } catch (_) {
        // ignore per-table errors
      }
    }
    stats.push({ layerId: key, featureCount, totalAreaSqm: totalArea });
  }

  res.json({ layer: layer || 'all', count: stats.length, statistics: stats });
}

async function queryWithinBounds(req, res) {
  const pool = ensurePool();
  const { bbox, layer } = req.body;
  if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) throw new AppError(400, 'invalid_bbox', 'bbox must be [minLon,minLat,maxLon,maxLat]');
  const [minLon, minLat, maxLon, maxLat] = bbox.map(Number);

  const allowed = new Set(postgisRegistry.listLayerKeys());
  const keys = layer && allowed.has(layer) ? [layer] : postgisRegistry.listLayerKeys();

  const env = `ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326)`;
  const features = [];
  for (const key of keys) {
    const tables = postgisRegistry.getTablesForLayer(key);
    for (const tbl of tables) {
      const safeTbl = validateTableName(tbl);
      const sql = `SELECT (to_jsonb(t) - 'geom') as properties, ST_AsGeoJSON(t.geom)::json as geometry FROM ${safeTbl} t WHERE ST_Intersects(t.geom, ${env}) LIMIT 200`;
      try {
        const { rows } = await pool.query(sql);
        for (const r of rows) {
          const props = r.properties || {};
          features.push({ id: props.id || props.gid || null, layerId: key, name: props.name || '', properties: props, geometry: r.geometry || null });
        }
      } catch (e) {
        console.error('[features] bbox query error', e.message || e);
      }
    }
  }

  res.json({ bbox, layer: layer || 'all', count: features.length, features });
}

async function findNearestFacility(req, res) {
  const pool = ensurePool();
  const { lat, lng, facility_type, max_distance_km = 10 } = req.body;
  if (lat == null || lng == null) throw new AppError(400, 'invalid_coordinates', 'lat and lng are required');
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) throw new AppError(400, 'invalid_coordinates', 'Invalid lat/lng values');

  const maxM = Math.max(10, Math.min(200000, Math.round(Number(max_distance_km) * 1000)));
  const expandDeg = Math.min(2, Math.max(0.01, maxM / 111320));

  const preferredFacilityLayers = [
    'social-infrastructure',
    'transportation',
    'utilities',
    'administrative',
  ];
  const layerKeys =
    facility_type && postgisRegistry.hasLayer(facility_type)
      ? [facility_type]
      : preferredFacilityLayers.filter((k) => postgisRegistry.hasLayer(k));

  let best = null;

  for (const key of layerKeys) {
    const tables = postgisRegistry.getTablesForLayer(key);
    for (const tbl of tables) {
      const cfg = layerRegistry.getLayerConfig(tbl);
      if (cfg?.geometryType === 'polygon' || cfg?.heavy) continue;
      const safeTbl = validateTableName(tbl);
      const sql = `
        SELECT (to_jsonb(t) - 'geom') as properties,
               ST_AsGeoJSON(t.geom)::json as geometry,
               ST_Distance(t.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) as distance_m
        FROM ${safeTbl} t
        WHERE t.geom && ST_Expand(ST_SetSRID(ST_MakePoint($1,$2),4326), $4)
          AND ST_DWithin(t.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
        ORDER BY distance_m ASC
        LIMIT 1`;
      try {
        const { rows } = await pool.query(sql, [lngNum, latNum, maxM, expandDeg]);
        if (rows.length > 0) {
          const r = rows[0];
          const props = r.properties || {};
          const geometry = r.geometry || null;
          const candidate = {
            id: props.id || props.gid || props.objectid || null,
            layerId: key,
            tableId: tbl,
            type: key,
            name: formatSearchName(props, tbl),
            properties: props,
            geometry,
            coordinates: geometry?.coordinates || null,
            distanceKm: +(r.distance_m / 1000).toFixed(3),
          };
          if (!best || candidate.distanceKm < best.distanceKm) best = candidate;
        }
      } catch (e) {
        console.error('[features] nearest facility error', e.message || e);
      }
    }
  }

  if (!best) {
    res.json({ found: false, message: 'No facility found within specified distance' });
    return;
  }

  res.json({ found: true, facility: best });
}

async function resolveZoneAnchor(pool, { zoneId, lng, lat }) {
  const lngNum = lng != null ? Number(lng) : NaN;
  const latNum = lat != null ? Number(lat) : NaN;
  if (Number.isFinite(lngNum) && Number.isFinite(latNum)) {
    return {
      lng: lngNum,
      lat: latNum,
      meta: { id: zoneId || null, name: 'Selected map point', layer: 'point' },
    };
  }

  if (!zoneId) {
    throw new AppError(400, 'invalid_zone', 'zoneId or lng/lat is required');
  }

  const raw = String(zoneId);
  if (raw.includes(':')) {
    const [tableId, rawFeatureId] = raw.split(':');
    if (!layerRegistry.hasTable(tableId)) {
      throw new AppError(404, 'zone_not_found', `Unknown zone table: ${tableId}`);
    }
    const safeTbl = validateTableName(tableId);
    const featureId = Number(rawFeatureId);
    if (!Number.isFinite(featureId)) {
      throw new AppError(400, 'invalid_zone', 'zoneId must be table:id');
    }
    for (const col of ['id', 'objectid', 'gid']) {
      try {
        const { rows } = await pool.query(
          `SELECT (to_jsonb(t) - 'geom') as properties,
                  ST_X(ST_PointOnSurface(t.geom)) AS lng,
                  ST_Y(ST_PointOnSurface(t.geom)) AS lat
           FROM ${safeTbl} t
           WHERE t.${col} = $1
           LIMIT 1`,
          [featureId]
        );
        if (rows[0]) {
          return {
            lng: Number(rows[0].lng),
            lat: Number(rows[0].lat),
            meta: {
              id: raw,
              name: formatSearchName(rows[0].properties || {}, tableId),
              layer: layerRegistry.getLayerConfig(tableId)?.category || tableId,
              tableId,
            },
          };
        }
      } catch {
        /* column may not exist on this table */
      }
    }
    throw new AppError(404, 'zone_not_found', 'Zone not found');
  }

  // Bare id — try industrial / cadastral zone tables first, then any registered table.
  const preferredTables = ['hsiidc_boundary', 'karnal_land_bank', 'hsvp_plots', 'licensed_colony', 'municipal_boundary'];
  const allTableIds =
    typeof layerRegistry.listTableIds === 'function'
      ? layerRegistry.listTableIds()
      : (layerRegistry.LAYER_CONFIGS || []).map((c) => c.id);

  const searchTables = [...new Set([...preferredTables, ...allTableIds])];
  for (const tbl of searchTables) {
    if (!layerRegistry.hasTable(tbl)) continue;
    const safeTbl = validateTableName(tbl);
    for (const col of ['id', 'objectid']) {
      try {
        const { rows } = await pool.query(
          `SELECT (to_jsonb(t) - 'geom') as properties,
                  ST_X(ST_PointOnSurface(t.geom)) AS lng,
                  ST_Y(ST_PointOnSurface(t.geom)) AS lat
           FROM ${safeTbl} t
           WHERE t.${col}::text = $1
           LIMIT 1`,
          [raw]
        );
        if (rows[0]) {
          return {
            lng: Number(rows[0].lng),
            lat: Number(rows[0].lat),
            meta: {
              id: `${tbl}:${raw}`,
              name: formatSearchName(rows[0].properties || {}, tbl),
              layer: layerRegistry.getLayerConfig(tbl)?.category || tbl,
              tableId: tbl,
            },
          };
        }
      } catch {
        /* ignore */
      }
    }
  }

  throw new AppError(404, 'zone_not_found', 'Zone not found');
}

async function countFacilitiesNearPoint(pool, lng, lat) {
  const keys = postgisRegistry.listLayerKeys();
  const counts = {};
  const expand2 = 2000 / 111320;
  const expand5 = 5000 / 111320;

  for (const k of keys) {
    const tables = postgisRegistry.getTablesForLayer(k);
    let count2 = 0;
    let count5 = 0;
    for (const t of tables) {
      const cfg = layerRegistry.getLayerConfig(t);
      if (cfg?.heavy || cfg?.geometryType === 'polygon') continue;
      try {
        const safeT = validateTableName(t);
        const c2 = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM ${safeT}
           WHERE geom && ST_Expand(ST_SetSRID(ST_MakePoint($1,$2),4326), $3)
             AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 2000)`,
          [lng, lat, expand2]
        );
        const c5 = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM ${safeT}
           WHERE geom && ST_Expand(ST_SetSRID(ST_MakePoint($1,$2),4326), $3)
             AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 5000)`,
          [lng, lat, expand5]
        );
        count2 += c2.rows[0]?.cnt || 0;
        count5 += c5.rows[0]?.cnt || 0;
      } catch {
        /* ignore per-table errors */
      }
    }
    counts[k] = { '2km': count2, '5km': count5 };
  }
  return counts;
}

async function getZoneFacilitiesSummary(req, res) {
  const pool = ensurePool();
  const { zoneId, lng, lat } = req.query;
  const anchor = await resolveZoneAnchor(pool, { zoneId, lng, lat });
  const facilitiesCount = await countFacilitiesNearPoint(pool, anchor.lng, anchor.lat);
  res.json({
    zoneId: anchor.meta.id || zoneId || null,
    zone: anchor.meta,
    center: { lng: anchor.lng, lat: anchor.lat },
    facilitiesCount,
  });
}

async function getZoneFacilitiesByType(req, res) {
  const pool = ensurePool();
  const { zoneId, facilityType } = req.params;
  const { sort = 'distance', limit = 50, lng, lat } = req.query;
  const anchor = await resolveZoneAnchor(pool, { zoneId, lng, lat });
  const maxLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
  const expandDeg = 5000 / 111320;

  const tables = postgisRegistry.hasLayer(facilityType) ? postgisRegistry.getTablesForLayer(facilityType) : [];
  const results = [];

  for (const tbl of tables) {
    const cfg = layerRegistry.getLayerConfig(tbl);
    if (cfg?.heavy || cfg?.geometryType === 'polygon') continue;
    const safeTbl = validateTableName(tbl);
    const sql = `
      SELECT (to_jsonb(t) - 'geom') as properties,
             ST_AsGeoJSON(t.geom)::json as geometry,
             ST_Distance(t.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) as distance_m
      FROM ${safeTbl} t
      WHERE t.geom && ST_Expand(ST_SetSRID(ST_MakePoint($1,$2),4326), $3)
        AND ST_DWithin(t.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 5000)
      ORDER BY distance_m ASC
      LIMIT $4`;
    try {
      const { rows } = await pool.query(sql, [anchor.lng, anchor.lat, expandDeg, maxLimit]);
      for (const r of rows) {
        const props = r.properties || {};
        const geometry = r.geometry || null;
        results.push({
          id: props.id || props.gid || props.objectid || null,
          name: formatSearchName(props, tbl),
          type: facilityType,
          tableId: tbl,
          properties: props,
          geometry,
          coordinates: geometry?.coordinates || null,
          distanceFromZoneKm: +(r.distance_m / 1000).toFixed(3),
        });
      }
    } catch (e) {
      console.error('[features] zone facilities error', e.message || e);
    }
  }

  if (sort !== 'distance') results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  else results.sort((a, b) => (a.distanceFromZoneKm || 1e9) - (b.distanceFromZoneKm || 1e9));

  res.json({
    zoneId: anchor.meta.id || zoneId,
    facilityType,
    center: { lng: anchor.lng, lat: anchor.lat },
    count: results.length,
    facilities: results.slice(0, maxLimit),
  });
}

function parseBboxQuery(bboxRaw) {
  if (!bboxRaw || typeof bboxRaw !== 'string') {
    throw new AppError(400, 'invalid_bbox', 'Query parameter bbox is required (minLon,minLat,maxLon,maxLat)');
  }
  const parts = bboxRaw.split(',').map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw new AppError(400, 'invalid_bbox', 'bbox must be four comma-separated numbers');
  }
  const [minX, minY, maxX, maxY] = parts;
  if (minX >= maxX || minY >= maxY) {
    throw new AppError(400, 'invalid_bbox', 'bbox must have minLon < maxLon and minLat < maxLat');
  }
  return { minX, minY, maxX, maxY };
}

/** Bbox-filtered GeoJSON for a single table (clustering / lightweight overlays). */
async function getFeaturesByBbox(req, res) {
  const pool = ensurePool();
  const { tableId } = req.params;
  if (!layerRegistry.hasTable(tableId)) {
    throw new AppError(400, 'unknown_table', `Unknown table layer: ${tableId}`);
  }

  const bbox = parseBboxQuery(req.query.bbox);
  const limit = Math.min(2000, Math.max(1, Number.parseInt(req.query.limit, 10) || 1500));
  const safeTbl = validateTableName(tableId);
  const env = `ST_MakeEnvelope(${bbox.minX}, ${bbox.minY}, ${bbox.maxX}, ${bbox.maxY}, 4326)`;

  const sql = `SELECT (to_jsonb(t) - 'geom') as properties, ST_AsGeoJSON(t.geom)::json as geometry
    FROM ${safeTbl} t
    WHERE ST_Intersects(t.geom, ${env})
    LIMIT ${limit}`;

  const features = [];
  try {
    const { rows } = await pool.query(sql);
    for (const r of rows) {
      features.push({ type: 'Feature', properties: r.properties || {}, geometry: r.geometry || null });
    }
  } catch (err) {
    console.error('[features] bbox query error:', err.message);
    throw new AppError(503, 'bbox_query_failed', 'Feature query failed');
  }

  res.json({ type: 'FeatureCollection', features });
}

module.exports = {
  searchFeatures,
  findNearby,
  getFeatureDetail,
  getLayerStatistics,
  queryWithinBounds,
  findNearestFacility,
  getZoneFacilitiesSummary,
  getZoneFacilitiesByType,
  getFeaturesByBbox,
};
