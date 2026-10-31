import { Bell, ChevronDown, Check, Hexagon, Home, Languages, Moon, Sun, UserCircle } from 'lucide-react';
import { useLangStore, useT } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IconButton } from '../components/ui/IconButton';
import { GlobalSearch } from './GlobalSearch';
import { useDashboardStore } from '../stores/useDashboardStore';
import { layout } from '../design-system/tokens';
import { getProfile } from '../services/auth';
import { listNotifications } from '../services/portal';

const WORKSPACES = [
  { id: 'explore', label: 'Explore' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'ai', label: 'AI Insights' },
  { id: 'reports', label: 'Reports' },
  { id: 'data', label: 'Data Management' },
  { id: 'collaboration', label: 'Collaboration' },
  // Admin-only. The rail and AdminPanel were already built against an `admin` workspace,
  // but nothing could ever select it, so the whole console was unreachable.
  { id: 'admin', label: 'Admin console', adminOnly: true },
];

export function TopNavigation({ onSearchSelect }) {
  const activeWorkspace = useDashboardStore((s) => s.activeWorkspace);
  const activateWorkspace = useDashboardStore((s) => s.activateWorkspace);
  const setActiveLeftTab = useDashboardStore((s) => s.setActiveLeftTab);
  const leftCollapsed = useDashboardStore((s) => s.leftCollapsed);
  const toggleLeft = useDashboardStore((s) => s.toggleLeft);
  const basemapId = useDashboardStore((s) => s.basemapId);
  const setBasemapId = useDashboardStore((s) => s.setBasemapId);
  const setWelcomeOpen = useDashboardStore((s) => s.setWelcomeOpen);
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const t = useT();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileLabel, setProfileLabel] = useState('Investor');
  const [isAdmin, setIsAdmin] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const dropdownRef = useRef(null);
  const notesRef = useRef(null);

  const notificationsQuery = useQuery({
    queryKey: ['portal-notifications'],
    queryFn: listNotifications,
    staleTime: 1000 * 30,
  });

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
      if (notesRef.current && !notesRef.current.contains(event.target)) {
        setNotesOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    getProfile()
      .then((profile) => {
        const prefix = profile.display_name || String(profile.email || '').split('@')[0];
        setProfileLabel(prefix === 'demo' ? 'Demo investor' : prefix || profile.role || 'Investor');
        setIsAdmin(profile.role === 'admin');
      })
      .catch(() => {});
  }, []);

  // Hiding the entry is a courtesy, not the control: every /api/admin route independently
  // requires the admin role, so a non-admin who forces the workspace still gets 403s.
  const workspaces = WORKSPACES.filter((ws) => !ws.adminOnly || isAdmin);
  const activeLabel = WORKSPACES.find((w) => w.id === activeWorkspace)?.label || 'Explore';
  const isDarkBasemap = basemapId === 'dark' || basemapId === 'satellite' || basemapId === 'terrain';

  return (
    <header
      className="z-ds-toolbar flex shrink-0 items-center justify-between border-b border-ds-border bg-ds-surface-raised px-ds-4 shadow-ds-xs"
      style={{ height: layout.toolbarHeight }}
    >
      <div className="flex min-w-0 items-center gap-ds-4">
        <button
          type="button"
          onClick={() => setWelcomeOpen(true)}
          className="flex items-center gap-ds-2 rounded-ds-sm focus-visible:outline-none focus-visible:shadow-ds-focus"
          aria-label={t('nav.home')}
          title={t('nav.home')}
        >
          <Hexagon size={layout.iconButtonGlyph} className="text-ds-accent" strokeWidth={1.75} aria-hidden />
          <span className="hidden text-ds-title text-ds-text-primary sm:inline">LOCATIUM</span>
        </button>

        <div className="hidden h-5 w-px bg-ds-border md:block" />

        {/* Workspaces are an expert concept; phones get the plain home + search instead. */}
        <div className="relative hidden md:block" ref={dropdownRef}>
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
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => {
                    activateWorkspace(ws.id);
                    if (ws.id === 'ai') {
                      window.dispatchEvent(new Event('locatium:open-assistant'));
                    }
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
        <IconButton icon={Home} tooltip={t('nav.home')} onClick={() => setWelcomeOpen(true)} className="hidden sm:inline-grid" />
        <button
          type="button"
          onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}
          className="flex h-8 items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface-sunken px-2 text-xs font-semibold text-ds-text-primary hover:border-ds-accent focus-visible:outline-none focus-visible:shadow-ds-focus"
          aria-label={t('nav.languageTitle')}
          title={t('nav.languageTitle')}
        >
          <Languages size={14} aria-hidden /> {t('nav.language')}
        </button>
        <IconButton
          className="hidden sm:inline-grid"
          icon={isDarkBasemap ? Sun : Moon}
          tooltip={isDarkBasemap ? 'Switch to light basemap' : 'Switch to dark basemap'}
          active={isDarkBasemap}
          onClick={() => setBasemapId(isDarkBasemap ? 'light' : 'dark')}
        />
        <div className="relative" ref={notesRef}>
          <IconButton
            icon={Bell}
            tooltip="Reports and alerts"
            active={notesOpen}
            onClick={() => setNotesOpen((open) => !open)}
          />
          {notesOpen ? (
            <div className="absolute right-0 top-[calc(100%+4px)] z-ds-dropdown w-80 overflow-hidden rounded-ds-md border border-ds-border bg-ds-surface-raised shadow-ds-md">
              <div className="border-b border-ds-border-subtle px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ds-text-secondary">
                Notifications
              </div>
              <div className="max-h-80 overflow-y-auto">
                {(notificationsQuery.data || []).length === 0 ? (
                  <p className="px-3 py-4 text-xs text-ds-text-secondary">No reports or alerts yet. Generate a PDF or save a search to see activity here.</p>
                ) : (
                  (notificationsQuery.data || []).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        activateWorkspace(item.href === 'projects' ? 'collaboration' : 'reports');
                        setNotesOpen(false);
                      }}
                      className="block w-full border-b border-ds-border-subtle px-3 py-2 text-left last:border-b-0 hover:bg-ds-surface-sunken"
                    >
                      <div className="text-xs font-semibold text-ds-text-primary">{item.title}</div>
                      <div className="mt-0.5 truncate text-[11px] text-ds-text-secondary">{item.body}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveLeftTab('settings');
            if (leftCollapsed) toggleLeft();
          }}
          className="ml-ds-2 flex h-8 items-center gap-ds-2 rounded-ds-sm border border-ds-border bg-ds-surface-sunken px-ds-2 text-ds-body-med text-ds-text-primary sm:px-ds-3"
          title={profileLabel}
        >
          <UserCircle size={layout.iconButtonGlyph} className="text-ds-text-secondary" />
          {/* The label is what pushed the header past a 375px viewport. The icon still
              identifies the control, and the title carries the name for everyone else. */}
          <span className="hidden sm:inline">{profileLabel}</span>
        </button>
      </div>
    </header>
  );
}
