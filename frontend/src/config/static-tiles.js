/**
 * Layers served as static PMTiles files instead of from the database.
 *
 * On compact (free) hosting these layers are not stored in PostgreSQL at all — or only as a
 * small summary used for scoring — so the map draws them from pre-built files in
 * /public/tiles (one file per layer, built by backend/scripts/build-static-tiles.sh).
 * Clicking them still shows their details: identify reads the attributes straight from the
 * drawn features (see MapLibreMapView).
 *
 * Set VITE_STATIC_TILES=false to draw every layer from the API instead (full database).
 */
export const STATIC_TILE_TABLES = new Set([
  'assembly_boundary',
  'parliament_boundary',
  'ncr_district',
  'habitation_area',
  'rapid_metro_line',
  'delhi_metro_line',
  'proposed_metro_line',
  'ioc_gas_line',
  'women_line',
  'sec_ug_electric_line',
  'bus_bar',
  'switching_facility',
  'sewerage_line',
  'pri_ug_electric_segment',
  'eht_feeder',
  'sewerage_point',
  'open_point',
  'switch',
  'joint',
  'distribution_transformer',
  'sec_oh_electric_line',
  'pri_oh_electric_line',
]);

export const STATIC_TILES_ENABLED = import.meta.env.VITE_STATIC_TILES !== 'false';

export function isStaticTileLayer(tableId) {
  return STATIC_TILES_ENABLED && STATIC_TILE_TABLES.has(tableId);
}

export function staticTileUrl(tableId) {
  const base = (import.meta.env.VITE_STATIC_TILES_BASE || '/tiles').replace(/\/+$/, '');
  const absolute = /^https?:\/\//i.test(base) ? base : `${window.location.origin}${base}`;
  return `pmtiles://${absolute}/${tableId}.pmtiles`;
}
