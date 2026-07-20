import { Command, Search } from 'lucide-react';
import { useDashboardStore } from '../stores/useDashboardStore';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';
import { layout } from '../design-system/tokens';

export function GlobalSearch() {
  const setOpen = useDashboardStore((s) => s.setCommandPaletteOpen);

  useKeyboardShortcut(() => setOpen(true));

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Search commands, layers, and places"
      className="group flex h-9 w-full max-w-md items-center justify-between rounded-ds-sm border border-ds-border bg-ds-surface-sunken px-ds-3 text-ds-body text-ds-text-secondary transition-colors duration-ds-fast ease-ds hover:border-ds-border-strong hover:text-ds-text-primary focus-visible:outline-none focus-visible:shadow-ds-focus"
    >
      <div className="flex items-center gap-ds-2">
        <Search size={layout.iconInline} className="text-ds-text-tertiary" aria-hidden />
        <span>Search places, layers, commands…</span>
      </div>
      <span className="flex items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface-raised px-ds-2 py-0.5 text-ds-caption text-ds-text-tertiary">
        <Command size={10} aria-hidden /> K
      </span>
    </button>
  );
}
