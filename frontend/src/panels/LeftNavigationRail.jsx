import {
  Bookmark,
  Brain,
  Compass,
  Database,
  FileText,
  Layers,
  LineChart,
  MonitorDot,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { useDashboardStore } from '../stores/useDashboardStore';
import { layout } from '../design-system/tokens';

const RAIL_TABS = [
  { id: 'explore', icon: Compass, label: 'Explore', workspaces: ['explore'] },
  { id: 'layers', icon: Layers, label: 'Layers', workspaces: ['explore', 'analysis', 'ai', 'reports', 'data', 'collaboration'] },
  { id: 'analysis', icon: LineChart, label: 'Analysis', workspaces: ['analysis'] },
  { id: 'ai', icon: Brain, label: 'AI Insights', workspaces: ['ai'] },
  { id: 'reports', icon: FileText, label: 'Reports', workspaces: ['reports'] },
  { id: 'projects', icon: Bookmark, label: 'Projects', workspaces: ['explore', 'analysis', 'collaboration'] },
  { id: 'data', icon: Database, label: 'Data', workspaces: ['data', 'admin'] },
  { id: 'admin', icon: ShieldAlert, label: 'Admin', workspaces: ['admin'] },
  { id: 'settings', icon: Settings, label: 'Settings', workspaces: ['explore', 'analysis', 'ai', 'reports', 'data', 'collaboration', 'admin'], bottom: true },
];

export function LeftNavigationRail() {
  const activeWorkspace = useDashboardStore((s) => s.activeWorkspace);
  const activeLeftTab = useDashboardStore((s) => s.activeLeftTab);
  const setActiveLeftTab = useDashboardStore((s) => s.setActiveLeftTab);
  const leftCollapsed = useDashboardStore((s) => s.leftCollapsed);
  const toggleLeft = useDashboardStore((s) => s.toggleLeft);

  const visibleTabs = RAIL_TABS.filter((tab) => tab.workspaces.includes(activeWorkspace));
  const topTabs = visibleTabs.filter((t) => !t.bottom);
  const bottomTabs = visibleTabs.filter((t) => t.bottom);

  function handleTabClick(id) {
    if (activeLeftTab === id) {
      toggleLeft();
    } else {
      setActiveLeftTab(id);
      if (leftCollapsed) toggleLeft();
    }
  }

  function TabItem({ tab }) {
    const Icon = tab.icon;
    const active = activeLeftTab === tab.id && !leftCollapsed;
    return (
      <button
        type="button"
        title={tab.label}
        aria-label={tab.label}
        aria-pressed={active}
        onClick={() => handleTabClick(tab.id)}
        className={`relative grid h-11 w-11 place-items-center rounded-ds-sm transition-colors duration-ds-fast ease-ds focus-visible:outline-none focus-visible:shadow-ds-focus ${
          active ? 'bg-ds-accent-subtle text-ds-accent' : 'text-ds-text-secondary hover:bg-ds-surface-sunken hover:text-ds-text-primary'
        }`}
      >
        <Icon size={layout.iconButtonGlyph} strokeWidth={1.75} aria-hidden />
        {active ? <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-ds-accent" aria-hidden /> : null}
      </button>
    );
  }

  return (
    <nav
      aria-label="Workspace navigation"
      className="z-ds-floating-panel flex w-[52px] shrink-0 flex-col items-center justify-between border-r border-ds-border bg-ds-surface-raised py-ds-2"
    >
      <div className="flex w-full flex-col items-center gap-ds-1">
        {topTabs.map((tab) => (
          <TabItem key={tab.id} tab={tab} />
        ))}
      </div>
      <div className="flex w-full flex-col items-center gap-ds-1 border-t border-ds-border-subtle pt-ds-2">
        {bottomTabs.map((tab) => (
          <TabItem key={tab.id} tab={tab} />
        ))}
        <button
          type="button"
          title="System status"
          aria-label="System status"
          className="grid h-11 w-11 place-items-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-surface-sunken hover:text-ds-text-primary focus-visible:outline-none focus-visible:shadow-ds-focus"
        >
          <MonitorDot size={layout.iconButtonGlyph} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
