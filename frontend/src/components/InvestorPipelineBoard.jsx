import { useState } from 'react';
import { Trash2, MapPin, GripVertical } from 'lucide-react';
import { upsertPipelineItem, deletePipelineItem } from '../services/portal';

const STAGE_LABELS = {
  discovered: 'Discovered',
  shortlisted: 'Shortlisted',
  due_diligence: 'Due diligence',
  negotiation: 'Negotiation',
  closed: 'Closed',
  passed: 'Passed',
};

export function InvestorPipelineBoard({ stages = [], items = [], opportunities = [], onRefresh, onFlyToZone }) {
  const [dragZoneId, setDragZoneId] = useState(null);
  const [notesDraft, setNotesDraft] = useState({});

  const zoneMeta = (zoneId) => {
    const opp = opportunities.find((z) => z.id === zoneId);
    return { name: opp?.name || zoneId, opp };
  };

  async function moveItem(zoneId, stage, notes) {
    await upsertPipelineItem({ zoneId, stage, notes });
    onRefresh?.();
  }

  async function removeItem(id) {
    await deletePipelineItem(id);
    onRefresh?.();
  }

  function handleDrop(stage, event) {
    event.preventDefault();
    if (!dragZoneId) return;
    moveItem(dragZoneId, stage, notesDraft[dragZoneId]);
    setDragZoneId(null);
  }

  return (
    <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">
        Investment pipeline · drag cards between columns
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {stages.map((stage) => {
          const columnItems = items.filter((item) => item.stage === stage);
          return (
            <div
              key={stage}
              className="min-w-[160px] flex-1 rounded-lg bg-ds-surface-sunken p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(stage, e)}
            >
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ds-text-tertiary">
                {STAGE_LABELS[stage] || stage} · {columnItems.length}
              </div>
              <div className="space-y-2">
                {columnItems.map((item) => {
                  const meta = zoneMeta(item.zoneId);
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => setDragZoneId(item.zoneId)}
                      className="rounded-md border border-ds-border-subtle bg-ds-surface-raised p-2"
                    >
                      <div className="flex items-start gap-1">
                        <GripVertical size={12} className="mt-0.5 shrink-0 text-ds-text-tertiary" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-semibold text-ds-text-primary">{meta.name}</div>
                          {meta.opp?.opportunityScore != null ? (
                            <div className="text-[10px] text-ds-warning">Score {meta.opp.opportunityScore}</div>
                          ) : null}
                          {meta.opp?.landValue?.estimatedPerSqYardInr || meta.opp?.landValue?.circleRatePerSqYardInr ? (
                            <div className="text-[10px] text-ds-text-secondary">
                              Land ₹
                              {(
                                meta.opp.landValue.estimatedPerSqYardInr ||
                                meta.opp.landValue.circleRatePerSqYardInr
                              ).toLocaleString('en-IN')}
                              /sq yd
                              {meta.opp.landValue.confidence ? ` · ${meta.opp.landValue.confidence}` : ''}
                            </div>
                          ) : null}
                        </div>
                        <button type="button" onClick={() => removeItem(item.id)} className="text-ds-text-tertiary hover:text-ds-danger">
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        defaultValue={item.notes || ''}
                        placeholder="Notes…"
                        onBlur={(e) => moveItem(item.zoneId, item.stage, e.target.value)}
                        onChange={(e) => setNotesDraft((c) => ({ ...c, [item.zoneId]: e.target.value }))}
                        className="mt-1 w-full rounded border border-ds-border-subtle bg-ds-surface-sunken px-1 py-1 text-[10px] text-ds-text-primary"
                      />
                      <div className="mt-1 flex gap-1">
                        <select
                          value={item.stage}
                          onChange={(e) => moveItem(item.zoneId, e.target.value, item.notes)}
                          className="h-7 min-w-0 flex-1 rounded border border-ds-border-subtle bg-ds-surface-sunken px-1 text-[10px]"
                        >
                          {stages.map((s) => (
                            <option key={s} value={s}>
                              {STAGE_LABELS[s] || s}
                            </option>
                          ))}
                        </select>
                        {meta.opp?.center ? (
                          <button
                            type="button"
                            onClick={() => onFlyToZone?.(meta.opp)}
                            className="flex h-7 w-7 items-center justify-center rounded border border-ds-border-subtle hover:border-ds-accent"
                          >
                            <MapPin size={12} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export { STAGE_LABELS };
