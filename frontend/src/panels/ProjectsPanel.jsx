import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Compass, FolderHeart, History, Plus, Trash2 } from 'lucide-react';
import { listSearches, saveSearch, deleteSearch, listFavorites, deleteFavorite, listAnalysisHistory, clearAnalysisHistory, getWorkspaceStats } from '../services/portal';
import { useDashboardStore } from '../stores/useDashboardStore';

export function ProjectsPanel() {
  const queryClient = useQueryClient();
  const [newSearchName, setNewSearchName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Store actions
  const basemapId = useDashboardStore((s) => s.basemapId);
  const visibility = useDashboardStore((s) => s.visibility);
  const view = useDashboardStore((s) => s.view);
  const setBasemapId = useDashboardStore((s) => s.setBasemapId);
  const toggleLayer = useDashboardStore((s) => s.toggleLayer);
  const flyTo = useDashboardStore((s) => s.flyTo);

  // Queries
  const searchesQuery = useQuery({
    queryKey: ['portal-saved-searches'],
    queryFn: listSearches,
  });

  const favoritesQuery = useQuery({
    queryKey: ['portal-favorites'],
    queryFn: listFavorites,
  });

  const historyQuery = useQuery({
    queryKey: ['portal-analysis-history'],
    queryFn: listAnalysisHistory,
  });

  const statsQuery = useQuery({
    queryKey: ['portal-stats'],
    queryFn: getWorkspaceStats,
  });

  const searchLimit = statsQuery.data?.savedSearchLimit ?? 5;
  const searchCount = searchesQuery.data?.length ?? 0;
  const searchLimitReached = searchCount >= searchLimit;

  // Mutations
  const saveSearchMutation = useMutation({
    mutationFn: ({ name, filters }) => saveSearch(name, filters),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-saved-searches'] });
      queryClient.invalidateQueries({ queryKey: ['portal-stats'] });
      setNewSearchName('');
      setShowSaveForm(false);
      setSaveError('');
    },
    onError: (err) => {
      setSaveError(err.message || 'Failed to save search');
    },
  });

  const deleteSearchMutation = useMutation({
    mutationFn: deleteSearch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-saved-searches'] });
      queryClient.invalidateQueries({ queryKey: ['portal-stats'] });
    },
  });

  const deleteFavoriteMutation = useMutation({
    mutationFn: deleteFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-favorites'] });
      queryClient.invalidateQueries({ queryKey: ['portal-stats'] });
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: clearAnalysisHistory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-analysis-history'] });
      queryClient.invalidateQueries({ queryKey: ['portal-stats'] });
    },
  });

  // Actions
  function handleSaveSearch(event) {
    event.preventDefault();
    if (!newSearchName.trim()) return;

    // Capture current layers state
    const activeLayers = Object.entries(visibility)
      .filter(([, val]) => val.visible)
      .map(([id]) => id);

    const filters = {
      basemapId,
      activeLayers,
      view: {
        lat: view.lat,
        lng: view.lng,
        zoom: view.zoom,
      },
    };

    saveSearchMutation.mutate({ name: newSearchName, filters });
  }

  function handleLoadSearch(search) {
    const { filters } = search;
    if (!filters) return;

    // Apply basemap
    if (filters.basemapId) {
      setBasemapId(filters.basemapId);
    }

    // Apply layers
    if (Array.isArray(filters.activeLayers)) {
      const activeSet = new Set(filters.activeLayers);
      Object.keys(visibility).forEach((layerId) => {
        const shouldBeVisible = activeSet.has(layerId);
        if (Boolean(visibility[layerId]?.visible) !== shouldBeVisible) {
          toggleLayer(layerId, shouldBeVisible);
        }
      });
    }

    // Fly to coordinates
    if (filters.view) {
      flyTo({
        lng: filters.view.lng,
        lat: filters.view.lat,
        zoom: filters.view.zoom,
        name: `Restored Search: ${search.name}`,
        type: 'Saved Map State',
      });
    }
  }

  function handleLoadHistory(entry) {
    flyTo({
      lng: entry.lng,
      lat: entry.lat,
      zoom: 13,
      name: entry.label,
      type: 'Analysis history',
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ds-border-subtle p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-ds-title text-ds-text-primary">
            <Bookmark size={16} className="text-ds-accent" /> Projects &amp; workspace
          </div>
        </div>
        <div className="mt-1 text-xs text-ds-text-secondary">Manage your saved searches and bookmarked zones.</div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {/* === QUICK STATS === */}
        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
            <div className="text-lg font-bold text-ds-text-primary">{statsQuery.data?.analyses ?? 0}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text-secondary">Zones analyzed</div>
          </div>
          <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
            <div className="text-lg font-bold text-ds-text-primary">{statsQuery.data?.reportsGenerated ?? 0}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text-secondary">Reports generated</div>
          </div>
          <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
            <div className="text-lg font-bold text-ds-text-primary">{statsQuery.data?.favorites ?? 0}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text-secondary">Bookmarked</div>
          </div>
          <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
            <div className="text-lg font-bold text-ds-text-primary">{searchCount}/{searchLimit}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text-secondary">Saved views</div>
          </div>
        </section>

        {/* === SAVED SEARCHES === */}
        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.17em] text-ds-text-secondary">
              <Compass size={15} className="text-ds-accent" /> Saved Views ({searchCount}/{searchLimit})
            </span>
            <button
              type="button"
              onClick={() => setShowSaveForm((v) => !v)}
              disabled={searchLimitReached}
              className="flex h-6 items-center gap-1 rounded bg-ds-accent-subtle px-2 text-[10px] font-bold uppercase tracking-wider text-ds-accent hover:bg-ds-accent-subtle disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={12} /> Save Current
            </button>
          </div>

          {searchLimitReached ? (
            <div className="mt-2 text-[10px] text-ds-text-secondary">Saved view limit reached. Delete one to add another.</div>
          ) : null}

          {showSaveForm && (
            <form onSubmit={handleSaveSearch} className="mt-3 space-y-2 rounded-lg bg-ds-surface-sunken p-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ds-text-secondary">Save View State</div>
              <input
                value={newSearchName}
                onChange={(e) => setNewSearchName(e.target.value)}
                placeholder="Enter view name (e.g. Gurugram Industrial)"
                className="h-8 w-full rounded-md border border-ds-border-subtle bg-ds-surface-sunken px-2 text-xs text-ds-text-primary outline-none focus:border-ds-accent"
                required
              />
              {saveError && <div className="text-[10px] text-red-400">{saveError}</div>}
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setShowSaveForm(false)}
                  className="rounded px-2.5 py-1 text-[10px] font-bold uppercase text-ds-text-secondary hover:text-ds-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveSearchMutation.isPending}
                  className="rounded bg-ds-accent px-2.5 py-1 text-[10px] font-bold uppercase text-ds-text-inverse hover:bg-ds-accent-hover"
                >
                  {saveSearchMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-3 space-y-2">
            {searchesQuery.isLoading && <div className="text-xs text-ds-text-secondary">Loading saved views...</div>}
            {searchesQuery.data?.length === 0 ? (
              <div className="rounded-md border border-dashed border-ds-border-subtle bg-ds-surface-sunken py-4 text-center text-[11px] text-ds-text-secondary">
                No saved views. Pan/zoom and toggle layers, then click "Save Current" to create one.
              </div>
            ) : null}

            {(searchesQuery.data || []).map((search) => (
              <div
                key={search.id}
                className="group flex items-center justify-between gap-2 rounded-md bg-ds-surface-sunken p-2 border border-ds-border-subtle hover:border-ds-accent"
              >
                <button
                  type="button"
                  onClick={() => handleLoadSearch(search)}
                  className="flex-1 text-left"
                >
                  <div className="text-xs font-bold text-ds-text-primary group-hover:text-ds-accent transition truncate">
                    {search.name}
                  </div>
                  <div className="mt-0.5 text-[9px] text-ds-text-secondary">
                    {new Date(search.created_at).toLocaleDateString()} · {search.filters?.activeLayers?.length ?? 0} layers · z
                    {search.filters?.view?.zoom?.toFixed(1) ?? 'N/A'}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => deleteSearchMutation.mutate(search.id)}
                  title="Delete view"
                  className="text-ds-text-secondary hover:text-ds-danger p-1 opacity-0 group-hover:opacity-100 transition"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* === BOOKMARKED ZONES === */}
        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.17em] text-ds-text-secondary mb-3">
            <FolderHeart size={15} className="text-ds-accent" /> Bookmarked Zones ({favoritesQuery.data?.length ?? 0})
          </span>

          <div className="space-y-2">
            {favoritesQuery.isLoading && <div className="text-xs text-ds-text-secondary">Loading bookmarks...</div>}
            {favoritesQuery.data?.length === 0 ? (
              <div className="rounded-md border border-dashed border-ds-border-subtle bg-ds-surface-sunken py-4 text-center text-[11px] text-ds-text-secondary">
                No bookmarked zones yet. Select a zone on the map or from investor list, write a note and click "Bookmark Zone".
              </div>
            ) : null}

            {(favoritesQuery.data || []).map((fav) => (
              <div
                key={fav.id}
                className="group rounded-md bg-ds-surface-sunken p-2 border border-ds-border-subtle hover:border-ds-warning"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      flyTo({
                        lng: fav.zone.center.lng,
                        lat: fav.zone.center.lat,
                        zoom: 13,
                        name: fav.zone.name,
                        type: fav.zone.type,
                        feature: {
                          tableId: fav.zoneId.split(':')[0],
                          layerId: 'industrial-investment',
                          investorZoneId: fav.zoneId,
                          featureId: fav.zoneId.split(':')[1],
                          name: fav.zone.name,
                          type: fav.zone.type,
                          center: fav.zone.center,
                        },
                      })
                    }
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="text-xs font-bold text-ds-text-primary group-hover:text-ds-warning transition truncate">
                      {fav.zone.name}
                    </div>
                    <div className="mt-0.5 text-[9px] text-ds-text-secondary truncate">
                      {fav.zone.district} · {fav.zone.type} · Score: {fav.zone.opportunityScore}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteFavoriteMutation.mutate(fav.id)}
                    title="Remove bookmark"
                    className="text-ds-text-secondary hover:text-ds-danger p-1 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {fav.notes ? (
                  <div className="mt-2 rounded bg-ds-surface-sunken px-2 py-1.5 font-sans text-[11px] leading-relaxed text-ds-text-secondary border-l-2 border-ds-warning italic">
                    {fav.notes}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {/* === ANALYSIS HISTORY === */}
        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.17em] text-ds-text-secondary">
              <History size={15} className="text-ds-accent" /> Analysis History ({historyQuery.data?.length ?? 0})
            </span>
            {historyQuery.data?.length ? (
              <button
                type="button"
                onClick={() => clearHistoryMutation.mutate()}
                disabled={clearHistoryMutation.isPending}
                className="text-[10px] font-bold uppercase tracking-wider text-ds-text-secondary hover:text-ds-danger disabled:opacity-50"
              >
                {clearHistoryMutation.isPending ? 'Clearing...' : 'Clear'}
              </button>
            ) : null}
          </div>

          <div className="mt-3 space-y-2">
            {historyQuery.isLoading && <div className="text-xs text-ds-text-secondary">Loading history...</div>}
            {historyQuery.data?.length === 0 ? (
              <div className="rounded-md border border-dashed border-ds-border-subtle bg-ds-surface-sunken py-4 text-center text-[11px] text-ds-text-secondary">
                No analyses yet. Select a location on the map to score it.
              </div>
            ) : null}

            {(historyQuery.data || []).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => handleLoadHistory(entry)}
                className="group flex w-full items-center justify-between gap-2 rounded-md border border-ds-border-subtle bg-ds-surface-sunken p-2 text-left hover:border-ds-accent"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-ds-text-primary transition group-hover:text-ds-accent">
                    {entry.label}
                  </div>
                  <div className="mt-0.5 text-[9px] text-ds-text-secondary">
                    {new Date(entry.createdAt).toLocaleString()} · {entry.sector}
                  </div>
                </div>
                <div className="shrink-0 rounded bg-ds-accent-subtle px-2 py-1 text-[11px] font-black text-ds-accent">
                  {entry.overallScore ?? '--'}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
