import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { layout } from '../../design-system/tokens';
import { usePrefersReducedMotion } from '../../design-system/usePrefersReducedMotion';
import { IconButton } from './IconButton';

const ANCHOR_CLASSES = {
  'top-left': 'top-ds-4 left-ds-4',
  'top-right': 'top-ds-4 right-ds-4',
  'bottom-left': 'bottom-ds-4 left-ds-4',
  'bottom-right': 'bottom-ds-4 right-ds-4',
  point: '',
  'bottom-sheet': 'inset-x-0 bottom-0 rounded-b-none rounded-t-ds-lg max-w-none w-full',
};

/**
 * Floating card for map-anchored panels (Layers, Identify, Zone Facilities, filters).
 * Archetype: map-first. Below 768px, callers should pass anchor="bottom-sheet".
 */
export function Panel({
  title,
  icon: Icon,
  onClose,
  collapsible = false,
  collapsed: collapsedProp,
  onCollapsedChange,
  anchor = 'top-right',
  width = layout.panelWidth,
  className = '',
  children,
  style,
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = collapsedProp ?? internalCollapsed;

  function toggleCollapse() {
    const next = !collapsed;
    if (collapsedProp === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  }

  const isSheet = anchor === 'bottom-sheet';
  const positionClass = ANCHOR_CLASSES[anchor] || ANCHOR_CLASSES['top-right'];

  return (
    <aside
      role="complementary"
      aria-label={title || 'Panel'}
      className={[
        'z-ds-floating-panel flex flex-col overflow-hidden border border-ds-border bg-ds-surface-raised shadow-ds-sm',
        isSheet ? 'rounded-t-ds-lg' : 'rounded-ds-md',
        !isSheet && anchor !== 'point' ? `absolute ${positionClass}` : '',
        isSheet ? `fixed ${positionClass}` : '',
        reducedMotion ? '' : 'animate-ds-panel-in',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: isSheet ? '100%' : width,
        maxHeight: isSheet ? '85vh' : 'calc(100vh - 96px)',
        ...style,
      }}
    >
      {(title || onClose || collapsible || Icon) && (
        <header className="flex shrink-0 items-center gap-ds-2 border-b border-ds-border-subtle px-ds-4 py-ds-3">
          {Icon ? <Icon size={layout.iconButtonGlyph} className="shrink-0 text-ds-text-secondary" aria-hidden /> : null}
          {title ? <h2 className="min-w-0 flex-1 truncate text-ds-title text-ds-text-primary">{title}</h2> : <div className="flex-1" />}
          {collapsible ? (
            <IconButton
              icon={collapsed ? ChevronDown : ChevronUp}
              onClick={toggleCollapse}
              tooltip={collapsed ? 'Expand panel' : 'Collapse panel'}
            />
          ) : null}
          {onClose ? <IconButton icon={X} onClick={onClose} tooltip="Close" /> : null}
        </header>
      )}
      {!collapsed ? <div className="min-h-0 flex-1 overflow-y-auto">{children}</div> : null}
    </aside>
  );
}
