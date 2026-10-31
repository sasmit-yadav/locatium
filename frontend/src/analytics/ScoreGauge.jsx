import { colors } from '../design-system/tokens';
import { scoreWordKey, useT } from '../i18n';

/**
 * Horizontal score bar — preferred over radial gauges (ui_enhance.md §6.3).
 * Uses dataSequential bands: 0–40 needs improvement, 40–70 mid, 70–100 strong.
 */
export function ScoreGauge({ label, value = 0, suffix = '/100', tooltip }) {
  const t = useT();
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  // Same Good / Average / Weak words (and thresholds) as every other score in the app.
  const band = t(`score.${scoreWordKey(pct)}`);
  const fill =
    pct >= 70
      ? colors.dataSequential.high
      : pct >= 40
        ? colors.dataSequential.mid
        : colors.dataSequential.low;

  return (
    <div className="rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised p-ds-3">
      <div className="flex items-center justify-between gap-ds-2">
        <div className="flex items-center gap-1 text-ds-caption uppercase tracking-wide text-ds-text-tertiary">
          {label}
          {tooltip ? (
            <span
              title={tooltip}
              className="cursor-help rounded-full border border-ds-border-subtle px-1 text-[9px] normal-case text-ds-text-tertiary"
            >
              ?
            </span>
          ) : null}
        </div>
        <div className="text-ds-small text-ds-text-secondary">{band}</div>
      </div>
      <div className="mt-ds-2 flex items-baseline gap-ds-1">
        <span className="text-ds-stat text-ds-text-primary">{Math.round(pct)}</span>
        <span className="text-ds-small text-ds-text-secondary">{suffix}</span>
      </div>
      <div
        className="mt-ds-2 h-1.5 w-full overflow-hidden rounded-ds-full"
        style={{ backgroundColor: colors.border.subtle }}
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-ds-full transition-[width] duration-ds-base ease-ds"
          style={{ width: `${pct}%`, backgroundColor: fill === colors.dataSequential.low ? colors.text.tertiary : fill }}
        />
      </div>
    </div>
  );
}
