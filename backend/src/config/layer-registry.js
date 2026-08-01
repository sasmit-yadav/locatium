/**
 * Per-table layer configuration for PostGIS MVT rendering.
 * Keep paint colors in sync with frontend/src/config/layer-registry.js
 */

const DEFAULT_OUTLINE = {
  lineColor: '#ff4444',
  lineWidth: 1,
  fillOpacity: 0,
  lineOpacity: 0.85,
};

function pt(circleColor, radiusExpr, opacity = 0.92) {
  return {
    circleColor,
    circleRadius: radiusExpr,
    circleOpacity: opacity,
    circleStrokeWidth: 1.25,
    circleStrokeColor: '#ffffff',
  };
}

const R_SM = ['interpolate', ['linear'], ['zoom'], 9, 2.5, 13, 5, 16, 7];
const R_MD = ['interpolate', ['linear'], ['zoom'], 8, 3, 12, 5.5, 16, 8];
const R_UTIL = ['interpolate', ['linear'], ['zoom'], 13, 2.5, 16, 5.5];
const R_METRO = ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 7];

const ROADS_STYLE = {
  lineColor: '#f1f5f9',
  lineWidth: ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 1.5, 15, 4],
  lineOpacity: 0.92,
};

const BUS_STOP_SYMBOL = {
  iconImage: 'bus-stop-icon-v2',
  iconSize: ['interpolate', ['linear'], ['zoom'], 8, 0.55, 12, 0.85, 16, 1.1],
};

const BUS_STOP_CLUSTER = {
  circleColor: '#1d4ed8',
  circleRadius: ['step', ['get', 'point_count'], 10, 10, 12, 40, 14, 100, 16],
  circleOpacity: 0.82,
  circleStrokeWidth: 1.25,
  circleStrokeColor: '#ffffff',
};

const AIRPORT_SYMBOL = {
  iconImage: 'airport-icon-v2',
  iconSize: ['interpolate', ['linear'], ['zoom'], 0, 0.4, 8, 0.85, 12, 1.2],
};

function vec(table, category, geometryType, minzoom, style, opts = {}) {
  return {
    id: table,
    table,
    category,
    geometryType,
    renderType: opts.renderType || (geometryType === 'point' ? 'circle' : geometryType),
    sourceType: 'vector',
    source: `/api/tiles/${table}/{z}/{x}/{y}.pbf`,
    sourceLayer: 'data',
    minzoom,
    maxzoom: opts.maxzoom ?? 22,
    visible: false,
    interactive: true,
    heavy: Boolean(opts.heavy),
    style,
    filters: opts.filters ?? null,
    clusterStyle: opts.clusterStyle ?? null,
    performance: {
      lazy: true,
      viewportFilter: true,
      clusterBelowZoom: opts.clusterBelowZoom ?? null,
    },
  };
}

const LAYER_CONFIGS = [
  vec('state_boundary', 'administrative', 'polygon', 0, { ...DEFAULT_OUTLINE, lineColor: '#9f1239', lineWidth: 2.5 }),
  vec('district_boundary', 'administrative', 'polygon', 0, { ...DEFAULT_OUTLINE, lineColor: '#c2410c', lineWidth: 1.75 }),
  vec('tehsil_boundary', 'administrative', 'polygon', 7, { ...DEFAULT_OUTLINE, lineColor: '#0369a1', lineWidth: 1.25 }),
  vec('village_boundary', 'administrative', 'polygon', 11, { ...DEFAULT_OUTLINE, lineColor: '#22d3ee', lineWidth: 0.8 }, { heavy: true }),
  vec('assembly_boundary', 'administrative', 'polygon', 0, { ...DEFAULT_OUTLINE, lineColor: '#7c3aed', lineWidth: 1.5 }),
  vec('parliament_boundary', 'administrative', 'polygon', 0, { ...DEFAULT_OUTLINE, lineColor: '#4c1d95', lineWidth: 2 }),
  vec('municipal_boundary', 'administrative', 'polygon', 0, { ...DEFAULT_OUTLINE, lineColor: '#57534e', lineWidth: 1.5 }),
  vec('ncr_district', 'administrative', 'polygon', 0, { ...DEFAULT_OUTLINE, lineColor: '#a8a29e', lineWidth: 1.25 }),

  vec(
    'hsvp_plots',
    'cadastral',
    'polygon',
    14,
    { lineColor: '#ea580c', lineWidth: 0.7, fillColor: '#ea580c', fillOpacity: 0.06, lineOpacity: 0.9 },
    { heavy: true }
  ),
  vec('licensed_colony', 'cadastral', 'polygon', 12, {
    lineColor: '#db2777',
    lineWidth: 1.2,
    fillColor: '#db2777',
    fillOpacity: 0.08,
    lineOpacity: 0.9,
  }),
  vec('controlled_area', 'cadastral', 'polygon', 11, {
    lineColor: '#64748b',
    lineWidth: 1.1,
    fillColor: '#64748b',
    fillOpacity: 0.05,
    lineOpacity: 0.85,
  }),
  vec('development_plan', 'cadastral', 'polygon', 11, {
    lineColor: '#0d9488',
    lineWidth: 1.2,
    fillColor: '#0d9488',
    fillOpacity: 0.07,
    lineOpacity: 0.9,
  }),
  vec('habitation_area', 'cadastral', 'polygon', 12, {
    lineColor: '#ca8a04',
    lineWidth: 1,
    fillColor: '#eab308',
    fillOpacity: 0.08,
    lineOpacity: 0.85,
  }),

  vec('roads_line', 'transportation', 'line', 8, ROADS_STYLE, { heavy: true }),
  vec('rail_network', 'transportation', 'line', 9, { lineColor: '#b45309', lineWidth: 2.25, lineOpacity: 0.95 }),
  vec('rapid_metro_line', 'transportation', 'line', 10, { lineColor: '#e11d48', lineWidth: 2.5, lineOpacity: 0.95 }),
  vec('delhi_metro_line', 'transportation', 'line', 10, { lineColor: '#1d4ed8', lineWidth: 2.5, lineOpacity: 0.95 }),
  vec('proposed_metro_line', 'transportation', 'line', 10, { lineColor: '#a855f7', lineWidth: 2.25, lineOpacity: 0.9 }),
  vec('canal', 'transportation', 'line', 8, { lineColor: '#0e7490', lineWidth: 1.75, lineOpacity: 0.9 }),

  vec('airports', 'transportation', 'point', 0, AIRPORT_SYMBOL, { renderType: 'symbol' }),
  vec('bus_stops', 'transportation', 'point', 8, BUS_STOP_SYMBOL, {
    renderType: 'symbol',
    clusterBelowZoom: 11,
    clusterStyle: BUS_STOP_CLUSTER,
  }),
  vec('rapid_metro_station', 'transportation', 'point', 8, pt('#e11d48', R_METRO)),
  vec('delhi_metro_station', 'transportation', 'point', 8, pt('#4338ca', R_METRO)),
  vec('proposed_metro_station', 'transportation', 'point', 8, pt('#9333ea', R_METRO)),

  vec('hospitals', 'social-infrastructure', 'point', 10, pt('#dc2626', R_MD)),
  vec('govt_school', 'social-infrastructure', 'point', 11, pt('#3b82f6', R_SM)),
  vec('iti', 'social-infrastructure', 'point', 11, pt('#c2410c', R_SM)),
  vec('haryana_police_public_schools_point', 'social-infrastructure', 'point', 11, pt('#7c3aed', R_SM)),
  vec('pm_shri_and_sanskriti_school', 'social-infrastructure', 'point', 11, pt('#0891b2', R_SM)),
  vec('jails_point', 'social-infrastructure', 'point', 11, pt('#1e3a8a', R_SM)),

  vec('water_network', 'utilities', 'line', 13, { lineColor: '#0284c7', lineWidth: 1.5, lineOpacity: 0.9 }, { heavy: true }),
  vec('sewerage_line', 'utilities', 'line', 13, { lineColor: '#65a30d', lineWidth: 1.5, lineOpacity: 0.9 }, { heavy: true }),
  vec('pri_oh_electric_line', 'utilities', 'line', 13, { lineColor: '#f59e0b', lineWidth: 1.6, lineOpacity: 0.92 }, { heavy: true }),
  vec('sec_oh_electric_line', 'utilities', 'line', 13, { lineColor: '#fbbf24', lineWidth: 1.2, lineOpacity: 0.88 }, { heavy: true }),
  vec('pri_ug_electric_segment', 'utilities', 'line', 13, { lineColor: '#d97706', lineWidth: 1.5, lineOpacity: 0.9 }, { heavy: true }),
  vec('sec_ug_electric_line', 'utilities', 'line', 13, { lineColor: '#fde68a', lineWidth: 1.1, lineOpacity: 0.85 }, { heavy: true }),
  vec('hvpnl_line', 'utilities', 'line', 13, { lineColor: '#be123c', lineWidth: 2.25, lineOpacity: 0.95 }),
  vec('conduit_system', 'utilities', 'line', 13, { lineColor: '#78716c', lineWidth: 1.2, lineOpacity: 0.85 }, { heavy: true }),
  vec('eht_feeder', 'utilities', 'line', 13, { lineColor: '#c026d3', lineWidth: 1.75, lineOpacity: 0.92 }, { heavy: true }),
  vec('ioc_gas_line', 'utilities', 'line', 13, { lineColor: '#f97316', lineWidth: 1.75, lineOpacity: 0.92 }),
  vec('women_line', 'utilities', 'line', 13, { lineColor: '#ec4899', lineWidth: 1.5, lineOpacity: 0.9 }),

  vec('sewerage_point', 'utilities', 'point', 13, pt('#4d7c0f', R_UTIL), { heavy: true }),
  vec('electric_station', 'utilities', 'point', 13, pt('#b91c1c', R_UTIL)),
  vec('bus_bar', 'utilities', 'point', 14, pt('#7c2d12', R_UTIL), { heavy: true }),
  vec('distribution_transformer', 'utilities', 'point', 14, pt('#f59e0b', R_UTIL), { heavy: true }),
  vec('hv_transformer', 'utilities', 'point', 14, pt('#ea580c', R_UTIL)),
  vec('generator', 'utilities', 'point', 14, pt('#16a34a', R_UTIL)),
  vec('switch', 'utilities', 'point', 14, pt('#6366f1', R_UTIL), { heavy: true }),
  vec('switching_facility', 'utilities', 'point', 14, pt('#8b5cf6', R_UTIL)),
  vec('open_point', 'utilities', 'point', 14, pt('#94a3b8', R_UTIL), { heavy: true }),
  vec('joint', 'utilities', 'point', 14, pt('#a16207', R_UTIL), { heavy: true }),
  vec('mobile_towers', 'utilities', 'point', 13, pt('#0ea5e9', R_UTIL)),

  vec('wetlands', 'environmental', 'polygon', 0, {
    fillColor: '#14b8a6',
    fillOpacity: 0.28,
    lineColor: '#0f766e',
    lineWidth: 1.25,
  }),
  vec('forest_area', 'environmental', 'polygon', 0, {
    fillColor: '#166534',
    fillOpacity: 0.32,
    lineColor: '#14532d',
    lineWidth: 1.25,
  }),
  vec('low_lying_area', 'environmental', 'polygon', 0, {
    fillColor: '#f472b6',
    fillOpacity: 0.26,
    lineColor: '#db2777',
    lineWidth: 1.25,
  }),
  vec('lu_lc', 'environmental', 'polygon', 9, {
    fillColor: '#a3e635',
    fillOpacity: 0.14,
    lineColor: '#65a30d',
    lineWidth: 0.8,
  }),
  vec('ponds', 'environmental', 'polygon', 9, {
    fillColor: '#38bdf8',
    fillOpacity: 0.35,
    lineColor: '#0284c7',
    lineWidth: 1.25,
  }),
  vec('haryana_rivers', 'environmental', 'line', 8, { lineColor: '#1d4ed8', lineWidth: 2.25, lineOpacity: 0.92 }),

  vec('hsiidc_boundary', 'industrial-investment', 'polygon', 9, {
    lineColor: '#f59e0b',
    lineWidth: 2.25,
    fillColor: '#f59e0b',
    fillOpacity: 0.16,
    lineOpacity: 0.95,
  }),
  vec('karnal_land_bank', 'industrial-investment', 'polygon', 10, {
    lineColor: '#84cc16',
    lineWidth: 2.25,
    fillColor: '#84cc16',
    fillOpacity: 0.16,
    lineOpacity: 0.95,
  }),

  vec('soil_type', 'soil', 'polygon', 10, {
    fillColor: '#d97706',
    fillOpacity: 0.18,
    lineColor: '#92400e',
    lineWidth: 1,
  }),
  vec('soil_depth', 'soil', 'polygon', 10, {
    fillColor: '#a16207',
    fillOpacity: 0.18,
    lineColor: '#78350f',
    lineWidth: 1,
  }),
];

const LAYER_BY_ID = Object.fromEntries(LAYER_CONFIGS.map((l) => [l.id, l]));

const TABLES_BY_CATEGORY = LAYER_CONFIGS.reduce((acc, l) => {
  if (!acc[l.category]) acc[l.category] = [];
  acc[l.category].push(l.table);
  return acc;
}, {});

function getLayerConfig(id) {
  return LAYER_BY_ID[id] || null;
}

function getTablesForCategory(category) {
  return TABLES_BY_CATEGORY[category] || [];
}

function listTableIds() {
  return LAYER_CONFIGS.map((l) => l.id);
}

function hasTable(id) {
  return Boolean(LAYER_BY_ID[id]);
}

module.exports = {
  LAYER_CONFIGS,
  LAYER_BY_ID,
  TABLES_BY_CATEGORY,
  getLayerConfig,
  getTablesForCategory,
  listTableIds,
  hasTable,
};
