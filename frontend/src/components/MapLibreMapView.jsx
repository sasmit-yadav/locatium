import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DATA_LAYERS, DEFAULT_ZOOM, INITIAL_MAP_CENTER } from '../config/layers';
import { getBasemapStyleInput } from '../config/basemaps';
import {
  isOperationalSourceId,
  refreshClusterSources,
  syncOperationalLayers,
} from '../map/operationalLayers';
import { attachMapDebugHandlers } from '../map/mapDebug';
import { colors } from '../design-system/tokens';

const HIGHLIGHT_SOURCE = 'selection-highlight';
const HIGHLIGHT_FILL = 'selection-highlight-fill';
const HIGHLIGHT_RING = 'selection-highlight-ring';

export function MapLibreMapView({
  basemapId,
  visibility,
  onIdentifyContext,
  onViewChange,
  onTileStatusChange,
  goToRequest,
  onMapReady,
  highlightFeature = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const styleReadyRef = useRef(false);
  const visibilityRef = useRef(visibility);
  const onIdentifyRef = useRef(onIdentifyContext);
  const onViewChangeRef = useRef(onViewChange);
  const onTileStatusRef = useRef(onTileStatusChange);
  const onMapReadyRef = useRef(onMapReady);
  const basemapIdRef = useRef(basemapId);
  const tileLoadingRef = useRef(false);
  const syncTimerRef = useRef(null);
  const clusterTimerRef = useRef(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const [debugInfo, setDebugInfo] = useState(null);

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
    if (!map || map._removed || !styleReadyRef.current || !map.isStyleLoaded()) return;
    syncOperationalLayers(map, visibilityRef.current, zoomRef.current);
    refreshClusterSources(map, visibilityRef.current, zoomRef.current);
  }, []);

  const debouncedSyncRef = useRef(null);
  const debouncedClusterRefreshRef = useRef(null);

  debouncedSyncRef.current = (map) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => runSync(map), 80);
  };

  debouncedClusterRefreshRef.current = (map) => {
    if (clusterTimerRef.current) clearTimeout(clusterTimerRef.current);
    clusterTimerRef.current = setTimeout(() => {
      refreshClusterSources(map, visibilityRef.current, zoomRef.current);
    }, 200);
  };

  const onStyleReady = useCallback(
    (map) => {
      styleReadyRef.current = true;
      requestAnimationFrame(() => {
        if (map._removed) return;
        map.resize();
        runSync(map);
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
          error: 'Some overlay tiles could not load. Check backend + PostGIS import.',
        });
      }
    });

    map.on('moveend', () => {
      emitViewChange();
      debouncedSyncRef.current?.(map);
      debouncedClusterRefreshRef.current?.(map);
    });

    map.on('zoomend', () => {
      emitViewChange();
      runSync(map);
      debouncedClusterRefreshRef.current?.(map);
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
      cb({
        kind: 'identify',
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

    map.setStyle(getBasemapStyleInput(nextBasemap));
    if (map.isStyleLoaded()) {
      onStyleApplied();
    } else {
      map.once('style.load', onStyleApplied);
    }
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
  }, [highlightFeature, basemapId]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="maplibre-map-container h-full w-full" aria-label="Map" />
      {import.meta.env.DEV && debugInfo ? (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[1050] rounded-lg border border-white/10 bg-black/75 px-2 py-1 font-mono text-[10px] text-white/70">
          z{debugInfo.zoom} · layers {debugInfo.layers?.length ?? 0} · features {debugInfo.visibleFeatures ?? 0}
          {debugInfo.warnings?.length ? ` · warn ${debugInfo.warnings.length}` : ''}
        </div>
      ) : null}
    </div>
  );
}
