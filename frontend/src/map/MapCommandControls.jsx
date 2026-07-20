import { Compass, Expand, Layers3, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import { IconButton } from '../components/ui/IconButton';
import { MapControlCluster } from '../components/ui/MapControlCluster';
import { useDashboardStore } from '../stores/useDashboardStore';

/** Optional alternate control cluster — prefer MapToolbar on the map-first surface. */
export function MapCommandControls() {
  const map = useDashboardStore((s) => s.mapInstance);
  const setBasemapId = useDashboardStore((s) => s.setBasemapId);
  const basemapId = useDashboardStore((s) => s.basemapId);

  const basemaps = ['light', 'dark', 'streets', 'osm'];

  function nextBasemap() {
    const index = basemaps.indexOf(basemapId);
    setBasemapId(basemaps[(index + 1 + basemaps.length) % basemaps.length]);
  }

  return (
    <MapControlCluster position="bottom-right" orientation="vertical">
      <IconButton icon={Plus} tooltip="Zoom in" onClick={() => map?.zoomIn()} />
      <IconButton icon={Minus} tooltip="Zoom out" onClick={() => map?.zoomOut()} />
      <IconButton icon={Compass} tooltip="Reset north" onClick={() => map?.resetNorthPitch()} />
      <IconButton icon={RotateCcw} tooltip="Cycle basemap" onClick={nextBasemap} />
      <IconButton icon={Maximize2} tooltip="Fullscreen" onClick={() => map?.getContainer()?.requestFullscreen?.()} />
      <IconButton
        icon={Expand}
        tooltip="Fit Haryana"
        onClick={() => map?.fitBounds([[74.0, 27.35], [77.85, 31.05]], { padding: 40 })}
      />
      <IconButton icon={Layers3} tooltip="Layers" />
    </MapControlCluster>
  );
}
