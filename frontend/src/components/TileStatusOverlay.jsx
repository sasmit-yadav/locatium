export function TileStatusOverlay({ loading, error, onDismissError }) {
  if (!loading && !error) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-ds-3 z-ds-map-controls flex justify-center px-ds-3 sm:top-ds-4">
      {loading ? (
        <div
          className="pointer-events-auto flex items-center gap-ds-2 rounded-ds-full border border-ds-border bg-ds-surface-raised px-ds-3 py-ds-1.5 text-ds-small text-ds-text-secondary shadow-ds-sm"
          role="status"
          aria-live="polite"
        >
          <span
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-ds-border-strong border-t-ds-accent"
            aria-hidden
          />
          Loading map tiles…
        </div>
      ) : null}

      {error ? (
        <div
          className="pointer-events-auto flex max-w-md items-start gap-ds-2 rounded-ds-md border border-ds-warning/40 bg-ds-warning-subtle px-ds-3 py-ds-2 text-ds-small text-ds-warning shadow-ds-sm"
          role="alert"
        >
          <span className="min-w-0 flex-1 leading-relaxed">
            <strong className="font-medium text-ds-text-primary">Tile load issue. </strong>
            {error}
          </span>
          {onDismissError ? (
            <button
              type="button"
              onClick={onDismissError}
              className="shrink-0 rounded-ds-sm px-ds-2 py-0.5 text-ds-caption text-ds-warning transition hover:bg-ds-surface-raised focus-visible:outline-none focus-visible:shadow-ds-focus"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
