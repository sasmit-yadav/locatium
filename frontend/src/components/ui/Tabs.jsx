/**
 * Underline tabs — thin accent underline on active tab.
 */
export function Tabs({ tabs = [], value, onChange, className = '' }) {
  return (
    <div
      role="tablist"
      className={`flex gap-ds-4 border-b border-ds-border-subtle ${className}`}
    >
      {tabs.map((tab) => {
        const id = typeof tab === 'string' ? tab : tab.id;
        const label = typeof tab === 'string' ? tab : tab.label;
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(id)}
            className={[
              'relative -mb-px pb-ds-2 text-ds-body-med transition-colors duration-ds-fast ease-ds focus-visible:outline-none focus-visible:shadow-ds-focus',
              active ? 'text-ds-text-primary' : 'text-ds-text-secondary hover:text-ds-text-primary',
            ].join(' ')}
          >
            {label}
            {active ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ds-accent" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
