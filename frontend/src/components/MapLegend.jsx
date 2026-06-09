import { useState } from 'react';
import { DATA_LAYERS } from '../config/layers';

function LegendSwatch({ color, shape = 'line' }) {
  if (shape === 'bus') {
    return (
      <span
        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#1d4ed8] text-[9px] ring-1 ring-white/25"
        aria-hidden
      >
        🚌
      </span>
    );
  }
  if (shape === 'icon') {
    return (
      <span
        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white ring-1 ring-white/25"
        style={{ backgroundColor: color }}
        aria-hidden
      >
        ✈
      </span>
    );
  }
  if (shape === 'point') {
    return (
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-white/25"
        style={{ backgroundColor: color }}
        aria-hidden
      />
    );
  }
  if (shape === 'fill') {
    return (
      <span
        className="inline-block h-3 w-5 shrink-0 rounded-sm ring-1 ring-white/20"
        style={{ backgroundColor: color, opacity: 0.85 }}
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
      className={`pointer-events-auto absolute bottom-3 left-3 z-[1200] w-[min(calc(100vw-1.5rem),280px)] transition-opacity duration-200 sm:bottom-4 sm:left-4 sm:w-[min(calc(100vw-2rem),300px)] ${
        hiddenByOverlay ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      aria-label="Map legend"
    >
      <div
        className="overflow-hidden rounded-2xl border border-white/12 shadow-dock"
        style={{ backgroundColor: 'rgba(18, 18, 20, 0.94)' }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-white/5 sm:cursor-default sm:hover:bg-transparent"
          aria-expanded={!collapsed}
        >
          <span>
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-kp-teal">
              Legend
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-white/90">
              {visibleLayers.length} active {visibleLayers.length === 1 ? 'layer' : 'layers'}
            </span>
          </span>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-white/45 sm:hidden">
            {collapsed ? 'Show' : 'Hide'}
          </span>
        </button>

        {!collapsed ? (
          <div className="scrollbar-thin max-h-[min(38vh,280px)] overflow-y-auto border-t border-white/8 px-3 pb-3 pt-2">
            {visibleLayers.map((layer) => (
              <section key={layer.id} className="mb-3 last:mb-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/55">{layer.label}</p>
                <ul className="mt-1.5 space-y-1">
                  {layer.legend.map((item) => (
                    <li key={`${layer.id}-${item.tableId || item.label}`} className="flex items-center gap-2.5">
                      <LegendSwatch color={item.color} shape={item.shape} />
                      <span className="text-[11px] leading-snug text-white/82">
                        {item.label}
                        {item.minzoom > 0 ? (
                          <span className="text-white/35"> · z{item.minzoom}+</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="mt-2 border-t border-white/6 pt-2 text-[10px] leading-relaxed text-white/35">
              Full symbology for every sub-layer in active categories. z = minimum map zoom.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
