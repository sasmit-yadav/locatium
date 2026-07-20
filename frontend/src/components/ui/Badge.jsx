const VARIANT = {
  default: 'bg-ds-surface-sunken text-ds-text-secondary',
  success: 'bg-ds-success-subtle text-ds-success',
  warning: 'bg-ds-warning-subtle text-ds-warning',
  danger: 'bg-ds-danger-subtle text-ds-danger',
  accent: 'bg-ds-accent-subtle text-ds-accent-text',
};

/**
 * Small pill for tags, layer groups, and status.
 */
export function Badge({ children, variant = 'default', className = '' }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-ds-full px-ds-2 py-0.5 text-ds-caption',
        VARIANT[variant] || VARIANT.default,
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}

export const Chip = Badge;
