import { useEffect, useState } from 'react';
import { ArrowLeft, BriefcaseBusiness, Loader2, MapPin } from 'lucide-react';
import { getSharedPortfolio } from '../services/portal';
import { getInvestorZoneAnalysis } from '../services/investor';

function scoreTone(score) {
  if (score >= 75) return 'text-ds-success';
  if (score >= 55) return 'text-ds-warning';
  return 'text-ds-text-secondary';
}

export function SharedPortfolioPage({ token }) {
  const [state, setState] = useState({ loading: true, portfolio: null, zones: [], error: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const portfolio = await getSharedPortfolio(token);
        const zones = await Promise.all(
          (portfolio.zoneIds || []).map((zoneId) =>
            getInvestorZoneAnalysis({ zoneId }).catch(() => ({ zone: { id: zoneId, name: zoneId } }))
          )
        );
        if (!cancelled) setState({ loading: false, portfolio, zones, error: '' });
      } catch (error) {
        if (!cancelled) setState({ loading: false, portfolio: null, zones: [], error: error.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-ds-surface-base px-4 py-8 text-ds-text-primary sm:px-8">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-ds-accent hover:underline">
          <ArrowLeft size={16} />
          Open LOCATIUM map
        </a>

        {state.loading ? (
          <div className="mt-24 flex items-center justify-center gap-3 text-ds-text-secondary">
            <Loader2 className="animate-spin" size={20} />
            Loading shared portfolio…
          </div>
        ) : state.error ? (
          <section className="mt-12 rounded-2xl border border-ds-danger/30 bg-ds-surface-raised p-8">
            <h1 className="text-xl font-bold">Portfolio unavailable</h1>
            <p className="mt-2 text-sm text-ds-text-secondary">{state.error}</p>
          </section>
        ) : (
          <>
            <header className="mt-8 rounded-2xl border border-ds-border bg-ds-surface-raised p-6 shadow-ds-sm">
              <div className="flex items-center gap-3 text-ds-accent">
                <BriefcaseBusiness size={24} />
                <span className="text-xs font-bold uppercase tracking-[0.18em]">Shared investor portfolio</span>
              </div>
              <h1 className="mt-3 text-3xl font-bold">{state.portfolio.name}</h1>
              {state.portfolio.notes ? (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-ds-text-secondary">{state.portfolio.notes}</p>
              ) : null}
              <p className="mt-4 text-xs text-ds-text-tertiary">
                {state.zones.length} shortlisted {state.zones.length === 1 ? 'location' : 'locations'} · live LOCATIUM data
              </p>
            </header>

            <section className="mt-6 grid gap-4 md:grid-cols-2">
              {state.zones.map((analysis) => {
                const zone = analysis.zone || {};
                const score = analysis.opportunity?.opportunityScore;
                return (
                  <article key={zone.id} className="rounded-2xl border border-ds-border bg-ds-surface-raised p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="font-bold">{zone.name || zone.id}</h2>
                        <p className="mt-1 flex items-center gap-1 text-xs text-ds-text-secondary">
                          <MapPin size={13} />
                          {zone.district || 'Haryana'} · {zone.zoneType || zone.type || 'Mapped zone'}
                        </p>
                      </div>
                      {score != null ? (
                        <div className={`text-right ${scoreTone(score)}`}>
                          <div className="text-2xl font-black tabular-nums">{score}</div>
                          <div className="text-[10px] uppercase tracking-wide">score</div>
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-ds-text-secondary">
                      {analysis.recommendation?.positives?.[0] ||
                        'Open this location in LOCATIUM for the live spatial analysis.'}
                    </p>
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
