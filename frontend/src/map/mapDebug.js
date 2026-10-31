import { LAYER_CONFIGS } from '../config/layer-registry';
import { DATA_LAYERS } from '../config/layers';

const SOURCE_PREFIX = 'operational-src-';

/**
 * Inspect operational map sources/layers and log warnings for common issues.
 * Only checks layers for currently visible categories (avoids false "source missing").
 * @returns {object} debug snapshot
 */
export function inspectOperationalMap(map, visibility = null) {
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

  const visibleCategoryIds = new Set(
    DATA_LAYERS.filter((cat) => visibility?.[cat.id]?.visible).map((cat) => cat.id)
  );

  const configsToCheck =
    visibleCategoryIds.size > 0
      ? LAYER_CONFIGS.filter((cfg) => visibleCategoryIds.has(cfg.category))
      : [];

  // Also include any operational layers already present on the style (leftovers).
  const presentIds = new Set(configsToCheck.map((c) => c.id));
  for (const cfg of LAYER_CONFIGS) {
    if (presentIds.has(cfg.id)) continue;
    const hasLayer = ['fill', 'line', 'point', 'symbol'].some((suffix) =>
      map.getLayer(`operational-lyr-${cfg.id}-${suffix}`)
    );
    if (hasLayer) configsToCheck.push(cfg);
  }

  for (const cfg of configsToCheck) {
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

    const categoryOn = visibleCategoryIds.has(cfg.category);
    const clusterBelow = cfg.performance?.clusterBelowZoom;
    const deferVectorForCluster =
      clusterBelow && cfg.geometryType === 'point' && zoom < clusterBelow;

    if (categoryOn && !src && zoom >= cfg.minzoom && !deferVectorForCluster) {
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
  } catch {
    /* queryRenderedFeatures can fail during style churn */
  }

  if (report.warnings.length > 0 && import.meta.env.DEV) {
    for (const w of report.warnings) console.warn(w);
  }

  return report;
}

export function attachMapDebugHandlers(map, onReport, getVisibility) {
  if (!map || !import.meta.env.DEV) return () => {};

  let tileLoads = 0;
  const onData = (e) => {
    if (typeof e?.sourceId === 'string' && e.sourceId.startsWith(SOURCE_PREFIX)) {
      tileLoads += 1;
    }
  };
  const onIdle = () => {
    const visibility = typeof getVisibility === 'function' ? getVisibility() : null;
    const report = inspectOperationalMap(map, visibility);
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
