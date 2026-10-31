/**
 * Expandable score breakdown — plain-language component scores for investors.
 */
export function ScoreBreakdown({ breakdown = [] }) {
  if (!breakdown.length) return null;

  return (
    <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">
        What drives this score
      </div>
      <div className="mt-3 space-y-2">
        {breakdown.map((row) => (
          <details
            key={row.key}
            className="group rounded-lg border border-ds-border-subtle bg-ds-surface-sunken open:border-ds-accent/30"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="font-semibold text-ds-text-primary">{row.component}</span>
              <span className="text-ds-text-secondary">
                {row.key === 'overall' ? (
                  <strong className="text-ds-text-primary">{row.score}/100</strong>
                ) : (
                  <strong className="text-ds-text-primary">{row.score}/100</strong>
                )}
              </span>
            </summary>
            <div className="border-t border-ds-border-subtle px-3 py-2 text-xs leading-5 text-ds-text-secondary">
              {row.note ? <p>{row.note}</p> : null}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
