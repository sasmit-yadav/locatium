/**
 * Shared floating strip of IconButtons (zoom, basemap, panel triggers).
 * Positions: bottom-right (zoom) or top-right (panel triggers) by default.
 */
export function MapControlCluster({
  position = 'bottom-right',
  orientation = 'vertical',
  className = '',
  children,
}) {
  const positionClass =
    position === 'top-right'
      ? 'top-ds-4 right-ds-4'
      : position === 'top-left'
        ? 'top-ds-4 left-ds-4'
        : position === 'bottom-left'
          ? 'bottom-ds-4 left-ds-4'
          : 'bottom-ds-4 right-ds-4';

  return (
    <div
      role="toolbar"
      className={[
        'z-ds-map-controls absolute flex overflow-hidden rounded-ds-md border border-ds-border bg-ds-surface-raised shadow-ds-sm',
        orientation === 'horizontal' ? 'flex-row' : 'flex-col',
        positionClass,
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
