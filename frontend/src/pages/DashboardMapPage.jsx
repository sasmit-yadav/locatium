import { useCallback, useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { TopNavigation } from '../layout/TopNavigation';
import { BottomStatusBar } from '../layout/BottomStatusBar';
import { LeftNavigationRail } from '../panels/LeftNavigationRail';
import { LeftSidebar } from '../panels/LeftSidebar';
import { IntelligencePanel } from '../panels/IntelligencePanel';
import { MapLibreMapView } from '../components/MapLibreMapView';
import { MapErrorBoundary } from '../components/MapErrorBoundary';
import { MapToolbar } from '../map/MapToolbar';
import { CommandPalette } from '../components/CommandPalette';
import { IdentifyPanel } from '../components/IdentifyPanel';
import { NearbyFacilityFinder } from '../components/NearbyFacilityFinder';
import { ZoneFacilitiesPanel } from '../components/ZoneFacilitiesPanel';
import { IconButton } from '../components/ui/IconButton';
import { useDashboardStore } from '../stores/useDashboardStore';
import { loginDefaultAnalyst } from '../services/auth';
import { getSnapshot } from '../services/portal';
import { postIdentifyBatch } from '../services/mapsIdentify';
import { AskLocatiumWidget } from '../components/AskLocatiumWidget';
import { DATA_LAYERS } from '../config/layers';

export function DashboardMapPage() {
  const basemapId = useDashboardStore((s) => s.basemapId);
  const visibility = useDashboardStore((s) => s.visibility);
  const goToRequest = useDashboardStore((s) => s.goToRequest);
  const leftCollapsed = useDashboardStore((s) => s.leftCollapsed);
  const rightCollapsed = useDashboardStore((s) => s.rightCollapsed);
  const selectedFeature = useDashboardStore((s) => s.selectedFeature);
  const selectedLocation = useDashboardStore((s) => s.selectedLocation);
  const view = useDashboardStore((s) => s.view);
  const setView = useDashboardStore((s) => s.setView);
  const setTileStatus = useDashboardStore((s) => s.setTileStatus);
  const setMapInstance = useDashboardStore((s) => s.setMapInstance);
  const setSelectedLocation = useDashboardStore((s) => s.setSelectedLocation);
  const flyTo = useDashboardStore((s) => s.flyTo);
  const toggleLeft = useDashboardStore((s) => s.toggleLeft);
  const toggleRight = useDashboardStore((s) => s.toggleRight);
  const toggleLayer = useDashboardStore((s) => s.toggleLayer);
  const investorHighlights = useDashboardStore((s) => s.investorHighlights);

  const [identify, setIdentify] = useState({
    open: false,
    loading: false,
    error: '',
    skip: false,
    skipMessage: '',
    lng: null,
    lat: null,
    layers: [],
  });
  const [facilityFinderOpen, setFacilityFinderOpen] = useState(false);
  const [zoneFacilities, setZoneFacilities] = useState({ open: false, zoneId: null, zoneName: '', lng: null, lat: null });

  useEffect(() => {
    function onOpenFinder() {
      setZoneFacilities({ open: false, zoneId: null, zoneName: '', lng: null, lat: null });
      setFacilityFinderOpen(true);
    }
    window.addEventListener('locatium:open-facility-finder', onOpenFinder);
    return () => window.removeEventListener('locatium:open-facility-finder', onOpenFinder);
  }, []);

  const handleShowNearbyFacilities = useCallback((zone) => {
    setIdentify((prev) => ({ ...prev, open: false }));
    setFacilityFinderOpen(false);
    setZoneFacilities({
      open: true,
      zoneId: zone?.id != null ? String(zone.id) : null,
      zoneName: zone?.name || 'Selected zone',
      lng: zone?.lng ?? null,
      lat: zone?.lat ?? null,
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loginDefaultAnalyst();
      } catch (err) {
        console.error('[DashboardPage] Silent auto-login failed:', err.message);
      }
    })();

    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get('share');
    if (!shareToken) return;

    (async () => {
      try {
        const snapshot = await getSnapshot(shareToken);
        const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);

        if (Array.isArray(snapshot.activeLayers)) {
          const activeSet = new Set(snapshot.activeLayers);
          Object.keys(visibility).forEach((layerId) => {
            const shouldBeVisible = activeSet.has(layerId);
            if (Boolean(visibility[layerId]?.visible) !== shouldBeVisible) {
              toggleLayer(layerId, shouldBeVisible);
            }
          });
        }

        flyTo({
          lng: snapshot.centerLng,
          lat: snapshot.centerLat,
          zoom: snapshot.zoom,
          name: 'Shared view',
          type: 'Spatial snapshot',
          feature: snapshot.selectedZoneId
            ? {
                investorZoneId: snapshot.selectedZoneId,
                tableId: snapshot.selectedZoneId.split(':')[0],
                featureId: snapshot.selectedZoneId.split(':')[1],
              }
            : null,
        });
      } catch (err) {
        console.error('[DashboardPage] Failed to load shared view:', err.message);
      }
    })();
  }, [flyTo, toggleLayer, visibility]);

  const handleSearchSelect = useCallback(
    (item) =>
      flyTo({
        lng: item.lng,
        lat: item.lat,
        zoom: item.zoom || 12,
        name: item.label,
        type: item.type,
        feature: item.feature,
      }),
    [flyTo]
  );

  const handleIdentifyContext = useCallback(
    async (ctx) => {
      if (ctx.kind === 'skip') {
        setIdentify({
          open: true,
          loading: false,
          error: '',
          skip: true,
          skipMessage: 'Turn on a layer to inspect features at this point.',
          lng: null,
          lat: null,
          layers: [],
        });
        return;
      }
      if (ctx.kind !== 'identify') return;

      setSelectedLocation({
        name: 'Selected analysis point',
        district: 'Haryana',
        tehsil: 'Map selection',
        landType: 'Interactive point',
        area: `${ctx.visibleLayerIds.length} active layers`,
        lng: ctx.lng,
        lat: ctx.lat,
        zoom: 13,
      });

      setIdentify({
        open: true,
        loading: true,
        error: '',
        skip: false,
        skipMessage: '',
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
          layerKeys: ctx.visibleLayerIds,
        });
        setIdentify((prev) => ({
          ...prev,
          loading: false,
          layers: json.layers || json.results || [],
        }));
      } catch (err) {
        setIdentify((prev) => ({
          ...prev,
          loading: false,
          error: err.message || "Couldn't inspect this location — check your connection and retry.",
        }));
      }
    },
    [setSelectedLocation]
  );

  const layerLabels = Object.fromEntries(DATA_LAYERS.map((l) => [l.id, l.label]));

  const highlightFeature =
    selectedFeature ||
    (selectedLocation?.lng != null && selectedLocation?.lat != null
      ? { lng: selectedLocation.lng, lat: selectedLocation.lat, center: { lng: selectedLocation.lng, lat: selectedLocation.lat } }
      : null);

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-ds-surface-base font-ui text-ds-text-primary">
      <TopNavigation onSearchSelect={handleSearchSelect} />
      <div className="relative flex min-h-0 flex-1">
        <LeftNavigationRail />
        <LeftSidebar />

        <main className="relative min-w-0 flex-1 overflow-hidden bg-ds-surface-sunken">
          <MapErrorBoundary>
            <MapLibreMapView
              basemapId={basemapId}
              visibility={visibility}
              onIdentifyContext={handleIdentifyContext}
              onViewChange={setView}
              onTileStatusChange={setTileStatus}
              goToRequest={goToRequest}
              onMapReady={setMapInstance}
              highlightFeature={highlightFeature}
              investorHighlights={investorHighlights}
            />
          </MapErrorBoundary>

          <div className="pointer-events-none absolute inset-0 z-ds-map-controls">
            <div className="pointer-events-auto absolute left-ds-4 top-ds-4 z-ds-map-controls flex gap-ds-1 rounded-ds-md border border-ds-border bg-ds-surface-raised p-ds-1 shadow-ds-sm">
              <IconButton
                icon={leftCollapsed ? PanelLeftOpen : PanelLeftClose}
                tooltip={leftCollapsed ? 'Show left panel' : 'Hide left panel'}
                onClick={toggleLeft}
              />
              <IconButton
                icon={rightCollapsed ? PanelRightOpen : PanelRightClose}
                tooltip={rightCollapsed ? 'Show inspector' : 'Hide inspector'}
                onClick={toggleRight}
              />
            </div>
            <MapToolbar />
          </div>

          <IdentifyPanel
            open={identify.open}
            loading={identify.loading}
            error={identify.error}
            skip={identify.skip}
            skipMessage={identify.skipMessage}
            lng={identify.lng}
            lat={identify.lat}
            layers={identify.layers}
            layerLabels={layerLabels}
            onClose={() => setIdentify((prev) => ({ ...prev, open: false }))}
            onShowNearbyFacilities={handleShowNearbyFacilities}
          />

          <NearbyFacilityFinder
            open={facilityFinderOpen}
            onClose={() => setFacilityFinderOpen(false)}
            currentView={view}
            onLocationSelect={(coords) => {
              if (Array.isArray(coords) && coords.length >= 2) {
                flyTo({
                  lng: coords[0],
                  lat: coords[1],
                  zoom: 14,
                  name: 'Nearest facility',
                  type: 'Facility',
                });
              }
            }}
          />

          <ZoneFacilitiesPanel
            open={zoneFacilities.open}
            zoneId={zoneFacilities.zoneId}
            zoneName={zoneFacilities.zoneName}
            lng={zoneFacilities.lng}
            lat={zoneFacilities.lat}
            onClose={() => setZoneFacilities({ open: false, zoneId: null, zoneName: '', lng: null, lat: null })}
          />
        </main>

        <IntelligencePanel />
      </div>
      <BottomStatusBar />
      <CommandPalette />
      <AskLocatiumWidget />
    </div>
  );
}
