import { Activity, Layers, RadioTower, Timer, Wifi } from 'lucide-react';
import { ENTERPRISE_LAYER_CATEGORIES } from '../config/enterpriseLayers';
import { useDashboardStore } from '../stores/useDashboardStore';
import { layout } from '../design-system/tokens';

export function BottomStatusBar() {
  const cursor = useDashboardStore((s) => s.cursor);
  const view = useDashboardStore((s) => s.view);
  const visibility = useDashboardStore((s) => s.visibility);
  const tileStatus = useDashboardStore((s) => s.tileStatus);
  const apiLatencyMs = useDashboardStore((s) => s.apiLatencyMs);
  const activeLayers = ENTERPRISE_LAYER_CATEGORIES.filter((l) => visibility[l.id]?.visible).length;

  const tileLabel = tileStatus.loading
    ? 'Fetching tiles…'
    : tileStatus.error
      ? "Couldn't load tiles — retry"
      : 'Tiles ready';

  return (
    <footer className="z-ds-toolbar flex h-7 shrink-0 items-center justify-between border-t border-ds-border bg-ds-surface-raised px-ds-2 text-ds-caption text-ds-text-secondary">
      <div className="flex h-full items-center gap-ds-3">
        <span className="flex items-center gap-ds-1 font-mono text-ds-text-primary">
          <Activity size={layout.iconInline} className="text-ds-accent" aria-hidden />
          Ready
        </span>
        <span className="font-mono">
          {cursor?.lat?.toFixed(5) || view.lat.toFixed(5)}, {cursor?.lng?.toFixed(5) || view.lng.toFixed(5)}
        </span>
        <span className="flex items-center gap-ds-1 font-mono">
          <RadioTower size={layout.iconInline} aria-hidden />Z {view.zoom.toFixed(1)}
        </span>
      </div>
      <div className="flex h-full items-center gap-ds-3">
        <span className="flex items-center gap-ds-1">
          <Layers size={layout.iconInline} aria-hidden />
          {activeLayers} layers
        </span>
        <span className="flex items-center gap-ds-1">
          <Wifi size={layout.iconInline} aria-hidden />
          {tileLabel}
        </span>
        <span className="flex items-center gap-ds-1 font-mono text-ds-text-primary">
          <Timer size={layout.iconInline} aria-hidden />
          {apiLatencyMs ? `${apiLatencyMs}ms` : '—'}
        </span>
      </div>
    </footer>
  );
}
