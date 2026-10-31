import { layout } from '../../design-system/tokens';

/**
 * Empty state — invitation to act, not an apology (Section 4).
 */
export function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center px-ds-4 py-ds-8 text-center ${className}`}>
      {Icon ? (
        <Icon size={layout.iconEmpty} className="mb-ds-3 text-ds-text-tertiary" aria-hidden />
      ) : null}
      {title ? <h3 className="text-ds-subtitle text-ds-text-primary">{title}</h3> : null}
      {description ? (
        <p className="mt-ds-1 max-w-xs text-ds-body text-ds-text-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-ds-4">{action}</div> : null}
    </div>
  );
}
