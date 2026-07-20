import { Tooltip } from './Tooltip';
import { layout } from '../../design-system/tokens';

/**
 * 32×32 icon control for toolbar, panel chrome, and map controls.
 * Requires tooltip / aria-label (Section 7).
 */
export function IconButton({
  icon: Icon,
  onClick,
  active = false,
  tooltip,
  'aria-label': ariaLabel,
  disabled = false,
  className = '',
  type = 'button',
  ...props
}) {
  const label = tooltip || ariaLabel;
  if (!label && import.meta.env.DEV) {
    console.warn('[IconButton] Provide tooltip or aria-label for accessible name.');
  }

  const button = (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active || undefined}
      className={[
        'inline-grid place-items-center rounded-ds-sm transition-colors duration-ds-fast ease-ds',
        'h-ds-icon-btn w-ds-icon-btn',
        'focus-visible:outline-none focus-visible:shadow-ds-focus',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'bg-ds-accent-subtle text-ds-accent'
          : 'bg-transparent text-ds-text-secondary hover:bg-ds-surface-sunken hover:text-ds-text-primary',
        className,
      ].join(' ')}
      {...props}
    >
      {Icon ? <Icon size={layout.iconButtonGlyph} strokeWidth={1.75} aria-hidden /> : null}
    </button>
  );

  if (!tooltip) return button;
  return <Tooltip content={tooltip}>{button}</Tooltip>;
}
