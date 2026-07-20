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
    id: 'dark',
    label: 'Dark',
    thumbnail: 'linear-gradient(145deg,#0B1020,#1A2333)',
    inlineStyle: rasterBasemapStyle([`${CARTO}/dark_all/{z}/{x}/{y}.png`], 'OpenStreetMap contributors, CARTO'),
  },
  {
    id: 'light',
    label: 'Light',
    thumbnail: 'linear-gradient(145deg,#F8FAFC,#CBD5E1)',
    inlineStyle: rasterBasemapStyle([`${CARTO}/light_all/{z}/{x}/{y}.png`], 'OpenStreetMap contributors, CARTO'),
  },
  {
    id: 'satellite',
    label: 'Satellite',
    thumbnail: 'linear-gradient(145deg,#203019,#111827)',
    inlineStyle: rasterBasemapStyle(
      ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      'Tiles Esri'
    ),
  },
  {
    id: 'terrain',
    label: 'Terrain',
    thumbnail: 'linear-gradient(145deg,#365314,#0f172a)',
    inlineStyle: rasterBasemapStyle(['https://tile.opentopomap.org/{z}/{x}/{y}.png'], 'OpenTopoMap, OpenStreetMap contributors'),
  },
  {
    id: 'streets',
    label: 'Streets',
    thumbnail: 'linear-gradient(145deg,#f5f0e6,#d4cbb8)',
    inlineStyle: rasterBasemapStyle([`${CARTO}/voyager/{z}/{x}/{y}.png`], 'OpenStreetMap contributors, CARTO'),
  },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    thumbnail: 'linear-gradient(145deg,#f2efe8,#c5dcc5)',
    inlineStyle: rasterBasemapStyle(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], 'OpenStreetMap contributors'),
  },
];

export const DEFAULT_BASEMAP_ID = 'light';

const BASEMAP_ALIASES = {
  liberty: 'streets',
  bright: 'light',
  positron: 'light',
};

export function getBasemapSpec(id) {
  const resolved = BASEMAP_ALIASES[id] || id;
  return BASEMAPS.find((b) => b.id === resolved) ?? BASEMAPS[0];
}

export function getBasemapStyleInput(id) {
  const spec = getBasemapSpec(id);
  return structuredClone(spec.inlineStyle);
}
