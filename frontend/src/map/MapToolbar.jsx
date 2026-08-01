import { useState } from 'react';
import {
  Check,
  Code2,
  Compass,
  Expand,
  Layers,
  Map as MapIcon,
  Maximize2,
  MessageCircle,
  Minus,
  Navigation,
  Plus,
  Share2,
} from 'lucide-react';
import { useDashboardStore } from '../stores/useDashboardStore';
import { createSnapshot } from '../services/portal';
import { IconButton } from '../components/ui/IconButton';
import { MapControlCluster } from '../components/ui/MapControlCluster';
import { BASEMAPS } from '../config/basemaps';

export function MapToolbar() {
  const map = useDashboardStore((s) => s.mapInstance);
  const view = useDashboardStore((s) => s.view);
  const visibility = useDashboardStore((s) => s.visibility);
  const selectedFeature = useDashboardStore((s) => s.selectedFeature);
  const basemapId = useDashboardStore((s) => s.basemapId);
  const setBasemapId = useDashboardStore((s) => s.setBasemapId);
  const setActiveLeftTab = useDashboardStore((s) => s.setActiveLeftTab);
  const leftCollapsed = useDashboardStore((s) => s.leftCollapsed);
  const toggleLeft = useDashboardStore((s) => s.toggleLeft);

  const [copied, setCopied] = useState(false);
  const [embedded, setEmbedded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [basemapOpen, setBasemapOpen] = useState(false);

  async function handleShareView() {
    if (sharing) return;
    setSharing(true);
    try {
      const activeLayers = Object.entries(visibility)
        .filter(([, val]) => val.visible)
        .map(([id]) => id);
      const snapshot = await createSnapshot({
        centerLng: view.lng,
        centerLat: view.lat,
        zoom: view.zoom,
        activeLayers,
        selectedZoneId: selectedFeature?.investorZoneId || null,
      });
      await navigator.clipboard.writeText(`${window.location.origin}/?share=${snapshot.token}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      alert(`Couldn't share view — ${err.message}`);
    } finally {
      setSharing(false);
    }
  }

  async function handleEmbedView() {
    if (embedding) return;
    setEmbedding(true);
    try {
      const activeLayers = Object.entries(visibility)
        .filter(([, val]) => val.visible)
        .map(([id]) => id);
      const snapshot = await createSnapshot({
        centerLng: view.lng,
        centerLat: view.lat,
        zoom: view.zoom,
        activeLayers,
        selectedZoneId: selectedFeature?.investorZoneId || null,
      });
      const src = `${window.location.origin}/?share=${snapshot.token}`;
      const snippet = `<iframe src="${src}" width="800" height="600" style="border:0" loading="lazy" title="LOCATIUM map"></iframe>`;
      await navigator.clipboard.writeText(snippet);
      setEmbedded(true);
      setTimeout(() => setEmbedded(false), 2500);
    } catch (err) {
      alert(`Couldn't create embed snippet — ${err.message}`);
    } finally {
      setEmbedding(false);
    }
  }

  function openLayers() {
    setActiveLeftTab('layers');
    if (leftCollapsed) toggleLeft();
  }

  return (
    <>
      <MapControlCluster position="top-right" orientation="vertical" className="pointer-events-auto">
        <IconButton icon={Layers} tooltip="Layers" onClick={openLayers} />
        <IconButton
          icon={MessageCircle}
          tooltip="Ask LOCATIUM"
          onClick={() => window.dispatchEvent(new CustomEvent('locatium:open-assistant'))}
        />
        <IconButton icon={Navigation} tooltip="Find nearest facility" onClick={() => window.dispatchEvent(new CustomEvent('locatium:open-facility-finder'))} />
        <div className="relative">
          <IconButton
            icon={MapIcon}
            tooltip="Basemap"
            active={basemapOpen}
            onClick={() => setBasemapOpen((v) => !v)}
          />
          {basemapOpen ? (
            <div className="absolute right-full top-0 mr-ds-2 w-44 overflow-hidden rounded-ds-md border border-ds-border bg-ds-surface-raised p-ds-1 shadow-ds-md">
              {BASEMAPS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBasemapId(b.id);
                    setBasemapOpen(false);
                  }}
                  className={`flex w-full items-center gap-ds-2 rounded-ds-sm px-ds-2 py-ds-2 text-left text-ds-body transition-colors ${
                    basemapId === b.id ? 'bg-ds-accent-subtle text-ds-accent-text' : 'text-ds-text-primary hover:bg-ds-surface-sunken'
                  }`}
                >
                  <span className="h-4 w-6 shrink-0 rounded-ds-sm border border-ds-border" style={{ background: b.thumbnail }} />
                  {b.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <IconButton
          icon={copied ? Check : Share2}
          tooltip={copied ? 'Link copied' : 'Share view'}
          active={copied}
          onClick={handleShareView}
        />
        <IconButton
          icon={embedded ? Check : Code2}
          tooltip={embedded ? 'Embed code copied' : 'Copy embed code'}
          active={embedded}
          onClick={handleEmbedView}
        />
      </MapControlCluster>

      <MapControlCluster position="bottom-right" orientation="vertical" className="pointer-events-auto mb-ds-2">
        <IconButton icon={Plus} tooltip="Zoom in" onClick={() => map?.zoomIn()} />
        <IconButton icon={Minus} tooltip="Zoom out" onClick={() => map?.zoomOut()} />
        <IconButton icon={Compass} tooltip="Reset north" onClick={() => map?.resetNorthPitch()} />
        <IconButton
          icon={Expand}
          tooltip="Fit Haryana"
          onClick={() => map?.fitBounds([[74.0, 27.35], [77.85, 31.05]], { padding: 40 })}
        />
        <IconButton
          icon={Maximize2}
          tooltip="Fullscreen"
          onClick={() => map?.getContainer()?.requestFullscreen?.()}
        />
      </MapControlCluster>
    </>
  );
}
