import { IconClose } from './UiIcons';
import { TABLE_LABEL_BY_ID } from '../config/layer-legend';

function formatCoord(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return n.toFixed(5);
}

function AttributeTable({ attrs }) {
  const entries = Object.entries(attrs).filter(([k]) => k !== 'geometry');
  if (entries.length === 0) return <p className="text-xs text-nf-muted">No attributes returned.</p>;
  return (
    <dl className="mt-2 grid max-h-36 grid-cols-[minmax(0,38%)_1fr] gap-x-2 gap-y-1 overflow-y-auto text-[11px] scrollbar-thin">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate font-semibold uppercase tracking-wide text-white/45" title={k}>
            {k}
          </dt>
          <dd className="break-words text-white/85">{v === null || v === undefined || v === '' ? '—' : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function IdentifyPanel({ open, loading, error, skip, skipMessage, lng, lat, layers, layerLabels, onClose, onShowNearbyFacilities }) {
  if (!open) return null;

  const hasHits =
    Array.isArray(layers) &&
    layers.some((L) => L.ok && Array.isArray(L.hits) && L.hits.length > 0);

  return (
    <>
      <button
        type="button"
        aria-label="Dismiss location details"
        className="fixed inset-0 z-[18800] bg-transparent"
        onClick={onClose}
      />
      <aside
        className="control-panel-shell fixed bottom-0 left-3 right-3 z-[18900] flex max-h-[min(46vh,420px)] flex-col rounded-t-2xl border border-white/15 shadow-dock sm:left-auto sm:right-4 sm:w-[min(100vw-2rem,440px)]"
        style={{ backgroundColor: 'rgb(18, 18, 20)' }}
      >
        <div className="control-panel-section flex shrink-0 items-start justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div>
            <p className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-kp-teal">
              Feature inspection
            </p>
            <h2 className="mt-1 font-display text-base font-bold text-white">What&apos;s here?</h2>
            <p className="mt-1 text-[11px] text-white/45">
              Parallel identify on every visible layer (boundaries, cadastral, utilities, transport, etc.).
            </p>
            {!skip && lng != null && lat != null ? (
              <p className="mt-1 font-mono text-[11px] text-white/55">
                {formatCoord(lng)}°, {formatCoord(lat)}°
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-white/55 transition hover:bg-white/10 hover:text-white"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="control-panel-body scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-white/70" role="status" aria-live="polite">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-kp-teal/30 border-t-kp-teal" />
              Querying visible layers…
            </div>
          ) : null}

          {skip ? (
            <p className="text-sm leading-relaxed text-nf-muted">{skipMessage}</p>
          ) : null}

          {!loading && error ? (
            <p className="text-sm text-nf-red">{error}</p>
          ) : null}

          {!loading && !skip && !error && !hasHits ? (
            <p className="text-sm text-nf-muted">
              No features returned for visible layers at this spot. Zoom in, enable more layers, click closer to linework
              or symbols, or raise tolerance (`MAP_IDENTIFY_TOLERANCE_PX` on the API).
            </p>
          ) : null}

          {!loading && !skip && Array.isArray(layers)
            ? layers.map((block) => {
                const title = layerLabels[block.layerKey] || block.layerKey;
                if (!block.ok) {
                  return (
                    <section key={block.layerKey} className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                      <p className="text-xs font-bold text-amber-200/95">{title}</p>
                      <p className="mt-1 text-[11px] text-amber-100/80">{block.error || 'Layer query failed'}</p>
                    </section>
                  );
                }
                if (!block.hits?.length) return null;
                return (
                  <section key={block.layerKey} className="mb-4 rounded-xl border border-white/10 bg-[#1c1c1f] px-3 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-kp-teal">{title}</p>
                    <ul className="mt-2 space-y-3">
                      {block.hits.map((hit, idx) => (
                        <li key={`${block.layerKey}-${hit.layerId}-${idx}`} className="border-t border-white/5 pt-3 first:border-t-0 first:pt-0">
                          <p className="text-sm font-semibold text-white">
                            {hit.value ||
                              TABLE_LABEL_BY_ID[hit.layerName] ||
                              TABLE_LABEL_BY_ID[hit.layerId] ||
                              hit.layerName ||
                              `Feature (${hit.layerId})`}
                          </p>
                          {(hit.layerName || hit.layerId) && hit.value ? (
                            <p className="text-[11px] text-white/50">
                              {TABLE_LABEL_BY_ID[hit.layerName] || TABLE_LABEL_BY_ID[hit.layerId] || hit.layerName}
                            </p>
                          ) : null}
                          <AttributeTable attrs={hit.attributes} />
                          {onShowNearbyFacilities && hit.layerId ? (
                            <button
                              type="button"
                              onClick={() => onShowNearbyFacilities({
                                id: hit.layerId,
                                name: hit.value || hit.layerName || `Feature ${hit.layerId}`,
                                layerKey: block.layerKey
                              })}
                              className="mt-2 text-xs text-kp-teal hover:text-kp-teal/80 transition"
                            >
                              View nearby facilities →
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })
            : null}
        </div>
      </aside>
    </>
  );
}
