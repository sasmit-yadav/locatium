import { LAYER_CONFIGS } from '../config/layer-registry';

const SOURCE_PREFIX = 'operational-src-';

/**
 * Inspect operational map sources/layers and log warnings for common issues.
 * @returns {object} debug snapshot
 */
export function inspectOperationalMap(map) {
  if (!map || map._removed) return { ok: false, reason: 'map_removed' };

  const zoom = map.getZoom();
  const report = {
    zoom: Number(zoom.toFixed(2)),
    sources: [],
    layers: [],
    warnings: [],
    tileLoads: 0,
    visibleFeatures: 0,
  };

  for (const cfg of LAYER_CONFIGS) {
    const srcId = `${SOURCE_PREFIX}${cfg.id}`;
    const src = map.getSource(srcId);
    const pointLayer = `operational-lyr-${cfg.id}-point`;
    const lineLayer = `operational-lyr-${cfg.id}-line`;
    const fillLayer = `operational-lyr-${cfg.id}-fill`;
    const symbolLayer = `operational-lyr-${cfg.id}-symbol`;

    const entry = {
      id: cfg.id,
      geometryType: cfg.geometryType,
      minzoom: cfg.minzoom,
      sourceExists: Boolean(src),
      layers: [fillLayer, lineLayer, pointLayer, symbolLayer].filter((id) => map.getLayer(id)),
      belowMinZoom: zoom + 0.01 < cfg.minzoom,
    };
    report.sources.push(entry);

    if (!src && zoom >= cfg.minzoom) {
      report.warnings.push(`[LOCATIUM] source missing: ${srcId} (expected at z${cfg.minzoom}+)`);
    }
    if (entry.belowMinZoom && entry.layers.length > 0) {
      const vis = entry.layers.some((id) => map.getLayoutProperty(id, 'visibility') !== 'none');
      if (vis) {
        report.warnings.push(`[LOCATIUM] ${cfg.id} visible below minzoom ${cfg.minzoom}`);
      }
    }
  }

  const styleLayers = map.getStyle()?.layers || [];
  for (const layer of styleLayers) {
    if (layer.id.startsWith('operational-lyr-')) {
      report.layers.push({ id: layer.id, type: layer.type });
    }
  }

  try {
    const rendered = map.queryRenderedFeatures({ layers: report.layers.map((l) => l.id) });
    report.visibleFeatures = rendered.length;
    if (zoom >= 8 && rendered.length === 0) {
      report.warnings.push('[LOCATIUM] no rendered operational features in viewport (check zoom/category toggles)');
    }
  } catch {
    /* queryRenderedFeatures can fail during style churn */
  }

  if (report.warnings.length > 0 && import.meta.env.DEV) {
    for (const w of report.warnings) console.warn(w);
  }

  return report;
}

export function attachMapDebugHandlers(map, onReport) {
  if (!map || !import.meta.env.DEV) return () => {};

  let tileLoads = 0;
  const onData = (e) => {
    if (typeof e?.sourceId === 'string' && e.sourceId.startsWith(SOURCE_PREFIX)) {
      tileLoads += 1;
    }
  };
  const onIdle = () => {
    const report = inspectOperationalMap(map);
    report.tileLoads = tileLoads;
    if (onReport) onReport(report);
  };

  map.on('sourcedata', onData);
  map.on('idle', onIdle);

  return () => {
    map.off('sourcedata', onData);
    map.off('idle', onIdle);
  };
}
