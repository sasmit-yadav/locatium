import { Command, Search } from 'lucide-react';
import { useDashboardStore } from '../stores/useDashboardStore';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';
import { layout } from '../design-system/tokens';
import { useT } from '../i18n';

export function GlobalSearch() {
  const setOpen = useDashboardStore((s) => s.setCommandPaletteOpen);
  const t = useT();

  useKeyboardShortcut(() => setOpen(true));

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Search commands, layers, and places"
      className="group flex h-9 w-full max-w-md items-center justify-between rounded-ds-sm border border-ds-border bg-ds-surface-sunken px-ds-3 text-ds-body text-ds-text-secondary transition-colors duration-ds-fast ease-ds hover:border-ds-border-strong hover:text-ds-text-primary focus-visible:outline-none focus-visible:shadow-ds-focus"
    >
      <div className="flex min-w-0 items-center gap-ds-2">
        <Search size={layout.iconInline} className="shrink-0 text-ds-text-tertiary" aria-hidden />
        {/* Narrow screens get the short form; the full phrase wrapped onto three lines
            and pushed the header controls out of the viewport. */}
        <span className="truncate sm:hidden">{t('nav.searchShort')}</span>
        <span className="hidden truncate sm:inline">{t('nav.searchLong')}</span>
      </div>
      {/* The shortcut hint is meaningless without a physical keyboard. */}
      <span className="hidden shrink-0 items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface-raised px-ds-2 py-0.5 text-ds-caption text-ds-text-tertiary sm:flex">
        <Command size={10} aria-hidden /> K
      </span>
    </button>
  );
}
