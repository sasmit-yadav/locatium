import { useCallback, useEffect, useState } from 'react';
import { MapLibreMapView } from './components/MapLibreMapView';
import { MapErrorBoundary } from './components/MapErrorBoundary';
import { MapLegend } from './components/MapLegend';
import { TileStatusOverlay } from './components/TileStatusOverlay';
import { ControlPanel } from './components/ControlPanel';
import { AboutPopover, AppChrome } from './components/AppChrome';
import { IdentifyPanel } from './components/IdentifyPanel';
import { PlaceSearch } from './components/PlaceSearch';
import { NearbyFacilityFinder } from './components/NearbyFacilityFinder';
import { ZoneFacilitiesPanel } from './components/ZoneFacilitiesPanel';
import { AreaSelectionTool } from './components/AreaSelectionTool';
import { FacilityMarkers } from './components/FacilityMarkers';
import { DATA_LAYERS, DEFAULT_ZOOM, INITIAL_MAP_CENTER } from './config/layers';
import { DEFAULT_BASEMAP_ID } from './config/basemaps';
import { postIdentifyBatch } from './services/mapsIdentify';
import { fetchMapsStatus } from './services/mapsStatus';

function buildInitialVisibility() {
  const v = {};
  for (const layer of DATA_LAYERS) {
    v[layer.id] = {
      visible: layer.id === 'administrative',
      opacity: layer.id === 'administrative' ? 0.72 : 0.65,
    };
  }
  return v;
}

const LAYER_LABELS = Object.fromEntries(DATA_LAYERS.map((l) => [l.id, l.label]));
const LAYER_BY_ID = Object.fromEntries(DATA_LAYERS.map((l) => [l.id, l]));

export default function App() {
  const [basemapId, setBasemapId] = useState(DEFAULT_BASEMAP_ID);
  const [visibility, setVisibility] = useState(buildInitialVisibility);

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState('layers');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [facilityFinderOpen, setFacilityFinderOpen] = useState(false);
  const [areaSelectionOpen, setAreaSelectionOpen] = useState(false);
  const [areaSelectionSelecting, setAreaSelectionSelecting] = useState(false);
  const [zoneFacilitiesOpen, setZoneFacilitiesOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null);
  const [harsacResults, setHarsacResults] = useState(null);
  const [searchCenter, setSearchCenter] = useState(null);
  const [facilityMarkersVisible, setFacilityMarkersVisible] = useState(true);
  const [goToRequest, setGoToRequest] = useState(null);
  const [currentView, setCurrentView] = useState({
    lat: INITIAL_MAP_CENTER[0],
    lng: INITIAL_MAP_CENTER[1],
    zoom: DEFAULT_ZOOM,
  });

  const [mapsStatus, setMapsStatus] = useState(null);
  const [tileStatus, setTileStatus] = useState({ loading: false, error: null });
  const [mapInstance, setMapInstance] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMapsStatus()
      .then((s) => {
        if (!cancelled) setMapsStatus(s);
      })
      .catch(() => {
        if (!cancelled) {
          setMapsStatus({
            ok: false,
            configured: false,
            message:
              'Cannot reach the map API on port 3001. In a second terminal run: cd backend && npm run dev — then refresh this page.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [identify, setIdentify] = useState({
    open: false,
    loading: false,
    skip: false,
    skipMessage: '',
    error: null,
    lng: null,
    lat: null,
    layers: [],
  });

  const handleIdentifyContext = useCallback(async (ctx) => {
    if (ctx.kind === 'skip') {
      const msg =
        ctx.reason === 'no_visible_layers'
          ? 'Turn on at least one layer in Layers, then click the map to inspect features.'
          : 'Could not read that map click. Try again.';
      setIdentify({
        open: true,
        loading: false,
        skip: true,
        skipMessage: msg,
        error: null,
        lng: null,
        lat: null,
        layers: [],
      });
      return;
    }
    if (ctx.kind === 'error') {
      setIdentify({
        open: true,
        loading: false,
        skip: false,
        skipMessage: '',
        error: ctx.message,
        lng: null,
        lat: null,
        layers: [],
      });
      return;
    }

    setIdentify({
      open: true,
      loading: true,
      skip: false,
      skipMessage: '',
      error: null,
      lng: ctx.lng,
      lat: ctx.lat,
      layers: [],
    });

    try {
      const json = await postIdentifyBatch({
        lng: ctx.lng,
        lat: ctx.lat,
        extent4326: ctx.extent4326,
        width: ctx.width,
        height: ctx.height,
        dpi: ctx.dpi,
        tolerance: 15,
        layerKeys: ctx.visibleLayerIds,
      });
      setIdentify({
        open: true,
        loading: false,
        skip: false,
        skipMessage: '',
        error: null,
        lng: ctx.lng,
        lat: ctx.lat,
        layers: json.layers || [],
      });
    } catch (e) {
      setIdentify({
        open: true,
        loading: false,
        skip: false,
        skipMessage: '',
        error: e instanceof Error ? e.message : 'Identify failed',
        lng: ctx.lng,
        lat: ctx.lat,
        layers: [],
      });
    }
  }, []);

  const handleMapReady = useCallback((map) => {
    setMapInstance(map);
  }, []);

  function handleToggle(id, visible) {
    setVisibility((prev) => ({
      ...prev,
      [id]: { ...prev[id], visible },
    }));
    const minZoom = LAYER_BY_ID[id]?.minZoom ?? 0;
    if (visible && currentView.zoom + 0.05 < minZoom) {
      setGoToRequest({
        t: Date.now(),
        lng: currentView.lng,
        lat: currentView.lat,
        zoom: minZoom + 0.25,
      });
    }
  }

  function handleOpacity(id, opacity) {
    setVisibility((prev) => ({
      ...prev,
      [id]: { ...prev[id], opacity },
    }));
  }

  function openLayers() {
    setPanelTab('layers');
    setPanelOpen(true);
    setAboutOpen(false);
  }

  function openBasemap() {
    setPanelTab('basemap');
    setPanelOpen(true);
    setAboutOpen(false);
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-nf-black font-display text-white">
      <AppChrome
        onToggleAbout={() => setAboutOpen((o) => !o)}
        aboutOpen={aboutOpen}
        onLayers={openLayers}
        onBasemap={openBasemap}
        onFacilityFinder={() => setAreaSelectionOpen(true)}
        facilityFinderLit={areaSelectionOpen}
        layersLit={panelOpen && panelTab === 'layers'}
        basemapLit={panelOpen && panelTab === 'basemap'}
        searchSlot={
          <PlaceSearch
            onSelectPlace={({ lng, lat, zoom }) => {
              setGoToRequest({ t: Date.now(), lng, lat, zoom });
            }}
          />
        }
      />

      {mapsStatus && !mapsStatus.ok ? (
        <div
          className="border-b border-amber-500/40 bg-amber-950/90 px-4 py-2 text-sm text-amber-100"
          role="alert"
        >
          <strong className="font-semibold text-amber-50">Map layers unavailable. </strong>
          {mapsStatus.message}
        </div>
      ) : null}

      <main className="relative min-h-0 flex-1 w-full">
        <MapErrorBoundary>
          <MapLibreMapView
            basemapId={basemapId}
            visibility={visibility}
            onIdentifyContext={handleIdentifyContext}
            onViewChange={setCurrentView}
            onTileStatusChange={(patch) => setTileStatus((s) => ({ ...s, ...patch }))}
            goToRequest={goToRequest}
            onMapReady={handleMapReady}
          />
        </MapErrorBoundary>
        <TileStatusOverlay
          loading={tileStatus.loading}
          error={tileStatus.error}
          onDismissError={() => setTileStatus((s) => ({ ...s, error: null }))}
        />
        <MapLegend visibility={visibility} identifyOpen={identify.open} panelOpen={panelOpen} />
      </main>

      <ControlPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        tab={panelTab}
        onTabChange={(t) => setPanelTab(t)}
        visibility={visibility}
        currentZoom={currentView.zoom}
        onZoomToLayer={(layerId) => {
          const minZoom = LAYER_BY_ID[layerId]?.minZoom ?? 0;
          setGoToRequest({
            t: Date.now(),
            lng: currentView.lng,
            lat: currentView.lat,
            zoom: minZoom + 0.25,
          });
        }}
        onToggle={handleToggle}
        onOpacity={handleOpacity}
        basemapId={basemapId}
        onBasemapChange={setBasemapId}
      />

      <AboutPopover open={aboutOpen} onClose={() => setAboutOpen(false)} />

      <IdentifyPanel
        open={identify.open}
        loading={identify.loading}
        error={identify.error}
        skip={identify.skip}
        skipMessage={identify.skipMessage}
        lng={identify.lng}
        lat={identify.lat}
        layers={identify.layers}
        layerLabels={LAYER_LABELS}
        onClose={() => setIdentify((s) => ({ ...s, open: false }))}
        onShowNearbyFacilities={(zone) => {
          setSelectedZone(zone);
          setZoneFacilitiesOpen(true);
          setIdentify((s) => ({ ...s, open: false }));
        }}
      />

      <NearbyFacilityFinder
        open={facilityFinderOpen}
        onClose={() => setFacilityFinderOpen(false)}
        onLocationSelect={(coordinates) => {
          if (coordinates && coordinates.length >= 2) {
            setGoToRequest({
              t: Date.now(),
              lng: coordinates[0],
              lat: coordinates[1],
              zoom: 14,
            });
          }
        }}
      />

      <AreaSelectionTool
        open={areaSelectionOpen}
        selecting={areaSelectionSelecting}
        map={mapInstance}
        onClose={() => {
          setAreaSelectionOpen(false);
          setAreaSelectionSelecting(false);
          setHarsacResults(null);
          setSearchCenter(null);
        }}
        onResultsFound={(data) => {
          if (data) {
            setHarsacResults(data);
            setFacilityMarkersVisible(true);
            if (data.center) setSearchCenter({ lat: data.center.lat, lng: data.center.lng });
          } else {
            setHarsacResults(null);
            setSearchCenter(null);
          }
        }}
        onSelectionStart={() => {
          // hide the modal window but keep the tool mounted so the map can receive clicks
          setAreaSelectionOpen(false);
          setAreaSelectionSelecting(true);
        }}
        onSelectionEnd={() => {
          // selection finished: stop selecting and reopen the modal to show results
          setAreaSelectionSelecting(false);
          setAreaSelectionOpen(true);
        }}
      />

      <FacilityMarkers
        map={mapInstance}
        results={harsacResults}
        center={searchCenter}
        visible={facilityMarkersVisible}
        onMarkerClick={(facility) => {
          console.log('Facility clicked:', facility);
          // Could open a detailed panel here
        }}
      />

      <ZoneFacilitiesPanel
        open={zoneFacilitiesOpen}
        onClose={() => setZoneFacilitiesOpen(false)}
        zoneId={selectedZone?.id}
        zoneName={selectedZone?.name}
      />
    </div>
  );
}
