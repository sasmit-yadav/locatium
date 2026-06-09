/**
 * Per-table layer config — mirrors backend/src/config/layer-registry.js
 */

const DEFAULT_OUTLINE = {
  lineColor: '#ff4444',
  lineWidth: 1,
  fillOpacity: 0,
  lineOpacity: 0.8,
};

const CADASTRAL_OUTLINE = {
  lineColor: '#dddddd',
  lineWidth: 0.5,
  fillOpacity: 0,
  lineOpacity: 0.85,
};

const ROADS_STYLE = {
  lineColor: '#ffffff',
  lineWidth: ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 1.5, 15, 4],
  lineOpacity: 0.9,
};

const RAIL_STYLE = { lineColor: '#ffaa00', lineWidth: 2, lineOpacity: 0.9 };
const METRO_STYLE = { lineColor: '#00ffff', lineWidth: 2, lineOpacity: 0.9 };
const UTILITY_LINE = { lineColor: '#ff00ff', lineWidth: 1, lineOpacity: 0.85 };
const ENV_FILL = { fillColor: '#00ff99', fillOpacity: 0.18, lineColor: '#00cc77', lineWidth: 1 };
const WATER_FILL = { fillColor: '#00bfff', fillOpacity: 0.2, lineColor: '#0099cc', lineWidth: 1 };
const INVEST_FILL = { lineColor: '#ffd700', lineWidth: 2, fillColor: '#ffd700', fillOpacity: 0.12 };

const BUS_STOP_SYMBOL = {
  iconImage: 'bus-stop-icon',
  iconSize: ['interpolate', ['linear'], ['zoom'], 8, 0.55, 12, 0.85, 16, 1.1],
};

const BUS_STOP_CLUSTER = {
  circleColor: '#1d4ed8',
  circleRadius: ['step', ['get', 'point_count'], 16, 20, 20, 100, 26],
  circleOpacity: 0.88,
  circleStrokeWidth: 2,
  circleStrokeColor: '#ffffff',
};

const METRO_STATION_PT = {
  circleColor: '#ff00ff',
  circleRadius: ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 7],
  circleOpacity: 0.95,
};

const AIRPORT_SYMBOL = {
  iconImage: 'airport-icon',
  iconSize: ['interpolate', ['linear'], ['zoom'], 0, 0.4, 8, 0.85, 12, 1.2],
};

const HOSPITAL_PT = {
  circleColor: '#ff4d4d',
  circleRadius: ['interpolate', ['linear'], ['zoom'], 8, 3, 12, 5, 16, 8],
  circleOpacity: 0.9,
};

const SCHOOL_PT = {
  circleColor: '#3399ff',
  circleRadius: ['interpolate', ['linear'], ['zoom'], 9, 2, 13, 5, 16, 7],
  circleOpacity: 0.9,
};

const POLICE_PT = {
  circleColor: '#0033cc',
  circleRadius: ['interpolate', ['linear'], ['zoom'], 9, 2, 13, 5, 16, 7],
  circleOpacity: 0.9,
};

const UTILITY_PT = {
  circleRadius: ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 5],
  circleColor: '#ffbe0b',
  circleOpacity: 0.85,
};

function vec(table, category, geometryType, minzoom, style, opts = {}) {
  return {
    id: table,
    table,
    category,
    geometryType,
    renderType: opts.renderType || (geometryType === 'point' ? 'circle' : geometryType),
    sourceLayer: 'data',
    minzoom,
    maxzoom: opts.maxzoom ?? 22,
    heavy: Boolean(opts.heavy),
    style,
    clusterStyle: opts.clusterStyle ?? null,
    performance: {
      lazy: true,
      viewportFilter: true,
      clusterBelowZoom: opts.clusterBelowZoom ?? null,
    },
  };
}

export const LAYER_CONFIGS = [
  vec('state_boundary', 'administrative', 'polygon', 0, { ...DEFAULT_OUTLINE, lineColor: '#c1121f', lineWidth: 2 }),
  vec('district_boundary', 'administrative', 'polygon', 0, { ...DEFAULT_OUTLINE, lineColor: '#e85d04' }),
  vec('tehsil_boundary', 'administrative', 'polygon', 7, { ...DEFAULT_OUTLINE, lineColor: '#0077b6' }),
  vec('village_boundary', 'administrative', 'polygon', 11, { ...DEFAULT_OUTLINE, lineColor: '#48cae4' }, { heavy: true }),
  vec('assembly_boundary', 'administrative', 'polygon', 0, { ...DEFAULT_OUTLINE, lineColor: '#9d4edd' }),
  vec('parliament_boundary', 'administrative', 'polygon', 0, { ...DEFAULT_OUTLINE, lineColor: '#7b2cbf', lineWidth: 2 }),
  vec('municipal_boundary', 'administrative', 'polygon', 0, { ...DEFAULT_OUTLINE, lineColor: '#6c757d' }),
  vec('ncr_district', 'administrative', 'polygon', 0, { ...DEFAULT_OUTLINE, lineColor: '#adb5bd' }),

  vec('hsvp_plots', 'cadastral', 'polygon', 14, { ...CADASTRAL_OUTLINE }, { heavy: true }),
  vec('licensed_colony', 'cadastral', 'polygon', 12, { ...CADASTRAL_OUTLINE, lineColor: '#cccccc' }),
  vec('controlled_area', 'cadastral', 'polygon', 11, { ...CADASTRAL_OUTLINE }),
  vec('development_plan', 'cadastral', 'polygon', 11, { ...CADASTRAL_OUTLINE }),
  vec('habitation_area', 'cadastral', 'polygon', 12, { ...CADASTRAL_OUTLINE }),

  vec('roads_line', 'transportation', 'line', 8, ROADS_STYLE, { heavy: true }),
  vec('rail_network', 'transportation', 'line', 9, RAIL_STYLE),
  vec('rapid_metro_line', 'transportation', 'line', 10, METRO_STYLE),
  vec('delhi_metro_line', 'transportation', 'line', 10, METRO_STYLE),
  vec('proposed_metro_line', 'transportation', 'line', 10, METRO_STYLE),
  vec('canal', 'transportation', 'line', 8, { lineColor: '#0099cc', lineWidth: 1.5, lineOpacity: 0.85 }),

  vec('airports', 'transportation', 'point', 0, AIRPORT_SYMBOL, { renderType: 'symbol' }),
  vec('bus_stops', 'transportation', 'point', 8, BUS_STOP_SYMBOL, {
    renderType: 'symbol',
    clusterBelowZoom: 11,
    clusterStyle: BUS_STOP_CLUSTER,
  }),
  vec('rapid_metro_station', 'transportation', 'point', 8, METRO_STATION_PT),
  vec('delhi_metro_station', 'transportation', 'point', 8, METRO_STATION_PT),
  vec('proposed_metro_station', 'transportation', 'point', 8, METRO_STATION_PT),

  vec('hospitals', 'social-infrastructure', 'point', 10, HOSPITAL_PT),
  vec('govt_school', 'social-infrastructure', 'point', 11, SCHOOL_PT),
  vec('iti', 'social-infrastructure', 'point', 11, SCHOOL_PT),
  vec('haryana_police_public_schools_point', 'social-infrastructure', 'point', 11, SCHOOL_PT),
  vec('pm_shri_and_sanskriti_school', 'social-infrastructure', 'point', 11, SCHOOL_PT),
  vec('jails_point', 'social-infrastructure', 'point', 11, POLICE_PT),

  vec('water_network', 'utilities', 'line', 13, { ...UTILITY_LINE, lineColor: '#0096c7' }, { heavy: true }),
  vec('sewerage_line', 'utilities', 'line', 13, { ...UTILITY_LINE, lineColor: '#6a994e' }, { heavy: true }),
  vec('pri_oh_electric_line', 'utilities', 'line', 13, UTILITY_LINE, { heavy: true }),
  vec('sec_oh_electric_line', 'utilities', 'line', 13, UTILITY_LINE, { heavy: true }),
  vec('pri_ug_electric_segment', 'utilities', 'line', 13, UTILITY_LINE, { heavy: true }),
  vec('sec_ug_electric_line', 'utilities', 'line', 13, UTILITY_LINE, { heavy: true }),
  vec('hvpnl_line', 'utilities', 'line', 13, { lineColor: '#c9184a', lineWidth: 2, lineOpacity: 0.9 }),
  vec('conduit_system', 'utilities', 'line', 13, UTILITY_LINE, { heavy: true }),
  vec('eht_feeder', 'utilities', 'line', 13, UTILITY_LINE, { heavy: true }),
  vec('ioc_gas_line', 'utilities', 'line', 13, UTILITY_LINE),
  vec('women_line', 'utilities', 'line', 13, UTILITY_LINE),
  vec('sewerage_point', 'utilities', 'point', 13, UTILITY_PT, { heavy: true }),
  vec('electric_station', 'utilities', 'point', 13, UTILITY_PT),
  vec('bus_bar', 'utilities', 'point', 14, UTILITY_PT, { heavy: true }),
  vec('distribution_transformer', 'utilities', 'point', 14, UTILITY_PT, { heavy: true }),
  vec('hv_transformer', 'utilities', 'point', 14, UTILITY_PT),
  vec('generator', 'utilities', 'point', 14, UTILITY_PT),
  vec('switch', 'utilities', 'point', 14, UTILITY_PT, { heavy: true }),
  vec('switching_facility', 'utilities', 'point', 14, UTILITY_PT),
  vec('open_point', 'utilities', 'point', 14, UTILITY_PT, { heavy: true }),
  vec('joint', 'utilities', 'point', 14, UTILITY_PT, { heavy: true }),
  vec('mobile_towers', 'utilities', 'point', 13, UTILITY_PT),

  vec('wetlands', 'environmental', 'polygon', 0, ENV_FILL),
  vec('forest_area', 'environmental', 'polygon', 0, { ...ENV_FILL, fillColor: '#2d6a4f' }),
  vec('low_lying_area', 'environmental', 'polygon', 0, ENV_FILL),
  vec('lu_lc', 'environmental', 'polygon', 9, { ...ENV_FILL, fillOpacity: 0.12 }),
  vec('ponds', 'environmental', 'polygon', 9, WATER_FILL),
  vec('haryana_rivers', 'environmental', 'line', 8, { lineColor: '#0099cc', lineWidth: 2, lineOpacity: 0.85 }),

  vec('hsiidc_boundary', 'industrial-investment', 'polygon', 9, INVEST_FILL),
  vec('karnal_land_bank', 'industrial-investment', 'polygon', 10, INVEST_FILL),
];

export function getLayersForCategory(categoryId) {
  return LAYER_CONFIGS.filter((l) => l.category === categoryId);
}

export function getCategoryMinZoom(categoryId) {
  const layers = getLayersForCategory(categoryId);
  if (layers.length === 0) return 0;
  return Math.min(...layers.map((l) => l.minzoom));
}
