import { useState } from 'react';
import { DATA_LAYERS } from '../config/layers';
import { colors } from '../design-system/tokens';

function LegendSwatch({ color, shape = 'line' }) {
  if (shape === 'point' || shape === 'icon') {
    return (
      <span
        className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white shadow-sm ring-1 ring-black/15"
        style={{ backgroundColor: color }}
        aria-hidden
      />
    );
  }
  if (shape === 'bus') {
    return (
      <span
        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-white shadow-sm ring-1 ring-black/15"
        style={{ backgroundColor: color || colors.accent.default }}
        aria-hidden
      >
        <span className="h-1.5 w-2 rounded-[1px] bg-white/90" />
      </span>
    );
  }
  if (shape === 'fill') {
    return (
      <span
        className="inline-block h-3.5 w-4 shrink-0 rounded-sm border-2 shadow-sm"
        style={{ backgroundColor: `${color}66`, borderColor: color }}
        aria-hidden
      />
    );
  }
  const dash = shape === 'dash';
  return (
    <span className="inline-flex h-3 w-5 shrink-0 items-center" aria-hidden>
      <span
        className="h-0 w-full border-t-2"
        style={{
          borderColor: color,
          borderTopStyle: dash ? 'dashed' : 'solid',
        }}
      />
    </span>
  );
}

export function MapLegend({ visibility, identifyOpen = false, panelOpen = false }) {
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );

  const visibleLayers = DATA_LAYERS.filter((layer) => {
    const state = visibility[layer.id];
    return state?.visible && (state.opacity ?? 0) > 0 && Array.isArray(layer.legend) && layer.legend.length > 0;
  });

  if (visibleLayers.length === 0) return null;

  const hiddenByOverlay = identifyOpen || panelOpen;

  return (
    <div
      className={`pointer-events-auto absolute bottom-ds-3 left-ds-3 z-ds-floating-panel w-[min(calc(100vw-1.5rem),280px)] transition-opacity duration-ds-base sm:bottom-ds-4 sm:left-ds-4 sm:w-[min(calc(100vw-2rem),300px)] ${
        hiddenByOverlay ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      aria-label="Map legend"
    >
      <div className="overflow-hidden rounded-ds-md border border-ds-border bg-ds-surface-raised shadow-ds-sm">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center justify-between gap-ds-2 px-ds-3 py-ds-2.5 text-left transition hover:bg-ds-surface-sunken focus-visible:outline-none focus-visible:shadow-ds-focus sm:cursor-default sm:hover:bg-transparent"
          aria-expanded={!collapsed}
        >
          <span>
            <span className="text-ds-caption uppercase tracking-wide text-ds-text-tertiary">Legend</span>
            <span className="mt-0.5 block text-ds-body-med text-ds-text-primary">
              {visibleLayers.length} active {visibleLayers.length === 1 ? 'layer' : 'layers'}
            </span>
          </span>
          <span className="shrink-0 text-ds-caption text-ds-text-secondary sm:hidden">
            {collapsed ? 'Show' : 'Hide'}
          </span>
        </button>

        {!collapsed ? (
          <div className="scrollbar-thin max-h-[min(38vh,280px)] overflow-y-auto border-t border-ds-border-subtle px-ds-3 pb-ds-3 pt-ds-2">
            {visibleLayers.map((layer) => (
              <section key={layer.id} className="mb-ds-3 last:mb-0">
                <p className="text-ds-caption uppercase tracking-wide text-ds-text-tertiary">{layer.label}</p>
                <ul className="mt-ds-1.5 space-y-ds-1">
                  {layer.legend.map((item) => (
                    <li key={`${layer.id}-${item.tableId || item.label}`} className="flex items-center gap-ds-2.5">
                      <LegendSwatch color={item.color} shape={item.shape} />
                      <span className="text-ds-small leading-snug text-ds-text-secondary">
                        {item.label}
                        {item.minzoom > 0 ? (
                          <span className="text-ds-text-tertiary"> · z{item.minzoom}+</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="mt-ds-2 border-t border-ds-border-subtle pt-ds-2 text-ds-caption leading-relaxed text-ds-text-tertiary">
              Full symbology for every sub-layer in active categories. z = minimum map zoom.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
