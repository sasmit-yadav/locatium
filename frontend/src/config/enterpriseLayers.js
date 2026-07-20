import { DATA_LAYERS } from './layers';
import { getLayersForCategory } from './layer-registry';
import { colors } from '../design-system/tokens';

const [c0, c1, c2, c3, c4, c5, c6, c7] = colors.dataCategorical;

const CATEGORY_META = {
  administrative: { name: 'Administrative', color: c0, group: 'Administrative' },
  transportation: { name: 'Transportation', color: c2, group: 'Transportation' },
  utilities: { name: 'Utilities', color: c5, group: 'Utilities' },
  environmental: { name: 'Environmental', color: c1, group: 'Environmental' },
  'social-infrastructure': { name: 'Social Infrastructure', color: c4, group: 'Social Infrastructure' },
  'industrial-investment': { name: 'Industrial', color: c6, group: 'Industrial' },
  cadastral: { name: 'Land / Cadastral', color: c7, group: 'Land/Cadastral' },
};

export const ENTERPRISE_LAYER_CATEGORIES = DATA_LAYERS.map((layer) => {
  const meta = CATEGORY_META[layer.id] || { name: layer.label, color: colors.dataCategorical[0], group: layer.label };
  const tables = getLayersForCategory(layer.id);
  return {
    id: layer.id,
    name: meta.name,
    label: layer.label,
    category: meta.group,
    geometryType: tables[0]?.geometryType || 'mixed',
    color: meta.color,
    minzoom: layer.minZoom ?? 0,
    maxzoom: Math.max(...tables.map((t) => t.maxzoom || 22), 22),
    defaultOpacity: layer.id === 'administrative' ? 0.62 : 0.58,
    sourceType: 'vector-tile-category',
    interactive: true,
    heavy: tables.some((t) => t.heavy),
    tableCount: tables.length,
    tables,
    legend: layer.legend || [],
  };
});

export const LAYER_FOCUS_BY_ID = {
  administrative: { lat: 29.05, lng: 76.25, zoom: 8.2 },
  transportation: { lat: 28.65, lng: 76.95, zoom: 10.2 },
  utilities: { lat: 28.46, lng: 77.02, zoom: 14.2 },
  environmental: { lat: 29.05, lng: 76.45, zoom: 9.4 },
  'social-infrastructure': { lat: 28.46, lng: 77.02, zoom: 12.2 },
  'industrial-investment': { lat: 28.83, lng: 76.94, zoom: 11.4 },
  cadastral: { lat: 28.46, lng: 77.02, zoom: 14.6 },
};

export function getLayerFocus(layerId) {
  const layer = ENTERPRISE_LAYER_CATEGORIES.find((item) => item.id === layerId);
  const focus = LAYER_FOCUS_BY_ID[layerId] || { lat: 29.05, lng: 76.25, zoom: Math.max(layer?.minzoom || 8, 8) };
  return {
    ...focus,
    zoom: Math.max(focus.zoom, layer?.minzoom || 0),
  };
}

export function buildDefaultVisibility() {
  return Object.fromEntries(
    ENTERPRISE_LAYER_CATEGORIES.map((layer) => [
      layer.id,
      {
        visible: layer.id === 'administrative' || layer.id === 'transportation',
        opacity: layer.defaultOpacity,
      },
    ])
  );
}
