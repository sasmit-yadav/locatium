import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DATA_LAYERS, DEFAULT_ZOOM, INITIAL_MAP_CENTER } from '../config/layers';
import { getBasemapStyleInput } from '../config/basemaps';
import {
  identifyStaticLayers,
  isOperationalSourceId,
  refreshClusterSources,
  syncOperationalLayers,
} from '../map/operationalLayers';
import { attachMapDebugHandlers } from '../map/mapDebug';
import { colors } from '../design-system/tokens';

const HIGHLIGHT_SOURCE = 'selection-highlight';
const HIGHLIGHT_FILL = 'selection-highlight-fill';
const HIGHLIGHT_RING = 'selection-highlight-ring';
const INVESTOR_OPP_SOURCE = 'investor-opportunity-highlights';
const INVESTOR_ZONE_FILL = 'investor-zone-fill';
const INVESTOR_ZONE_LINE = 'investor-zone-outline';
const INVESTOR_ZONE_MARKER = 'investor-zone-marker';
const INVESTOR_ZONE_LABEL = 'investor-zone-label';
const GAP_SOURCE = 'facility-gap-overlay';
const GAP_LAYER = 'facility-gap-circles';

const SCORE_COLOR_EXPR = [
  'interpolate',
  ['linear'],
  ['get', 'score'],
  0,
  colors.dataSequential.low,
  55,
  colors.dataSequential.mid,
  75,
  colors.dataSequential.high,
];

/** Zone polygons + centroid markers/labels so users read “zones”, not dots. */
function toInvestorZoneGeoJson(features = []) {
  const out = [];
  for (const feature of features) {
    const props = feature.properties || {};
    const geometry = feature.geometry;
    const lng =
      props.centerLng ??
      (geometry?.type === 'Point' ? geometry.coordinates?.[0] : null);
    const lat =
      props.centerLat ??
      (geometry?.type === 'Point' ? geometry.coordinates?.[1] : null);
    const label = props.label || `#${props.rank ?? '?'} · ${props.score ?? '—'}`;
    const shared = { ...props, label };

    if (geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon') {
      out.push({
        type: 'Feature',
        geometry,
        properties: { ...shared, featureRole: 'boundary' },
      });
    }

    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      out.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { ...shared, featureRole: 'marker' },
      });
    }
  }
  return { type: 'FeatureCollection', features: out };
}

export function MapLibreMapView({
  basemapId,
  visibility,
  onIdentifyContext,
  onViewChange,
  onCursorChange,
  onTileStatusChange,
  goToRequest,
  onMapReady,
  highlightFeature = null,
  investorHighlights = null,
  analysisOverlay = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const styleReadyRef = useRef(false);
  const visibilityRef = useRef(visibility);
  const onIdentifyRef = useRef(onIdentifyContext);
  const onViewChangeRef = useRef(onViewChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const onTileStatusRef = useRef(onTileStatusChange);
  const onMapReadyRef = useRef(onMapReady);
  const basemapIdRef = useRef(basemapId);
  const tileLoadingRef = useRef(false);
  const syncTimerRef = useRef(null);
  const clusterTimerRef = useRef(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const [debugInfo, setDebugInfo] = useState(null);
  /** Bumps each time a style finishes loading, so overlays re-attach after a basemap switch. */
  const [styleRevision, setStyleRevision] = useState(0);

  useEffect(() => {
    visibilityRef.current = visibility;
  }, [visibility]);

  useEffect(() => {
    onIdentifyRef.current = onIdentifyContext;
  }, [onIdentifyContext]);

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);

  useEffect(() => {
    onTileStatusRef.current = onTileStatusChange;
  }, [onTileStatusChange]);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  const emitTileStatus = useCallback((patch) => {
    const cb = onTileStatusRef.current;
    if (cb) cb(patch);
  }, []);

  const runSync = useCallback((map) => {
    // styleReadyRef is set on 'load' / 'style.load'. Don't also require isStyleLoaded():
    // after a basemap switch it stays false until every basemap tile arrives, which
    // silently skipped re-adding the data layers.
    if (!map || map._removed || !styleReadyRef.current) return;
    syncOperationalLayers(map, visibilityRef.current, zoomRef.current);
    refreshClusterSources(map, visibilityRef.current, zoomRef.current);
  }, []);

  const debouncedSync = useCallback((map) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => runSync(map), 80);
  }, [runSync]);

  const debouncedClusterRefresh = useCallback((map) => {
    if (clusterTimerRef.current) clearTimeout(clusterTimerRef.current);
    clusterTimerRef.current = setTimeout(() => {
      refreshClusterSources(map, visibilityRef.current, zoomRef.current);
    }, 200);
  }, []);

  const onStyleReady = useCallback(
    (map) => {
      styleReadyRef.current = true;
      requestAnimationFrame(() => {
        if (map._removed) return;
        map.resize();
        runSync(map);
        setStyleRevision((v) => v + 1);
      });
    },
    [runSync]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let disposed = false;
    let detachDebug = () => {};
    styleReadyRef.current = false;

    const map = new maplibregl.Map({
      container,
      style: getBasemapStyleInput(basemapIdRef.current),
      center: [INITIAL_MAP_CENTER[1], INITIAL_MAP_CENTER[0]],
      zoom: DEFAULT_ZOOM,
      attributionControl: true,
      fadeDuration: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    zoomRef.current = DEFAULT_ZOOM;

    const emitViewChange = () => {
      const cb = onViewChangeRef.current;
      if (!cb || map._removed) return;
      const c = map.getCenter();
      const z = map.getZoom();
      zoomRef.current = z;
      cb({ lng: c.lng, lat: c.lat, zoom: z });
    };

    map.once('load', () => {
      if (disposed) return;
      onStyleReady(map);
      emitViewChange();
      detachDebug = attachMapDebugHandlers(
        map,
        import.meta.env.DEV ? setDebugInfo : null,
        () => visibilityRef.current
      );
      onMapReadyRef.current?.(map);
    });

    map.on('dataloading', (e) => {
      if (!isOperationalSourceId(e?.sourceId)) return;
      if (!tileLoadingRef.current) {
        tileLoadingRef.current = true;
        emitTileStatus({ loading: true, error: null });
      }
    });

    map.on('idle', () => {
      if (tileLoadingRef.current) {
        tileLoadingRef.current = false;
        emitTileStatus({ loading: false });
      }
    });

    map.on('error', (e) => {
      console.error('[LOCATIUM] map error:', e?.error?.message || e?.message || e?.error || e);
      const sourceId = e?.sourceId || e?.error?.sourceId;
      if (!sourceId || sourceId === 'basemap') {
        emitTileStatus({
          loading: false,
          error: 'Background map tiles could not load. Check your internet connection or try another basemap.',
        });
        return;
      }
      if (isOperationalSourceId(sourceId)) {
        tileLoadingRef.current = false;
        emitTileStatus({
          loading: false,
          error: 'Some map layers could not load. Try refreshing or check your connection.',
        });
      }
    });

    map.on('moveend', () => {
      emitViewChange();
      debouncedSync(map);
      debouncedClusterRefresh(map);
    });

    map.on('zoomend', () => {
      emitViewChange();
      runSync(map);
      debouncedClusterRefresh(map);
    });

    map.on('click', (e) => {
      const cb = onIdentifyRef.current;
      if (!cb) return;

      const visibleLayerIds = DATA_LAYERS.filter((cfg) => {
        const v = visibilityRef.current[cfg.id];
        return v?.visible && (v.opacity ?? 1) > 0;
      }).map((c) => c.id);

      if (visibleLayerIds.length === 0) {
        cb({ kind: 'skip', reason: 'no_visible_layers' });
        return;
      }

      const b = map.getBounds();
      const el = map.getContainer();
      const staticResult = identifyStaticLayers(map, e.point, visibleLayerIds);
      cb({
        kind: 'identify',
        staticLayers: staticResult.layers,
        staticTables: staticResult.tables,
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        extent4326: {
          xmin: b.getWest(),
          ymin: b.getSouth(),
          xmax: b.getEast(),
          ymax: b.getNorth(),
        },
        width: el.clientWidth,
        height: el.clientHeight,
        dpi: 96,
        visibleLayerIds,
      });
    });

    map.on('mousemove', (e) => {
      onCursorChangeRef.current?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });

    const resizeObserver = new ResizeObserver(() => {
      if (!disposed && !map._removed) map.resize();
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      styleReadyRef.current = false;
      detachDebug();
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      if (clusterTimerRef.current) clearTimeout(clusterTimerRef.current);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  // Mount map once — callbacks are read from refs so parent re-renders do not destroy WebGL.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || map._removed) return;
    runSync(map);
    refreshClusterSources(map, visibility, zoomRef.current);
  }, [runSync, visibility]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || map._removed) return;
    if (basemapId === basemapIdRef.current) return;

    styleReadyRef.current = false;
    const nextBasemap = basemapId;

    const onStyleApplied = () => {
      if (map._removed) return;
      basemapIdRef.current = nextBasemap;
      onStyleReady(map);
    };

    // Listen before swapping, and always wait for the new style: right after setStyle()
    // isStyleLoaded() can still report the *old* style, and layers re-added then are
    // wiped when the new style lands — which made every basemap switch drop all data layers.
    map.once('style.load', onStyleApplied);
    map.setStyle(getBasemapStyleInput(nextBasemap), { diff: false });
    return () => {
      map.off('style.load', onStyleApplied);
    };
  }, [basemapId, onStyleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || map._removed || !goToRequest) return;
    const { lng, lat, zoom } = goToRequest;
    if (typeof lng !== 'number' || typeof lat !== 'number' || Number.isNaN(lng) || Number.isNaN(lat)) {
      return;
    }
    map.flyTo({
      center: [lng, lat],
      zoom: typeof zoom === 'number' && !Number.isNaN(zoom) ? zoom : 10,
      essential: true,
    });
  }, [goToRequest]);

  // Static 2px accent ring on the selected/highlighted feature center (ui_enhance §5).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || map._removed || !styleReadyRef.current) return undefined;

    const lng =
      highlightFeature?.center?.lng ??
      (typeof highlightFeature?.lng === 'number' ? highlightFeature.lng : null);
    const lat =
      highlightFeature?.center?.lat ??
      (typeof highlightFeature?.lat === 'number' ? highlightFeature.lat : null);

    const clearHighlight = () => {
      if (map.getLayer(HIGHLIGHT_RING)) map.removeLayer(HIGHLIGHT_RING);
      if (map.getLayer(HIGHLIGHT_FILL)) map.removeLayer(HIGHLIGHT_FILL);
      if (map.getSource(HIGHLIGHT_SOURCE)) map.removeSource(HIGHLIGHT_SOURCE);
    };

    if (typeof lng !== 'number' || typeof lat !== 'number' || Number.isNaN(lng) || Number.isNaN(lat)) {
      clearHighlight();
      return undefined;
    }

    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {},
        },
      ],
    };

    if (!map.getSource(HIGHLIGHT_SOURCE)) {
      map.addSource(HIGHLIGHT_SOURCE, { type: 'geojson', data: geojson });
    } else {
      map.getSource(HIGHLIGHT_SOURCE).setData(geojson);
    }

    if (!map.getLayer(HIGHLIGHT_FILL)) {
      map.addLayer({
        id: HIGHLIGHT_FILL,
        type: 'circle',
        source: HIGHLIGHT_SOURCE,
        paint: {
          'circle-radius': 6,
          'circle-color': colors.accent.default,
          'circle-opacity': 0.9,
        },
      });
    }

    if (!map.getLayer(HIGHLIGHT_RING)) {
      map.addLayer({
        id: HIGHLIGHT_RING,
        type: 'circle',
        source: HIGHLIGHT_SOURCE,
        paint: {
          'circle-radius': 10,
          'circle-color': 'transparent',
          'circle-stroke-width': 2,
          'circle-stroke-color': colors.accent.default,
          'circle-opacity': 1,
        },
      });
    }

    return undefined;
  }, [highlightFeature, styleRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || map._removed || !styleReadyRef.current) return undefined;

    const layerIds = [INVESTOR_ZONE_LABEL, INVESTOR_ZONE_MARKER, INVESTOR_ZONE_LINE, INVESTOR_ZONE_FILL];
    const clearInvestorLayers = () => {
      for (const id of layerIds) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(INVESTOR_OPP_SOURCE)) map.removeSource(INVESTOR_OPP_SOURCE);
    };

    const features = investorHighlights?.features || [];
    if (!features.length) {
      clearInvestorLayers();
      return undefined;
    }

    const geojson = toInvestorZoneGeoJson(features);
    if (!map.getSource(INVESTOR_OPP_SOURCE)) {
      map.addSource(INVESTOR_OPP_SOURCE, { type: 'geojson', data: geojson });
    } else {
      map.getSource(INVESTOR_OPP_SOURCE).setData(geojson);
    }

    if (!map.getLayer(INVESTOR_ZONE_FILL)) {
      map.addLayer({
        id: INVESTOR_ZONE_FILL,
        type: 'fill',
        source: INVESTOR_OPP_SOURCE,
        filter: ['==', ['get', 'featureRole'], 'boundary'],
        paint: {
          'fill-color': SCORE_COLOR_EXPR,
          'fill-opacity': 0.28,
        },
      });
    }

    if (!map.getLayer(INVESTOR_ZONE_LINE)) {
      map.addLayer({
        id: INVESTOR_ZONE_LINE,
        type: 'line',
        source: INVESTOR_OPP_SOURCE,
        filter: ['==', ['get', 'featureRole'], 'boundary'],
        paint: {
          'line-color': colors.accent.default,
          'line-width': ['interpolate', ['linear'], ['get', 'rank'], 1, 3.5, 5, 2],
          'line-opacity': 0.95,
        },
      });
    }

    if (!map.getLayer(INVESTOR_ZONE_MARKER)) {
      map.addLayer({
        id: INVESTOR_ZONE_MARKER,
        type: 'circle',
        source: INVESTOR_OPP_SOURCE,
        filter: ['==', ['get', 'featureRole'], 'marker'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'rank'], 1, 11, 5, 7],
          'circle-color': SCORE_COLOR_EXPR,
          'circle-opacity': 0.95,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
        },
      });
    }

    if (!map.getLayer(INVESTOR_ZONE_LABEL)) {
      map.addLayer({
        id: INVESTOR_ZONE_LABEL,
        type: 'symbol',
        source: INVESTOR_OPP_SOURCE,
        filter: ['==', ['get', 'featureRole'], 'marker'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['Noto Sans Bold'],
          'text-offset': [0, 1.35],
          'text-anchor': 'top',
          'text-allow-overlap': true,
          'text-max-width': 14,
        },
        paint: {
          'text-color': colors.text.primary,
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.6,
        },
      });
    }

    return undefined;
  }, [investorHighlights, styleRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || map._removed || !styleReadyRef.current) return undefined;

    const clearGap = () => {
      if (map.getLayer(GAP_LAYER)) map.removeLayer(GAP_LAYER);
      if (map.getSource(GAP_SOURCE)) map.removeSource(GAP_SOURCE);
    };

    const features = analysisOverlay?.features || [];
    if (!features.length) {
      clearGap();
      return undefined;
    }

    const geojson = { type: 'FeatureCollection', features };
    if (!map.getSource(GAP_SOURCE)) {
      map.addSource(GAP_SOURCE, { type: 'geojson', data: geojson });
    } else {
      map.getSource(GAP_SOURCE).setData(geojson);
    }

    if (!map.getLayer(GAP_LAYER)) {
      map.addLayer({
        id: GAP_LAYER,
        type: 'circle',
        source: GAP_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'gapScore'], 0, 4, 100, 11],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'gapScore'],
            0,
            colors.semantic.success,
            45,
            colors.semantic.warning,
            80,
            colors.semantic.danger,
          ],
          'circle-opacity': 0.78,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
        },
      });
    }

    return undefined;
  }, [analysisOverlay, styleRevision]);

  const highlightCount = investorHighlights?.features?.length || 0;
  const gapCount = analysisOverlay?.features?.length || 0;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="maplibre-map-container h-full w-full" aria-label="Map" />
      {highlightCount > 0 ? (
        <div className="pointer-events-none absolute bottom-14 left-3 z-[1050] max-w-[240px] rounded-lg border border-ds-border bg-ds-surface-raised/95 p-3 shadow-ds-sm backdrop-blur-sm">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ds-accent">Top investment zones</div>
          <p className="mt-1 text-[11px] leading-4 text-ds-text-secondary">
            Shaded boundaries = ranked zones from the Investor list. Color = opportunity score. Click a row in the list to fly here.
          </p>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-ds-text-tertiary">
            <span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: colors.dataSequential.low }} />
            Low
            <span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: colors.dataSequential.mid }} />
            Mid
            <span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: colors.dataSequential.high }} />
            High
          </div>
          <div className="mt-1 text-[10px] font-semibold text-ds-text-secondary">
            Showing {highlightCount} top zone{highlightCount === 1 ? '' : 's'}
          </div>
        </div>
      ) : null}
      {gapCount > 0 ? (
        <div className="pointer-events-none absolute bottom-14 right-3 z-[1050] max-w-[230px] rounded-lg border border-ds-border bg-ds-surface-raised/95 p-3 shadow-ds-sm backdrop-blur-sm">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ds-accent">Facility gap overlay</div>
          <p className="mt-1 text-[11px] leading-4 text-ds-text-secondary">
            Colour = inverse hospital + school density within 5 km of HSIIDC estates. Red is more underserved.
          </p>
        </div>
      ) : null}
      {import.meta.env.DEV && debugInfo ? (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[1050] rounded-lg border border-white/10 bg-black/75 px-2 py-1 font-mono text-[10px] text-white/70">
          z{debugInfo.zoom} · layers {debugInfo.layers?.length ?? 0} · features {debugInfo.visibleFeatures ?? 0}
          {debugInfo.warnings?.length ? ` · warn ${debugInfo.warnings.length}` : ''}
        </div>
      ) : null}
    </div>
  );
}
