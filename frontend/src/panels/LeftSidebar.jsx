import { useDashboardStore } from '../stores/useDashboardStore';
import { LayerControlPanel } from './LayerControlPanel';
import { ProjectsPanel } from './ProjectsPanel';
import { ReportsPanel } from './ReportsPanel';
import { AdminPanel } from './AdminPanel';
import { UserSettingsPanel } from './UserSettingsPanel';
import { EmptyState } from '../components/ui/EmptyState';
import { Layers, X } from 'lucide-react';
import { layout } from '../design-system/tokens';
import { IconButton } from '../components/ui/IconButton';
import { usePrefersReducedMotion } from '../design-system/usePrefersReducedMotion';

function PlaceholderPanel({ title, description }) {
  return (
    <EmptyState
      icon={Layers}
      title={title}
      description={description || 'This workspace is ready for content built on the shared design system.'}
      className="h-full justify-center"
    />
  );
}

function SidebarBody({ activeLeftTab }) {
  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      {activeLeftTab === 'layers' && <LayerControlPanel />}
      {activeLeftTab === 'explore' && (
        <PlaceholderPanel title="Explore" description="Open layers or search a place to start exploring the map." />
      )}
      {activeLeftTab === 'analysis' && (
        <PlaceholderPanel title="Analysis" description="Select a location on the map to open scoring in the inspector." />
      )}
      {activeLeftTab === 'ai' && (
        <PlaceholderPanel title="AI Insights" description="AI insights will appear here when that workspace is connected." />
      )}
      {activeLeftTab === 'reports' && <ReportsPanel />}
      {activeLeftTab === 'projects' && <ProjectsPanel />}
      {activeLeftTab === 'data' && (
        <PlaceholderPanel title="Data management" description="Layer sync and data tools will live in this dashboard panel." />
      )}
      {activeLeftTab === 'admin' && <AdminPanel />}
      {activeLeftTab === 'settings' && <UserSettingsPanel />}
    </div>
  );
}

export function LeftSidebar() {
  const leftCollapsed = useDashboardStore((s) => s.leftCollapsed);
  const activeLeftTab = useDashboardStore((s) => s.activeLeftTab);
  const toggleLeft = useDashboardStore((s) => s.toggleLeft);
  const reducedMotion = usePrefersReducedMotion();

  if (leftCollapsed) return null;

  return (
    <>
      {/* Desktop: side rail panel */}
      <aside
        className="z-ds-floating-panel hidden w-ds-panel shrink-0 flex-col overflow-hidden border-r border-ds-border bg-ds-surface-raised shadow-ds-sm md:flex"
        style={{ width: layout.panelWidth }}
      >
        <SidebarBody activeLeftTab={activeLeftTab} />
      </aside>

      {/* Mobile: bottom sheet (<768px) per ui_enhance §7 */}
      <div className="md:hidden">
        <button
          type="button"
          aria-label="Dismiss panel"
          className="fixed inset-0 z-ds-floating-panel bg-ds-surface-overlay"
          onClick={toggleLeft}
        />
        <aside
          role="complementary"
          aria-label="Workspace panel"
          className={[
            'relative fixed inset-x-0 bottom-0 z-ds-floating-panel flex max-h-[85vh] flex-col overflow-hidden rounded-t-ds-lg border border-b-0 border-ds-border bg-ds-surface-raised shadow-ds-sm',
            reducedMotion ? '' : 'animate-ds-panel-in',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="relative flex shrink-0 items-center justify-center border-b border-ds-border-subtle px-ds-4 py-ds-3">
            <div className="h-1 w-10 rounded-ds-full bg-ds-border-strong" aria-hidden />
            <div className="absolute right-ds-2 top-1/2 -translate-y-1/2">
              <IconButton icon={X} onClick={toggleLeft} tooltip="Close panel" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden" style={{ maxHeight: 'calc(85vh - 52px)' }}>
            <SidebarBody activeLeftTab={activeLeftTab} />
          </div>
        </aside>
      </div>
    </>
  );
}
