import { Search, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { layout } from '../../design-system/tokens';
import { Card } from './Card';

/**
 * Place / zone / facility search with dropdown results.
 */
export function SearchInput({
  placeholder = 'Search…',
  value: valueProp,
  onChange,
  onSearch,
  results = [],
  renderResult,
  loading = false,
  className = '',
  emptyMessage = 'No matches — try a different place name',
  showResults = true,
}) {
  const id = useId();
  const [internal, setInternal] = useState('');
  const [open, setOpen] = useState(false);
  const value = valueProp ?? internal;

  function setValue(next) {
    if (valueProp === undefined) setInternal(next);
    onChange?.(next);
    onSearch?.(next);
    setOpen(true);
  }

  return (
    <div className={`relative w-full ${className}`}>
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <div className="relative flex items-center">
        <Search
          size={layout.iconInline}
          className="pointer-events-none absolute left-ds-3 text-ds-text-tertiary"
          aria-hidden
        />
        <input
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so result click registers
            window.setTimeout(() => setOpen(false), 150);
          }}
          className="h-9 w-full rounded-ds-sm border border-ds-border bg-ds-surface-sunken py-ds-2 pl-9 pr-ds-3 text-ds-body text-ds-text-primary placeholder:text-ds-text-tertiary outline-none transition-shadow duration-ds-fast ease-ds focus:border-ds-accent focus:shadow-ds-focus"
        />
        {loading ? (
          <Loader2
            size={layout.iconInline}
            className="absolute right-ds-3 animate-spin text-ds-text-tertiary"
            aria-hidden
          />
        ) : null}
      </div>

      {showResults && open && value && (results.length > 0 || !loading) ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-ds-dropdown max-h-64 overflow-y-auto rounded-ds-md border border-ds-border bg-ds-surface-raised p-ds-1 shadow-ds-md"
        >
          {results.length === 0 && !loading ? (
            <div className="px-ds-3 py-ds-4 text-ds-small text-ds-text-secondary">{emptyMessage}</div>
          ) : (
            results.map((item, index) =>
              renderResult ? (
                <div key={item.id ?? index} role="option">
                  {renderResult(item, index)}
                </div>
              ) : (
                <Card key={item.id ?? index} interactive padding="sm" className="border-0 shadow-none">
                  <div className="text-ds-body-med text-ds-text-primary">{item.label ?? item.name}</div>
                  {item.type ? <div className="text-ds-small text-ds-text-secondary">{item.type}</div> : null}
                </Card>
              )
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
