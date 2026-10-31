import { DATA_LAYERS } from '../config/layers';
import { getLayersForCategory, LAYER_CONFIGS } from '../config/layer-registry';
import { getMapsApiOrigin, getTableTileUrl } from '../config/api';
import { HARYANA_BOUNDS } from '../config/layers';
import { ensureOperationalMapIcons } from './mapIcons';

export const SOURCE_PREFIX = 'operational-src-';
export const LAYER_PREFIX = 'operational-lyr-';

const POLYGON_FILTER = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const LINE_FILTER = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const POINT_FILTER = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]];

function scaleOpacity(base, multiplier) {
  if (typeof base !== 'number') return base;
  return Math.min(1, Math.max(0, base * multiplier));
}

function layerSortKey(cfg) {
  if (cfg.geometryType === 'polygon') {
    const hasFill = (cfg.style?.fillOpacity ?? 0) > 0 && cfg.style?.fillColor;
    return hasFill ? 0 : 1;
  }
  if (cfg.geometryType === 'line') return 2;
  if (cfg.renderType === 'symbol') return 4;
  return 3;
}

export function getVisibleLayerSpecs(visibility) {
  const specs = [];
  for (const category of DATA_LAYERS) {
    const state = visibility[category.id];
    if (!state?.visible) continue;
    const opacity = state.opacity ?? 0.75;
    for (const cfg of getLayersForCategory(category.id)) {
      specs.push({ cfg, opacity });
    }
  }
  return specs.sort((a, b) => layerSortKey(a.cfg) - layerSortKey(b.cfg));
}

export function subLayerIds(tableId) {
  const base = `${LAYER_PREFIX}${tableId}`;
  return [`${base}-fill`, `${base}-line`, `${base}-point`, `${base}-symbol`, `${base}-cluster`, `${base}-cluster-count`];
}

function clusterSourceId(tableId) {
  return `${SOURCE_PREFIX}${tableId}-cluster`;
}

function buildCirclePaint(cfg, opacityMultiplier) {
  const s = cfg.style || {};
  const paint = {
    'circle-color': s.circleColor || '#ff4d4d',
    'circle-radius': s.circleRadius ?? ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 7],
    'circle-opacity': scaleOpacity(s.circleOpacity ?? 0.9, opacityMultiplier),
  };
  if (s.circleStrokeWidth) {
    paint['circle-stroke-width'] = s.circleStrokeWidth;
    paint['circle-stroke-color'] = s.circleStrokeColor || '#ffffff';
  }
  return paint;
}

function ensureVectorSource(map, cfg) {
  const srcId = `${SOURCE_PREFIX}${cfg.id}`;
  if (map.getSource(srcId)) return srcId;
  map.addSource(srcId, {
    type: 'vector',
    tiles: [getTableTileUrl(cfg.id)],
    bounds: HARYANA_BOUNDS,
    minzoom: cfg.minzoom,
    maxzoom: cfg.maxzoom ?? 22,
  });
  return srcId;
}

function ensureClusterSource(map, cfg) {
  const srcId = clusterSourceId(cfg.id);
  if (map.getSource(srcId)) return srcId;
  map.addSource(srcId, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterRadius: 42,
    clusterMaxZoom: (cfg.performance?.clusterBelowZoom ?? 11) - 1,
  });
  return srcId;
}

async function fetchClusterGeoJson(tableId, bounds) {
  const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
  const url = `${getMapsApiOrigin()}/api/features/${tableId}?bbox=${encodeURIComponent(bbox)}&limit=1500`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cluster fetch ${tableId}: ${res.status}`);
  return res.json();
}

export async function refreshClusterSources(map, visibility, zoom) {
  if (!map || map._removed) return;
  const specs = getVisibleLayerSpecs(visibility);

  for (const { cfg } of specs) {
    const clusterBelow = cfg.performance?.clusterBelowZoom;
    if (!clusterBelow || zoom >= clusterBelow) continue;

    const srcId = clusterSourceId(cfg.id);
    if (!map.getSource(srcId)) continue;

    try {
      const fc = await fetchClusterGeoJson(cfg.id, map.getBounds());
      map.getSource(srcId).setData(fc);
    } catch (err) {
      console.warn(`[LOCATIUM] cluster load ${cfg.id}:`, err);
    }
  }
}

function addPolygonLayers(map, cfg, srcId, opacityMultiplier) {
  const s = cfg.style || {};
  const fillId = `${LAYER_PREFIX}${cfg.id}-fill`;
  const lineId = `${LAYER_PREFIX}${cfg.id}-line`;
  const hasFill = (s.fillOpacity ?? 0) > 0 && s.fillColor;

  if (hasFill && !map.getLayer(fillId)) {
    map.addLayer({
      id: fillId,
      type: 'fill',
      source: srcId,
      'source-layer': 'data',
      minzoom: cfg.minzoom,
      maxzoom: cfg.maxzoom ?? 22,
      paint: {
        'fill-color': s.fillColor,
        'fill-opacity': scaleOpacity(s.fillOpacity, opacityMultiplier),
      },
      filter: POLYGON_FILTER,
    });
  }

  if (!map.getLayer(lineId)) {
    map.addLayer({
      id: lineId,
      type: 'line',
      source: srcId,
      'source-layer': 'data',
      minzoom: cfg.minzoom,
      maxzoom: cfg.maxzoom ?? 22,
      paint: {
        'line-color': s.lineColor || '#ff4444',
        'line-width': s.lineWidth ?? 1,
        'line-opacity': scaleOpacity(s.lineOpacity ?? 0.8, opacityMultiplier),
      },
      filter: POLYGON_FILTER,
    });
  }
}

function addLineLayer(map, cfg, srcId, opacityMultiplier) {
  const lineId = `${LAYER_PREFIX}${cfg.id}-line`;
  const s = cfg.style || {};
  if (map.getLayer(lineId)) return;

  map.addLayer({
    id: lineId,
    type: 'line',
    source: srcId,
    'source-layer': 'data',
    minzoom: cfg.minzoom,
    maxzoom: cfg.maxzoom ?? 22,
    paint: {
      'line-color': s.lineColor || '#ffffff',
      'line-width': s.lineWidth ?? 1,
      'line-opacity': scaleOpacity(s.lineOpacity ?? 0.85, opacityMultiplier),
    },
    filter: LINE_FILTER,
  });
}

function addPointLayer(map, cfg, srcId, opacityMultiplier) {
  const pointId = `${LAYER_PREFIX}${cfg.id}-point`;
  if (map.getLayer(pointId)) return;

  map.addLayer({
    id: pointId,
    type: 'circle',
    source: srcId,
    'source-layer': 'data',
    minzoom: cfg.minzoom,
    maxzoom: cfg.maxzoom ?? 22,
    paint: buildCirclePaint(cfg, opacityMultiplier),
    filter: POINT_FILTER,
  });
}

function addSymbolLayer(map, cfg, srcId) {
  const symbolId = `${LAYER_PREFIX}${cfg.id}-symbol`;
  if (map.getLayer(symbolId)) return;
  const s = cfg.style || {};

  map.addLayer({
    id: symbolId,
    type: 'symbol',
    source: srcId,
    'source-layer': 'data',
    minzoom: cfg.minzoom,
    maxzoom: cfg.maxzoom ?? 22,
    layout: {
      'icon-image': s.iconImage || 'airport-icon',
      'icon-size': s.iconSize ?? ['interpolate', ['linear'], ['zoom'], 5, 0.5, 12, 1.2],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    filter: POINT_FILTER,
  });
}

function addClusterLayers(map, cfg, opacityMultiplier) {
  const clusterBelow = cfg.performance?.clusterBelowZoom;
  if (!clusterBelow) return;

  const srcId = ensureClusterSource(map, cfg);
  const clusterId = `${LAYER_PREFIX}${cfg.id}-cluster`;
  const countId = `${LAYER_PREFIX}${cfg.id}-cluster-count`;
  const s = cfg.clusterStyle || cfg.style || {};

  if (!map.getLayer(clusterId)) {
    const paint = {
      'circle-color': s.circleColor || '#1d4ed8',
      'circle-radius':
        s.circleRadius ?? ['step', ['get', 'point_count'], 14, 20, 18, 100, 24],
      'circle-opacity': scaleOpacity(s.circleOpacity ?? 0.85, opacityMultiplier),
      'circle-stroke-width': s.circleStrokeWidth ?? 2,
      'circle-stroke-color': s.circleStrokeColor || '#ffffff',
    };
    map.addLayer({
      id: clusterId,
      type: 'circle',
      source: srcId,
      maxzoom: clusterBelow,
      filter: ['has', 'point_count'],
      paint,
    });
  }

  if (!map.getLayer(countId)) {
    map.addLayer({
      id: countId,
      type: 'symbol',
      source: srcId,
      maxzoom: clusterBelow,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-size': 9,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    });
  }
}

export function addOperationalLayer(map, cfg, opacityMultiplier, zoom) {
  ensureOperationalMapIcons(map);

  const clusterBelow = cfg.performance?.clusterBelowZoom;
  if (clusterBelow && cfg.geometryType === 'point') {
    addClusterLayers(map, cfg, opacityMultiplier);
    const vectorVisible = zoom >= clusterBelow;
    const srcId = vectorVisible ? ensureVectorSource(map, cfg) : null;
    if (vectorVisible && srcId) {
      addPointLayer(map, cfg, srcId, opacityMultiplier);
    }
    return;
  }

  const srcId = ensureVectorSource(map, cfg);

  if (cfg.geometryType === 'polygon') {
    addPolygonLayers(map, cfg, srcId, opacityMultiplier);
  } else if (cfg.geometryType === 'line') {
    addLineLayer(map, cfg, srcId, opacityMultiplier);
  } else if (cfg.renderType === 'symbol') {
    addSymbolLayer(map, cfg, srcId);
  } else if (cfg.geometryType === 'point') {
    addPointLayer(map, cfg, srcId, opacityMultiplier);
  }
}

export function setOperationalLayerVisibility(map, cfg, visible, zoom) {
  const clusterBelow = cfg.performance?.clusterBelowZoom;
  const useCluster = clusterBelow && cfg.geometryType === 'point' && zoom < clusterBelow;
  const aboveMinZoom = zoom + 0.01 >= (cfg.minzoom ?? 0);
  const showBase = visible && aboveMinZoom;

  for (const id of subLayerIds(cfg.id)) {
    if (!map.getLayer(id)) continue;

    if (id.endsWith('-cluster') || id.endsWith('-cluster-count')) {
      map.setLayoutProperty(id, 'visibility', showBase && useCluster ? 'visible' : 'none');
    } else if (id.endsWith('-symbol')) {
      map.setLayoutProperty(id, 'visibility', showBase ? 'visible' : 'none');
    } else if (id.endsWith('-point') && clusterBelow) {
      const show = showBase && !useCluster;
      map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none');
    } else {
      map.setLayoutProperty(id, 'visibility', showBase ? 'visible' : 'none');
    }
  }
}

export function syncOperationalLayers(map, visibility, zoom) {
  const specs = getVisibleLayerSpecs(visibility);
  const activeIds = new Set(specs.map((s) => s.cfg.id));

  for (const cfg of LAYER_CONFIGS) {
    if (!activeIds.has(cfg.id)) {
      setOperationalLayerVisibility(map, cfg, false, zoom);
    }
  }

  for (const { cfg, opacity } of specs) {
    addOperationalLayer(map, cfg, opacity, zoom);
    setOperationalLayerVisibility(map, cfg, true, zoom);
  }
}

export function isOperationalSourceId(sourceId) {
  return typeof sourceId === 'string' && sourceId.startsWith(SOURCE_PREFIX);
}
