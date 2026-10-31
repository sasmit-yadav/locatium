const PADDING = {
  sm: 'p-ds-2',
  md: 'p-ds-3',
  lg: 'p-ds-4',
};

/**
 * Generic content block for panels, dashboards, and modals.
 */
export function Card({
  padding = 'md',
  interactive = false,
  selected = false,
  className = '',
  children,
  onClick,
  ...props
}) {
  const Comp = interactive || onClick ? 'button' : 'div';
  const interactiveProps =
    Comp === 'button'
      ? { type: 'button', onClick }
      : { onClick };

  return (
    <Comp
      {...interactiveProps}
      {...props}
      className={[
        'w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised text-left transition-colors duration-ds-fast ease-ds',
        PADDING[padding] || PADDING.md,
        interactive || onClick ? 'cursor-pointer hover:bg-ds-surface-sunken focus-visible:outline-none focus-visible:shadow-ds-focus' : '',
        selected ? 'border-l-2 border-l-ds-accent bg-ds-accent-subtle' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Comp>
  );
}
