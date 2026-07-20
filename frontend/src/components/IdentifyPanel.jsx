import { Crosshair } from 'lucide-react';
import { TABLE_LABEL_BY_ID } from '../config/layer-legend';
import { Panel } from './ui/Panel';
import { Card } from './ui/Card';
import { Skeleton } from './ui/Skeleton';
import { EmptyState } from './ui/EmptyState';
import { layout } from '../design-system/tokens';

function formatCoord(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return n.toFixed(5);
}

function AttributeTable({ attrs }) {
  const entries = Object.entries(attrs).filter(([k]) => k !== 'geometry');
  if (entries.length === 0) {
    return <p className="text-ds-small text-ds-text-secondary">No attributes returned for this feature.</p>;
  }
  return (
    <dl className="mt-ds-2 max-h-36 overflow-y-auto scrollbar-thin">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[minmax(0,38%)_1fr] gap-x-ds-2 border-b border-ds-border-subtle py-ds-1 last:border-b-0">
          <dt className="truncate text-ds-small text-ds-text-secondary" title={k}>
            {k}
          </dt>
          <dd className="break-words text-ds-body text-ds-text-primary">
            {v === null || v === undefined || v === '' ? '—' : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function IdentifyPanel({
  open,
  loading,
  error,
  skip,
  skipMessage,
  lng,
  lat,
  layers,
  layerLabels,
  onClose,
  onShowNearbyFacilities,
}) {
  if (!open) return null;

  const hasHits =
    Array.isArray(layers) && layers.some((L) => L.ok && Array.isArray(L.hits) && L.hits.length > 0);

  return (
    <>
      <button type="button" aria-label="Dismiss location details" className="fixed inset-0 z-ds-floating-panel bg-transparent" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-ds-floating-panel p-0 md:bottom-auto md:left-auto md:right-ds-4 md:top-20 md:w-ds-panel md:p-0">
        <Panel
          title="What's here?"
          icon={Crosshair}
          onClose={onClose}
          anchor="bottom-sheet"
          className="relative max-h-[min(46vh,420px)] w-full md:max-h-[min(70vh,560px)] md:!rounded-ds-md"
          width={layout.panelWidth}
        >
          <div className="space-y-ds-3 px-ds-4 py-ds-3">
            <p className="text-ds-small text-ds-text-secondary">
              Features under this point across visible layers.
            </p>
            {!skip && lng != null && lat != null ? (
              <p className="font-mono text-ds-small text-ds-text-tertiary">
                {formatCoord(lng)}°, {formatCoord(lat)}°
              </p>
            ) : null}

            {loading ? <Skeleton variant="row" count={3} /> : null}

            {skip ? <p className="text-ds-body text-ds-text-secondary">{skipMessage}</p> : null}

            {!loading && error ? (
              <p className="rounded-ds-sm border border-ds-danger/30 bg-ds-danger-subtle p-ds-3 text-ds-body text-ds-danger">
                {error.includes('retry') || error.includes('connection')
                  ? error
                  : `Couldn't inspect this location — ${error}. Check your connection and retry.`}
              </p>
            ) : null}

            {!loading && !skip && !error && !hasHits ? (
              <EmptyState
                icon={Crosshair}
                title="No features here"
                description="Zoom in, enable more layers, or click closer to boundaries and symbols."
              />
            ) : null}

            {!loading && !skip && Array.isArray(layers)
              ? layers.map((block) => {
                  const title = layerLabels[block.layerKey] || block.layerKey;
                  if (!block.ok) {
                    return (
                      <Card key={block.layerKey} padding="sm" className="border-ds-warning/40 bg-ds-warning-subtle">
                        <p className="text-ds-body-med text-ds-warning">{title}</p>
                        <p className="mt-ds-1 text-ds-small text-ds-text-secondary">
                          {block.error || "Couldn't query this layer — retry"}
                        </p>
                      </Card>
                    );
                  }
                  if (!block.hits?.length) return null;
                  return (
                    <div key={block.layerKey} className="space-y-ds-2">
                      <div className="text-ds-caption uppercase tracking-wide text-ds-text-tertiary">{title}</div>
                      {block.hits.map((hit, idx) => (
                        <Card key={`${block.layerKey}-${hit.layerId}-${idx}`} padding="sm">
                          <p className="text-ds-subtitle text-ds-text-primary">
                            {hit.value ||
                              TABLE_LABEL_BY_ID[hit.layerName] ||
                              TABLE_LABEL_BY_ID[hit.layerId] ||
                              hit.layerName ||
                              `Feature (${hit.layerId})`}
                          </p>
                          {(hit.layerName || hit.layerId) && hit.value ? (
                            <p className="text-ds-small text-ds-text-secondary">
                              {TABLE_LABEL_BY_ID[hit.layerName] || TABLE_LABEL_BY_ID[hit.layerId] || hit.layerName}
                            </p>
                          ) : null}
                          <AttributeTable attrs={hit.attributes} />
                          {onShowNearbyFacilities ? (
                            <button
                              type="button"
                              onClick={() => {
                                const attrs = hit.attributes || {};
                                const featureId = attrs.id ?? attrs.objectid ?? attrs.gid ?? null;
                                const tableId = hit.layerName || hit.layerId;
                                const zoneRef =
                                  tableId && featureId != null ? `${tableId}:${featureId}` : featureId != null ? String(featureId) : null;
                                onShowNearbyFacilities({
                                  id: zoneRef,
                                  name: hit.value || hit.layerName || `Feature ${hit.layerId}`,
                                  layerKey: block.layerKey,
                                  lng,
                                  lat,
                                });
                              }}
                              className="mt-ds-2 text-ds-body-med text-ds-accent-text hover:underline focus-visible:outline-none focus-visible:shadow-ds-focus"
                            >
                              View nearby facilities
                            </button>
                          ) : null}
                        </Card>
                      ))}
                    </div>
                  );
                })
              : null}
          </div>
        </Panel>
      </div>
    </>
  );
}
