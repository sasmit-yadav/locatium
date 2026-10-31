import { TooltipSideContext } from './tooltip-context';

/**
 * Shared floating strip of IconButtons (zoom, basemap, panel triggers).
 * Positions: bottom-right (zoom) or top-right (panel triggers) by default.
 */
export function MapControlCluster({
  position = 'bottom-right',
  orientation = 'vertical',
  className = '',
  clip = false,
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

  // Vertical strips sit on a map edge: open tooltips toward the map, not over siblings.
  const tooltipSide =
    orientation === 'vertical' ? (position.endsWith('left') ? 'right' : 'left') : position.startsWith('top') ? 'bottom' : 'top';

  return (
    <TooltipSideContext.Provider value={tooltipSide}>
    <div
      role="toolbar"
      className={[
        // Clipping keeps button hovers inside the rounded corners, but it also hides any
        // popover or tooltip that opens outside the strip, so strips stay unclipped by default.
        'z-ds-map-controls absolute flex rounded-ds-md border border-ds-border bg-ds-surface-raised shadow-ds-sm',
        clip ? 'overflow-hidden' : 'overflow-visible',
        orientation === 'horizontal' ? 'flex-row' : 'flex-col',
        positionClass,
        className,
      ].join(' ')}
    >
      {children}
    </div>
    </TooltipSideContext.Provider>
  );
}
