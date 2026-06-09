/**
 * Basemap styles for MapLibre — raster tiles (Carto CDN, reliable in browsers).
 * @see https://github.com/CartoDB/basemap-styles
 */

function rasterBasemapStyle(tiles, attribution) {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles,
        tileSize: 256,
        maxzoom: 19,
        attribution,
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  };
}

const CARTO = 'https://basemaps.cartocdn.com/rastertiles';

export const BASEMAPS = [
  {
    id: 'streets',
    label: 'Streets',
    thumbnail: 'linear-gradient(145deg,#f5f0e6,#d4cbb8)',
    inlineStyle: rasterBasemapStyle(
      [`${CARTO}/voyager/{z}/{x}/{y}.png`],
      '© OpenStreetMap © CARTO'
    ),
  },
  {
    id: 'light',
    label: 'Light',
    thumbnail: 'linear-gradient(145deg,#ececec,#c8c8c8)',
    inlineStyle: rasterBasemapStyle(
      [`${CARTO}/light_all/{z}/{x}/{y}.png`],
      '© OpenStreetMap © CARTO'
    ),
  },
  {
    id: 'dark',
    label: 'Dark',
    thumbnail: 'linear-gradient(145deg,#3d3d3d,#1a1a1a)',
    inlineStyle: rasterBasemapStyle(
      [`${CARTO}/dark_all/{z}/{x}/{y}.png`],
      '© OpenStreetMap © CARTO'
    ),
  },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    thumbnail: 'linear-gradient(145deg,#f2efe8,#c5dcc5)',
    inlineStyle: rasterBasemapStyle(
      ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      '© OpenStreetMap contributors'
    ),
  },
];

/** Reliable default — Carto Voyager (not pure black if OSM blocks). */
export const DEFAULT_BASEMAP_ID = 'streets';

/** Legacy basemap ids from earlier builds */
const BASEMAP_ALIASES = {
  liberty: 'streets',
  bright: 'light',
  positron: 'light',
};

/** @param {string} id */
export function getBasemapSpec(id) {
  const resolved = BASEMAP_ALIASES[id] || id;
  return BASEMAPS.find((b) => b.id === resolved) ?? BASEMAPS[0];
}

/** Fresh style object for `map.setStyle()` (avoid mutated refs). */
export function getBasemapStyleInput(id) {
  const spec = getBasemapSpec(id);
  return structuredClone(spec.inlineStyle);
}
