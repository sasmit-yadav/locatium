import { IconClose } from './UiIcons';
import { DATA_LAYERS } from '../config/layers';
import { BASEMAPS } from '../config/basemaps';

export function ControlPanel({
  open,
  onClose,
  tab,
  onTabChange,
  visibility,
  currentZoom,
  onZoomToLayer,
  onToggle,
  onOpacity,
  basemapId,
  onBasemapChange,
}) {
  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close panel"
          className="fixed inset-0 top-14 z-[19900] bg-ds-surface-overlay backdrop-blur-[1px] sm:hidden"
          onClick={onClose}
        />
      ) : null}
    <aside
      className={`control-panel-shell fixed bottom-0 right-0 top-14 z-[20000] flex w-full flex-col border-l border-ds-border transition-transform duration-300 ease-out sm:top-16 sm:max-w-[400px] sm:rounded-l-3xl sm:border-t sm:border-ds-border md:w-[400px] ${
        open ? 'translate-x-0 pointer-events-auto' : 'pointer-events-none translate-x-full'
      }`}
      style={{ backgroundColor: 'rgb(18, 18, 20)' }}
      aria-hidden={!open}
    >
      <div className="control-panel-section flex items-center gap-2 border-b border-ds-border px-3 py-3 sm:rounded-tl-3xl">
        <nav className="flex flex-1 gap-1 rounded-xl bg-ds-surface-sunken p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'layers'}
            onClick={() => onTabChange('layers')}
            className={`flex-1 rounded-lg py-2 text-center text-xs font-bold uppercase tracking-wider transition ${
              tab === 'layers'
                ? 'bg-ds-accent text-ds-text-primary shadow-md shadow-ds-sm'
                : 'text-ds-text-tertiary hover:text-ds-text-primary/80'
            }`}
          >
            Layers
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'basemap'}
            onClick={() => onTabChange('basemap')}
            className={`flex-1 rounded-lg py-2 text-center text-xs font-bold uppercase tracking-wider transition ${
              tab === 'basemap'
                ? 'bg-ds-accent text-ds-text-primary shadow-md shadow-ds-sm'
                : 'text-ds-text-tertiary hover:text-ds-text-primary/80'
            }`}
          >
            Basemap
          </button>
        </nav>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-2 text-ds-text-tertiary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
        >
          <IconClose className="h-5 w-5" />
        </button>
      </div>

      <div className="control-panel-section border-b border-ds-border px-4 py-4">
        <p className="font-display text-[10px] uppercase tracking-[0.22em] text-ds-accent-text">
          {tab === 'layers' ? 'Official layers' : 'Basemap'}
        </p>
        <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-ds-text-primary sm:text-xl">
          {tab === 'layers' ? 'Official data layers' : 'Background map'}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ds-text-secondary">
          {tab === 'layers'
            ? 'Overlays load as cached map tiles (fast after the first view). Turn on one or two layers at a time for best speed. Zoom in for cadastral detail. Click the map to identify features.'
            : 'Map backgrounds under official Haryana data layers. Pick one if the map looks blank.'}
        </p>
      </div>

      <div className="control-panel-body scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-3">
        {tab === 'layers' ? (
          <LayersSection
            visibility={visibility}
            currentZoom={currentZoom}
            onZoomToLayer={onZoomToLayer}
            onToggle={onToggle}
            onOpacity={onOpacity}
          />
        ) : (
          <BasemapSection basemapId={basemapId} onBasemapChange={onBasemapChange} />
        )}
      </div>
    </aside>
    </>
  );
}

function LayersSection({ visibility, currentZoom = 0, onZoomToLayer, onToggle, onOpacity }) {
  return (
    <ul className="space-y-2">
      {DATA_LAYERS.map((layer) => {
        const state = visibility[layer.id] ?? { visible: false, opacity: 0.75 };
        const minZoom = layer.minZoom ?? 0;
        const hiddenByZoom = state.visible && currentZoom + 0.05 < minZoom;
        return (
          <li
            key={layer.id}
            className="rounded-2xl border border-ds-border bg-ds-surface-raised px-3 py-3 transition hover:border-ds-accent"
          >
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-ds-border bg-ds-surface-overlay text-ds-accent focus:ring-ds-accent focus:ring-offset-0"
                checked={state.visible}
                onChange={(e) => onToggle(layer.id, e.target.checked)}
              />
              <span className="flex-1 text-sm font-medium leading-snug text-ds-text-primary">
                {layer.label}
                {minZoom > 0 ? (
                  <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wider text-ds-text-tertiary">
                    z{minZoom}+
                  </span>
                ) : null}
              </span>
            </label>
            {hiddenByZoom ? (
              <div className="mt-3 flex items-center gap-3 pl-7 text-xs text-amber-100/90">
                <span className="min-w-0 flex-1">Visible from zoom {minZoom}.</span>
                <button
                  type="button"
                  onClick={() => onZoomToLayer?.(layer.id)}
                  className="shrink-0 rounded-lg border border-amber-300/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-100 transition hover:bg-amber-300/10"
                >
                  Zoom
                </button>
              </div>
            ) : null}
            {state.visible ? (
              <div className="mt-3 flex items-center gap-3 pl-7">
                <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-ds-accent-text">
                  Mix
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(state.opacity * 100)}
                  onChange={(e) => onOpacity(layer.id, Number(e.target.value) / 100)}
                  className="h-1 flex-1 accent-ds-accent"
                />
                <span className="w-9 tabular-nums text-xs text-ds-text-secondary">{Math.round(state.opacity * 100)}%</span>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function BasemapSection({ basemapId, onBasemapChange }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {BASEMAPS.map((bm) => (
        <label
          key={bm.id}
          className={`cursor-pointer rounded-2xl border p-3 transition ${
            basemapId === bm.id
              ? 'border-ds-accent bg-ds-accent-subtle shadow-lg shadow-ds-sm'
              : 'border-ds-border bg-ds-surface-sunken hover:border-ds-border-strong'
          }`}
        >
          <input
            type="radio"
            name="basemap-panel"
            className="sr-only"
            checked={basemapId === bm.id}
            onChange={() => onBasemapChange(bm.id)}
          />
          <span
            className="mb-2 block aspect-[16/10] w-full rounded-lg bg-cover ring-1 ring-ds-border"
            style={{ background: bm.thumbnail }}
          />
          <span className="block text-center text-[11px] font-semibold leading-tight text-ds-text-primary">{bm.label}</span>
        </label>
      ))}
    </div>
  );
}
