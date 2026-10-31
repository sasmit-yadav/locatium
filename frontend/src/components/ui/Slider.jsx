import { useId } from 'react';
import { colors } from '../../design-system/tokens';

/**
 * Thin track opacity / filter slider.
 */
export function Slider({
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  disabled = false,
  className = '',
}) {
  const id = useId();
  const pct = ((Number(value) - min) / (max - min || 1)) * 100;

  return (
    <div className={`flex w-full flex-col gap-ds-1 ${className}`}>
      {label ? (
        <label htmlFor={id} className="text-ds-caption uppercase tracking-wide text-ds-text-tertiary">
          {label}
        </label>
      ) : (
        <label htmlFor={id} className="sr-only">
          Slider
        </label>
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(Number(e.target.value))}
        className="ds-slider h-1.5 w-full cursor-pointer appearance-none rounded-ds-full bg-ds-border-strong disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-ds-focus"
        style={{
          background: `linear-gradient(to right, ${colors.accent.default} ${pct}%, ${colors.border.strong} ${pct}%)`,
        }}
      />
    </div>
  );
}
