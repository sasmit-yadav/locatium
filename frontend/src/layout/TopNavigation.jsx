import { Bell, ChevronDown, Check, Hexagon, Moon, Sun, UserCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from '../components/ui/IconButton';
import { GlobalSearch } from './GlobalSearch';
import { useDashboardStore } from '../stores/useDashboardStore';
import { layout } from '../design-system/tokens';

const WORKSPACES = [
  { id: 'explore', label: 'Explore' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'ai', label: 'AI Insights' },
  { id: 'reports', label: 'Reports' },
  { id: 'data', label: 'Data Management' },
  { id: 'collaboration', label: 'Collaboration' },
  { id: 'admin', label: 'Admin' },
];

export function TopNavigation({ onSearchSelect }) {
  const activeWorkspace = useDashboardStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useDashboardStore((s) => s.setActiveWorkspace);
  const basemapId = useDashboardStore((s) => s.basemapId);
  const setBasemapId = useDashboardStore((s) => s.setBasemapId);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeLabel = WORKSPACES.find((w) => w.id === activeWorkspace)?.label || 'Explore';
  const isDarkBasemap = basemapId === 'dark' || basemapId === 'satellite' || basemapId === 'terrain';

  return (
    <header
      className="z-ds-toolbar flex shrink-0 items-center justify-between border-b border-ds-border bg-ds-surface-raised px-ds-4 shadow-ds-xs"
      style={{ height: layout.toolbarHeight }}
    >
      <div className="flex min-w-0 items-center gap-ds-4">
        <div className="flex items-center gap-ds-2">
          <Hexagon size={layout.iconButtonGlyph} className="text-ds-accent" strokeWidth={1.75} aria-hidden />
          <div className="text-ds-title text-ds-text-primary">LOCATIUM</div>
        </div>

        <div className="h-5 w-px bg-ds-border" />

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex h-8 items-center gap-ds-2 rounded-ds-sm border border-ds-border bg-ds-surface-sunken px-ds-3 text-ds-body-med text-ds-text-primary transition-colors duration-ds-fast ease-ds hover:bg-ds-accent-subtle focus-visible:outline-none focus-visible:shadow-ds-focus"
          >
            {activeLabel}
            <ChevronDown size={layout.iconInline} className={`text-ds-text-secondary transition ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {dropdownOpen ? (
            <div className="absolute left-0 top-[calc(100%+4px)] z-ds-dropdown w-48 overflow-hidden rounded-ds-md border border-ds-border bg-ds-surface-raised py-ds-1 shadow-ds-md">
              {WORKSPACES.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => {
                    setActiveWorkspace(ws.id);
                    setDropdownOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-ds-3 py-ds-2 text-left text-ds-body text-ds-text-primary hover:bg-ds-surface-sunken"
                >
                  {ws.label}
                  {activeWorkspace === ws.id ? <Check size={layout.iconInline} className="text-ds-accent" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-ds-4 flex max-w-xl flex-1 items-center justify-center">
        <GlobalSearch onSelect={onSearchSelect} />
      </div>

      <div className="flex items-center gap-ds-1">
        <IconButton
          icon={isDarkBasemap ? Sun : Moon}
          tooltip={isDarkBasemap ? 'Switch to light basemap' : 'Switch to dark basemap'}
          active={isDarkBasemap}
          onClick={() => setBasemapId(isDarkBasemap ? 'light' : 'dark')}
        />
        <IconButton icon={Bell} tooltip="Notifications" />
        <button
          type="button"
          className="ml-ds-2 flex h-8 items-center gap-ds-2 rounded-ds-sm border border-ds-border bg-ds-surface-sunken px-ds-3 text-ds-body-med text-ds-text-primary"
        >
          <UserCircle size={layout.iconButtonGlyph} className="text-ds-text-secondary" />
          Analyst
        </button>
      </div>
    </header>
  );
}
