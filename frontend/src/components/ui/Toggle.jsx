/**
 * Pill switch for layer visibility, filters, and settings.
 */
export function Toggle({ checked = false, onChange, label, ariaLabel, size = 'md', disabled = false, id, className = '' }) {
  const isSm = size === 'sm';
  const trackW = isSm ? 'w-8' : 'w-10';
  const trackH = isSm ? 'h-4' : 'h-5';
  const knob = isSm ? 'h-3 w-3' : 'h-4 w-4';
  const travel = isSm ? 'translate-x-4' : 'translate-x-5';
  const accessibleName = ariaLabel || label;

  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-ds-2 ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className}`}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={accessibleName}
        disabled={disabled}
        onClick={() => !disabled && onChange?.(!checked)}
        className={[
          'relative shrink-0 rounded-ds-full border transition-colors duration-ds-fast ease-ds focus-visible:outline-none focus-visible:shadow-ds-focus',
          trackW,
          trackH,
          checked ? 'border-ds-accent bg-ds-accent' : 'border-ds-border-strong bg-ds-surface-sunken',
        ].join(' ')}
      >
        <span
          className={[
            'absolute left-0.5 top-0.5 rounded-ds-full bg-ds-surface-raised shadow-ds-xs transition-transform duration-ds-fast ease-ds',
            knob,
            checked ? travel : 'translate-x-0',
          ].join(' ')}
        />
      </button>
      {label ? <span className="text-ds-body text-ds-text-primary">{label}</span> : null}
    </label>
  );
}

export const Switch = Toggle;
