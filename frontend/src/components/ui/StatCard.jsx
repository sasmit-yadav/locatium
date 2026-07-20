import { layout } from '../../design-system/tokens';

/**
 * Metric tile — icon tint only; no colored card backgrounds.
 */
export function StatCard({ icon: Icon, value, label, trend, accentColor, className = '' }) {
  return (
    <div className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised p-ds-3 ${className}`}>
      {Icon ? (
        <Icon
          size={layout.iconButtonGlyph}
          className="mb-ds-2"
          style={accentColor ? { color: accentColor } : undefined}
          aria-hidden
        />
      ) : null}
      <div className="flex items-baseline gap-ds-2">
        <div className="text-ds-stat text-ds-text-primary">{value}</div>
        {trend != null && trend !== '' ? (
          <span className="text-ds-small text-ds-text-secondary">{trend}</span>
        ) : null}
      </div>
      {label ? <div className="mt-ds-1 text-ds-small text-ds-text-secondary">{label}</div> : null}
    </div>
  );
}
