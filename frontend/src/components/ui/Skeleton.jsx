/**
 * Quiet loading placeholder — no scan/radar animation.
 */
export function Skeleton({ variant = 'text', count = 1, className = '' }) {
  const items = Array.from({ length: Math.max(1, count) });

  const base =
    'animate-pulse rounded-ds-sm bg-ds-surface-sunken motion-reduce:animate-none';

  const shape =
    variant === 'card'
      ? 'h-24 w-full'
      : variant === 'row'
        ? 'h-10 w-full'
        : 'h-3 w-full max-w-[12rem]';

  return (
    <div className={`flex flex-col gap-ds-2 ${className}`} aria-hidden>
      {items.map((_, i) => (
        <div key={i} className={`${base} ${shape}`} />
      ))}
    </div>
  );
}
