import { ChevronDown, Eye, Info, Layers, Lock, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BASEMAPS } from '../config/basemaps';
import { ENTERPRISE_LAYER_CATEGORIES } from '../config/enterpriseLayers';
import { useDashboardStore } from '../stores/useDashboardStore';
import { Toggle } from '../components/ui/Toggle';
import { Slider } from '../components/ui/Slider';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchInput } from '../components/ui/SearchInput';
import { layout } from '../design-system/tokens';

function LayerRow({ layer }) {
  const state = useDashboardStore((s) => s.visibility[layer.id]);
  const toggleLayer = useDashboardStore((s) => s.toggleLayer);
  const setLayerOpacity = useDashboardStore((s) => s.setLayerOpacity);
  const [hovered, setHovered] = useState(false);
  const visible = Boolean(state?.visible);
  const opacity = Math.round((state?.opacity ?? layer.defaultOpacity) * 100);

  return (
    <div
      className="group rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised p-ds-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div className="flex items-start gap-ds-3">
        <Toggle
          size="sm"
          checked={visible}
          onChange={(next) => toggleLayer(layer.id, next)}
          ariaLabel={`Toggle ${layer.name}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-ds-2">
            <div className="truncate text-ds-body-med text-ds-text-primary">{layer.name}</div>
            <div className="flex items-center gap-ds-2 text-ds-text-tertiary">
              {layer.heavy ? <Lock size={layout.iconInline} className="text-ds-warning" aria-label="Heavy layer" /> : null}
              <Info size={layout.iconInline} aria-hidden />
            </div>
          </div>
          <div className="mt-ds-1 flex items-center gap-ds-2 text-ds-small text-ds-text-secondary">
            <span className="h-2.5 w-2.5 rounded-ds-sm" style={{ backgroundColor: layer.color }} aria-hidden />
            <span>{layer.tableCount} tables</span>
            <span>min z{layer.minzoom}</span>
          </div>
          {(hovered || visible) && (
            <div className="mt-ds-3">
              <Slider
                label={`Opacity ${opacity}%`}
                min={0}
                max={100}
                step={5}
                value={opacity}
                onChange={(v) => setLayerOpacity(layer.id, v / 100)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LegendSwatch({ entry }) {
  if (entry.shape === 'point' || entry.shape === 'icon') {
    return (
      <span
        className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white shadow-sm ring-1 ring-black/15"
        style={{ backgroundColor: entry.color }}
        title={entry.label}
      />
    );
  }
  if (entry.shape === 'bus') {
    return (
      <span
        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-white shadow-sm ring-1 ring-black/15"
        style={{ backgroundColor: entry.color }}
        title={entry.label}
      >
        <span className="h-1.5 w-2 rounded-[1px] bg-white/90" />
      </span>
    );
  }
  if (entry.shape === 'fill') {
    return (
      <span
        className="inline-block h-3.5 w-4 shrink-0 rounded-sm border-2 shadow-sm"
        style={{ backgroundColor: `${entry.color}66`, borderColor: entry.color }}
        title={entry.label}
      />
    );
  }
  if (entry.shape === 'dash') {
    return (
      <span
        className="inline-block h-0 w-5 shrink-0 border-t-2 border-dashed"
        style={{ borderColor: entry.color }}
        title={entry.label}
      />
    );
  }
  return (
    <span
      className="inline-block h-1 w-5 shrink-0 rounded-full shadow-sm"
      style={{ backgroundColor: entry.color }}
      title={entry.label}
    />
  );
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-ds-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-ds-4 py-ds-3 text-left focus-visible:outline-none focus-visible:shadow-ds-focus"
      >
        <span className="text-ds-caption uppercase tracking-wide text-ds-text-tertiary">{title}</span>
        <ChevronDown size={layout.iconInline} className={`text-ds-text-tertiary transition ${open ? '' : '-rotate-90'}`} />
      </button>
      {open ? <div className="space-y-ds-2 px-ds-3 pb-ds-3">{children}</div> : null}
    </section>
  );
}

export function LayerControlPanel() {
  const [filter, setFilter] = useState('');
  const [basemapDropdown, setBasemapDropdown] = useState(false);
  const basemapId = useDashboardStore((s) => s.basemapId);
  const setBasemapId = useDashboardStore((s) => s.setBasemapId);
  const visibility = useDashboardStore((s) => s.visibility);

  const activeBasemap = BASEMAPS.find((b) => b.id === basemapId) || BASEMAPS[0];

  const layers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return ENTERPRISE_LAYER_CATEGORIES;
    return ENTERPRISE_LAYER_CATEGORIES.filter((l) => `${l.name} ${l.category}`.toLowerCase().includes(q));
  }, [filter]);

  const grouped = useMemo(() => {
    const map = new Map();
    layers.forEach((layer) => {
      const key = layer.category || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(layer);
    });
    return [...map.entries()];
  }, [layers]);

  const visibleLegendLayers = useMemo(
    () =>
      ENTERPRISE_LAYER_CATEGORIES.filter((layer) => {
        const state = visibility[layer.id];
        return state?.visible && (state.opacity ?? 1) > 0;
      }),
    [visibility]
  );

  return (
    <div className="flex h-full flex-col bg-ds-surface-raised">
      <div className="flex items-center gap-ds-2 border-b border-ds-border px-ds-4 py-ds-3">
        <Layers size={layout.iconButtonGlyph} className="text-ds-text-secondary" aria-hidden />
        <h2 className="text-ds-title text-ds-text-primary">Layers</h2>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <Section title="Search filters">
          <SearchInput
            placeholder="Filter layers…"
            value={filter}
            onChange={setFilter}
            showResults={false}
          />
        </Section>

        <Section title="Basemap">
          <div className="relative">
            <button
              type="button"
              onClick={() => setBasemapDropdown(!basemapDropdown)}
              className="flex w-full items-center justify-between rounded-ds-sm border border-ds-border bg-ds-surface-sunken px-ds-3 py-ds-2 transition hover:bg-ds-accent-subtle focus-visible:outline-none focus-visible:shadow-ds-focus"
            >
              <div className="flex items-center gap-ds-3">
                <span className="block h-6 w-8 rounded-ds-sm border border-ds-border" style={{ background: activeBasemap.thumbnail }} />
                <span className="text-ds-body-med text-ds-text-primary">{activeBasemap.label}</span>
              </div>
              <ChevronDown size={layout.iconInline} className={`text-ds-text-secondary transition ${basemapDropdown ? 'rotate-180' : ''}`} />
            </button>
            {basemapDropdown ? (
              <div className="absolute left-0 top-full z-ds-dropdown mt-ds-2 w-full rounded-ds-md border border-ds-border bg-ds-surface-raised p-ds-2 shadow-ds-md">
                <div className="grid grid-cols-2 gap-ds-2">
                  {BASEMAPS.map((basemap) => (
                    <button
                      key={basemap.id}
                      type="button"
                      onClick={() => {
                        setBasemapId(basemap.id);
                        setBasemapDropdown(false);
                      }}
                      className={`flex flex-col items-start gap-ds-2 rounded-ds-sm border p-ds-2 transition ${
                        basemapId === basemap.id
                          ? 'border-ds-accent bg-ds-accent-subtle'
                          : 'border-ds-border hover:bg-ds-surface-sunken'
                      }`}
                    >
                      <span className="block h-8 w-full rounded-ds-sm border border-ds-border" style={{ background: basemap.thumbnail }} />
                      <span className="text-ds-small text-ds-text-primary">{basemap.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="Layer categories" icon={SlidersHorizontal}>
          {grouped.length === 0 ? (
            <EmptyState title="No layers match" description="Try a different filter name." />
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="space-y-ds-2">
                <div className="px-ds-1 text-ds-caption uppercase tracking-wide text-ds-text-tertiary">{group}</div>
                {items.map((layer) => (
                  <LayerRow key={layer.id} layer={layer} />
                ))}
              </div>
            ))
          )}
        </Section>

        <Section title={`Legends (${visibleLegendLayers.length})`} defaultOpen>
          {visibleLegendLayers.length ? (
            visibleLegendLayers.map((layer) => (
              <Card key={layer.id} padding="sm" className="space-y-ds-2">
                <div className="flex items-center justify-between gap-ds-2">
                  <span className="flex min-w-0 items-center gap-ds-2 text-ds-body-med text-ds-text-primary">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />
                    <span className="truncate">{layer.name}</span>
                  </span>
                  <span className="shrink-0 text-ds-small text-ds-text-secondary">
                    {Math.round((visibility[layer.id]?.opacity ?? layer.defaultOpacity) * 100)}%
                  </span>
                </div>
                <div className="space-y-ds-1">
                  {(layer.legend || []).map((entry) => (
                    <div key={entry.tableId} className="flex items-center justify-between gap-ds-3 border-t border-ds-border-subtle py-ds-1 first:border-t-0">
                      <span className="flex min-w-0 items-center gap-ds-2">
                        <LegendSwatch entry={entry} />
                        <span className="truncate text-ds-small text-ds-text-primary">{entry.label}</span>
                      </span>
                      <span className="shrink-0 text-ds-caption text-ds-text-tertiary">z{entry.minzoom}+</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))
          ) : (
            <EmptyState
              icon={Eye}
              title="No legends yet"
              description="Turn on a layer to view its legend."
            />
          )}
        </Section>
      </div>
    </div>
  );
}
