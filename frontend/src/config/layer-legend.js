/**
 * Complete symbology reference — one entry per PostGIS table (all map layers).
 */
import { LAYER_CONFIGS } from './layer-registry';

/** Human-readable names for every table layer */
export const TABLE_LABELS = {
  state_boundary: 'State boundary',
  district_boundary: 'District boundary',
  tehsil_boundary: 'Sub-division / tehsil',
  village_boundary: 'Village boundary (z11+)',
  assembly_boundary: 'Assembly constituency',
  parliament_boundary: 'Parliament constituency',
  municipal_boundary: 'Municipal boundary',
  ncr_district: 'NCR district overlay',
  hsvp_plots: 'HSVP plot / khasra parcel',
  licensed_colony: 'Licensed colony',
  controlled_area: 'Controlled area',
  development_plan: 'Development plan area',
  habitation_area: 'Habitation area',
  roads_line: 'Road centreline (z8+)',
  rail_network: 'Railway line',
  rapid_metro_line: 'Rapid metro corridor',
  delhi_metro_line: 'Delhi metro corridor',
  proposed_metro_line: 'Proposed metro corridor',
  canal: 'Canal',
  airports: 'Airport',
  bus_stops: 'Bus stop',
  rapid_metro_station: 'Rapid metro station',
  delhi_metro_station: 'Delhi metro station',
  proposed_metro_station: 'Proposed metro station',
  hospitals: 'Hospital / health facility',
  govt_school: 'Government school',
  iti: 'ITI / vocational institute',
  haryana_police_public_schools_point: 'Haryana police public school',
  pm_shri_and_sanskriti_school: 'PM SHRI / Sanskriti school',
  jails_point: 'Jail',
  water_network: 'Water supply network',
  sewerage_line: 'Sewerage line',
  pri_oh_electric_line: 'Primary overhead electric',
  sec_oh_electric_line: 'Secondary overhead electric',
  pri_ug_electric_segment: 'Primary underground electric',
  sec_ug_electric_line: 'Secondary underground electric',
  hvpnl_line: 'HVPNL transmission line',
  conduit_system: 'Conduit system',
  eht_feeder: 'EHT feeder',
  ioc_gas_line: 'IOC gas pipeline',
  women_line: 'Women utility line',
  sewerage_point: 'Sewerage asset (point)',
  electric_station: 'Electric station',
  bus_bar: 'Bus bar',
  distribution_transformer: 'Distribution transformer',
  hv_transformer: 'HV transformer',
  generator: 'Generator',
  switch: 'Switch',
  switching_facility: 'Switching facility',
  open_point: 'Open point (utility)',
  joint: 'Utility joint',
  mobile_towers: 'Mobile tower',
  wetlands: 'Wetland',
  forest_area: 'Forest / protected area',
  low_lying_area: 'Low-lying / flood-prone area',
  lu_lc: 'Land use / land cover',
  ponds: 'Pond / water body',
  haryana_rivers: 'River / drainage line',
  hsiidc_boundary: 'HSIIDC industrial zone',
  karnal_land_bank: 'Karnal land bank',
};

function legendColor(cfg) {
  const s = cfg.style || {};
  if (s.lineColor && typeof s.lineColor === 'string') return s.lineColor;
  if (s.fillColor && typeof s.fillColor === 'string') return s.fillColor;
  if (s.circleColor && typeof s.circleColor === 'string') return s.circleColor;
  if (cfg.id === 'bus_stops') return '#1d4ed8';
  if (cfg.renderType === 'symbol') return '#0ea5e9';
  return '#888888';
}

function legendShape(cfg) {
  if (cfg.id === 'bus_stops') return 'bus';
  if (cfg.renderType === 'symbol') return 'icon';
  if (cfg.geometryType === 'point') return 'point';
  if (cfg.geometryType === 'line') return 'line';
  const s = cfg.style || {};
  if ((s.fillOpacity ?? 0) > 0.05 && s.fillColor) return 'fill';
  if (cfg.id === 'tehsil_boundary') return 'dash';
  return 'line';
}

/** @returns {Array<{ tableId: string, category: string, label: string, color: string, shape: string, minzoom: number }>} */
export function buildAllLegendEntries() {
  return LAYER_CONFIGS.map((cfg) => ({
    tableId: cfg.id,
    category: cfg.category,
    label: TABLE_LABELS[cfg.id] || cfg.id.replace(/_/g, ' '),
    color: legendColor(cfg),
    shape: legendShape(cfg),
    minzoom: cfg.minzoom,
  }));
}

/** Legend rows for one UI category (when that category is toggled on). */
export function getCategoryLegendEntries(categoryId) {
  return buildAllLegendEntries().filter((e) => e.category === categoryId);
}

/** Flat map tableId → label (identify panel, tooltips). */
export const TABLE_LABEL_BY_ID = Object.fromEntries(
  buildAllLegendEntries().map((e) => [e.tableId, e.label])
);
