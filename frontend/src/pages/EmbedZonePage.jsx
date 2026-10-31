import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, MapPin } from 'lucide-react';
import { getPublicZoneCard } from '../services/portal';

function formatInr(value) {
  if (value == null || Number.isNaN(Number(value))) return 'N/A';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

export function EmbedZonePage({ zoneId }) {
  const [state, setState] = useState({ loading: true, card: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    getPublicZoneCard(zoneId)
      .then((card) => {
        if (!cancelled) setState({ loading: false, card, error: '' });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, card: null, error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [zoneId]);

  const card = state.card;
  const score = card?.opportunity?.score;

  return (
    <main className="min-h-screen bg-ds-surface-base px-4 py-8 text-ds-text-primary">
      <div className="mx-auto max-w-lg">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-ds-accent hover:underline">
          <ArrowLeft size={16} />
          Open LOCATIUM
        </a>

        {state.loading ? (
          <div className="mt-24 flex items-center justify-center gap-3 text-ds-text-secondary">
            <Loader2 className="animate-spin" size={20} />
            Loading zone card…
          </div>
        ) : state.error ? (
          <section className="mt-12 rounded-2xl border border-ds-danger/30 bg-ds-surface-raised p-8">
            <h1 className="text-xl font-bold">Zone unavailable</h1>
            <p className="mt-2 text-sm text-ds-text-secondary">{state.error}</p>
          </section>
        ) : (
          <article className="mt-8 rounded-2xl border border-ds-border bg-ds-surface-raised p-6 shadow-ds-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ds-accent">LOCATIUM zone card</div>
            <h1 className="mt-2 text-2xl font-bold">{card.zone.name}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-ds-text-secondary">
              <MapPin size={14} />
              {card.zone.district} · {card.zone.zoneType || card.zone.type}
            </p>
            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ds-text-tertiary">Opportunity</div>
                <div className="text-3xl font-black">{score ?? '—'}</div>
                <div className="text-xs text-ds-text-secondary">{card.opportunity?.verdict || 'Screening only'}</div>
              </div>
              <div className="text-right text-sm">
                <div className="text-[10px] uppercase tracking-wider text-ds-text-tertiary">Land band</div>
                <div className="font-semibold">{formatInr(card.landValue?.estimatedPerSqYardInr)}/sq yd</div>
                <div className="text-[11px] text-ds-text-tertiary">{card.landValue?.method?.replace(/_/g, ' ') || 'n/a'}</div>
              </div>
            </div>
            {card.keyRisk ? <p className="mt-4 text-xs text-ds-warning">Watch: {card.keyRisk}</p> : null}
            <p className="mt-5 text-[11px] leading-5 text-ds-text-tertiary">{card.disclaimer}</p>
          </article>
        )}
      </div>
    </main>
  );
}
