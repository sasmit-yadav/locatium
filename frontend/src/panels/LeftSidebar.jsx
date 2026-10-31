import { useDashboardStore } from '../stores/useDashboardStore';
import { LayerControlPanel } from './LayerControlPanel';
import { ProjectsPanel } from './ProjectsPanel';
import { ReportsPanel } from './ReportsPanel';
import { AdminPanel } from './AdminPanel';
import { UserSettingsPanel } from './UserSettingsPanel';
import { Brain, Database, Layers, LineChart, MapPin, Search, X } from 'lucide-react';
import { layout } from '../design-system/tokens';
import { IconButton } from '../components/ui/IconButton';
import { usePrefersReducedMotion } from '../design-system/usePrefersReducedMotion';
import { DATA_LAYERS } from '../config/layers';
import { getFacilityGap, getLandForecast } from '../services/analysis';
import { getTransparencyStats } from '../services/portal';

function WorkspacePanel({ icon: Icon, title, description, children }) {
  return (
    <section className="h-full overflow-y-auto p-4">
      <div className="flex items-center gap-2 text-ds-accent">
        <Icon size={18} />
        <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
      </div>
      <p className="mt-3 text-xs leading-5 text-ds-text-secondary">{description}</p>
      <div className="mt-5 space-y-2">{children}</div>
    </section>
  );
}

function ActionButton({ icon: Icon, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-sunken p-3 text-left text-xs font-semibold text-ds-text-primary hover:border-ds-accent"
    >
      <Icon size={16} className="shrink-0 text-ds-accent" />
      {children}
    </button>
  );
}

function SidebarBody({ activeLeftTab }) {
  const selectedLocation = useDashboardStore((s) => s.selectedLocation);
  const selectionIsExplicit = useDashboardStore((s) => s.selectionIsExplicit);
  const visibility = useDashboardStore((s) => s.visibility);
  const setActiveLeftTab = useDashboardStore((s) => s.setActiveLeftTab);
  const setCommandPaletteOpen = useDashboardStore((s) => s.setCommandPaletteOpen);
  const setActiveInspectorTab = useDashboardStore((s) => s.setActiveInspectorTab);
  const rightCollapsed = useDashboardStore((s) => s.rightCollapsed);
  const toggleRight = useDashboardStore((s) => s.toggleRight);
  const setAnalysisOverlay = useDashboardStore((s) => s.setAnalysisOverlay);
  const analysisOverlay = useDashboardStore((s) => s.analysisOverlay);
  const activeLayerCount = Object.values(visibility).filter((layer) => layer.visible).length;

  const openInspector = (tab) => {
    setActiveInspectorTab(tab);
    if (rightCollapsed) toggleRight();
  };

  async function showFacilityGap() {
    try {
      const data = await getFacilityGap({
        district: selectedLocation?.district && selectedLocation.district !== 'Haryana' ? selectedLocation.district : undefined,
        limit: 400,
      });
      setAnalysisOverlay(data);
    } catch (err) {
      window.alert(err.message || 'Could not load facility-gap overlay');
    }
  }

  async function showLandBand() {
    if (!selectionIsExplicit || selectedLocation?.lat == null) {
      window.alert('Click a point on the map first.');
      return;
    }
    openInspector('analysis');
    try {
      const band = await getLandForecast({
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        sector: 'industrial',
      });
      window.dispatchEvent(new CustomEvent('locatium:land-forecast', { detail: band }));
    } catch (err) {
      window.alert(err.message || 'Could not load land-price band');
    }
  }

  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      {activeLeftTab === 'layers' && <LayerControlPanel />}
      {activeLeftTab === 'explore' && (
        <WorkspacePanel icon={Search} title="Explore" description="Search Haryana, inspect mapped assets, or find facilities around any point.">
          <ActionButton icon={Search} onClick={() => setCommandPaletteOpen(true)}>Search places and commands</ActionButton>
          <ActionButton icon={Layers} onClick={() => setActiveLeftTab('layers')}>Manage {activeLayerCount} active map layers</ActionButton>
          <ActionButton icon={MapPin} onClick={() => window.dispatchEvent(new Event('locatium:open-facility-finder'))}>Find nearby facilities</ActionButton>
        </WorkspacePanel>
      )}
      {activeLeftTab === 'analysis' && (
        <WorkspacePanel
          icon={LineChart}
          title="Analysis"
          description={selectedLocation
            ? `Review live scoring for ${selectedLocation.name}.`
            : 'Select a location on the map, then open the live scorecard.'}
        >
          <ActionButton icon={LineChart} onClick={() => openInspector('analysis')}>Open location scorecard</ActionButton>
          <ActionButton icon={MapPin} onClick={showLandBand}>Show land-price band for this pin</ActionButton>
          <ActionButton icon={Layers} onClick={showFacilityGap}>
            {analysisOverlay?.features?.length ? 'Refresh facility-gap overlay' : 'Overlay hospital/school gaps'}
          </ActionButton>
          {analysisOverlay?.features?.length ? (
            <ActionButton icon={X} onClick={() => setAnalysisOverlay(null)}>Clear facility-gap overlay</ActionButton>
          ) : null}
          <ActionButton icon={Layers} onClick={() => setActiveLeftTab('layers')}>Choose evidence layers</ActionButton>
        </WorkspacePanel>
      )}
      {activeLeftTab === 'ai' && (
        <WorkspacePanel icon={Brain} title="AI Insights" description="Ask the grounded LOCATIUM copilot about the selected point, prices, risks, and opportunities.">
          <ActionButton icon={Brain} onClick={() => window.dispatchEvent(new Event('locatium:open-assistant'))}>Open Ask LOCATIUM</ActionButton>
          <ActionButton icon={LineChart} onClick={() => openInspector('analysis')}>View supporting score data</ActionButton>
        </WorkspacePanel>
      )}
      {activeLeftTab === 'reports' && <ReportsPanel />}
      {activeLeftTab === 'projects' && <ProjectsPanel />}
      {activeLeftTab === 'data' && (
        <WorkspacePanel icon={Database} title="Data catalog" description={`${DATA_LAYERS.length} configured spatial datasets are served from the local PostGIS catalog.`}>
          <ActionButton icon={Layers} onClick={() => setActiveLeftTab('layers')}>Browse and style datasets</ActionButton>
          <ActionButton icon={Search} onClick={() => setCommandPaletteOpen(true)}>Search catalog features</ActionButton>
          <ActionButton
            icon={Database}
            onClick={async () => {
              try {
                const stats = await getTransparencyStats();
                window.dispatchEvent(new CustomEvent('locatium:transparency', { detail: stats }));
                setActiveLeftTab('settings');
              } catch (err) {
                window.alert(err.message);
              }
            }}
          >
            Open data transparency
          </ActionButton>
        </WorkspacePanel>
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
        className="z-ds-floating-panel hidden w-ds-panel shrink-0 flex-col overflow-hidden border-r border-ds-border bg-ds-surface-raised shadow-ds-sm lg:flex"
        style={{ width: layout.panelWidth }}
      >
        <SidebarBody activeLeftTab={activeLeftTab} />
      </aside>

      {/*
        Sheet below lg. The inline three-column layout needs rail (52) + panel (340) +
        inspector (420) plus a map worth looking at, which does not fit until ~1100px —
        at exactly 768 the map was squeezed to zero width.
      */}
      <div className="lg:hidden">
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
            // `relative` and `fixed` were both set; `relative` won, so the sheet stayed in
            // the flex row and took 409px of a 375px viewport — squeezing the map to zero
            // width and pushing it off-screen. The sheet must be out of flow.
            'fixed inset-x-0 bottom-0 z-ds-floating-panel flex max-h-[85vh] flex-col overflow-hidden rounded-t-ds-lg border border-b-0 border-ds-border bg-ds-surface-raised shadow-ds-sm',
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
