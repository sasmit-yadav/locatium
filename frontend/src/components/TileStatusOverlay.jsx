export function TileStatusOverlay({ loading, error, onDismissError }) {
  if (!loading && !error) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-[1100] flex justify-center px-3 sm:top-4">
      {loading ? (
        <div
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/12 bg-black/75 px-3 py-1.5 text-xs text-white/85 shadow-lg backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-kp-teal/30 border-t-kp-teal" />
          Loading map tiles…
        </div>
      ) : null}

      {error ? (
        <div
          className="pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-950/90 px-3 py-2 text-xs text-amber-50 shadow-lg"
          role="alert"
        >
          <span className="min-w-0 flex-1 leading-relaxed">
            <strong className="font-semibold">Tile load issue. </strong>
            {error}
          </span>
          {onDismissError ? (
            <button
              type="button"
              onClick={onDismissError}
              className="shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-100/90 transition hover:bg-amber-500/15"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
