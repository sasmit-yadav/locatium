/**
 * Basemap registry.
 *
 * Every entry must render without an API key. CARTO's `basemaps.cartocdn.com` rasters
 * used to qualify, but they now return key-gated tiles stamped "API KEY REQUIRED" when
 * requested from a browser origin, so the vector styles below come from OpenFreeMap
 * (free, keyless, unmetered) — the provider this app was documented against.
 *
 * A spec carries either `styleUrl` (a hosted MapLibre style JSON) or `inlineStyle`
 * (a raster style we assemble here). MapLibre accepts both forms of style input.
 */

function rasterBasemapStyle(tiles, attribution) {
  return {
    version: 8,
    // Raster basemaps carry no fonts of their own; labels drawn by our layers need glyphs.
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
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

const OPENFREEMAP = 'https://tiles.openfreemap.org/styles';

export const BASEMAPS = [
  {
    id: 'dark',
    label: 'Dark',
    thumbnail: 'linear-gradient(145deg,#0B1020,#1A2333)',
    styleUrl: `${OPENFREEMAP}/dark`,
  },
  {
    id: 'light',
    label: 'Light',
    thumbnail: 'linear-gradient(145deg,#F8FAFC,#CBD5E1)',
    styleUrl: `${OPENFREEMAP}/positron`,
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
    styleUrl: `${OPENFREEMAP}/liberty`,
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
  // A URL is handed to MapLibre as-is; inline styles are cloned so a mutation by the
  // map (MapLibre rewrites the object it is given) cannot leak into the next switch.
  return spec.styleUrl ?? structuredClone(spec.inlineStyle);
}
