import { create } from 'zustand';
import { DEFAULT_BASEMAP_ID } from '../config/basemaps';
import { DEFAULT_ZOOM, INITIAL_MAP_CENTER } from '../config/layers';
import { buildDefaultVisibility, getLayerFocus } from '../config/enterpriseLayers';

/**
 * The panels render as sheets over the map until the viewport can hold the inline
 * three-column layout. Opening both on load leaves a phone or tablet showing no map at
 * all, which is the one thing the product is — so start collapsed there. The thresholds
 * match the Tailwind breakpoints the panels themselves switch at: the left panel goes
 * inline at `lg`, the inspector at `xl`.
 */
const LEFT_PANEL_INLINE_PX = 1024; // Tailwind lg
const INSPECTOR_INLINE_PX = 1280; // Tailwind xl
const viewportWidth = typeof window !== 'undefined' ? window.innerWidth || 0 : 0;
// The layer catalogue is an expert tool: everyone starts with it closed (the rail still
// opens it). LEFT_PANEL_INLINE_PX stays documented for the panels' own breakpoints.
void LEFT_PANEL_INLINE_PX;
const leftStartsCollapsed = true;

/** First visit (and every visit until the person ticks "don't show again") opens on the welcome screen. */
function welcomeStartsOpen() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem('locatium.welcome.skip') === '1') return false;
  } catch {
    /* storage unavailable: show it */
  }
  const params = new URLSearchParams(window.location.search);
  return !params.has('share') && window.location.pathname === '/';
}
const inspectorStartsCollapsed = viewportWidth > 0 && viewportWidth < INSPECTOR_INLINE_PX;

export const useDashboardStore = create((set) => ({
  basemapId: DEFAULT_BASEMAP_ID,
  visibility: buildDefaultVisibility(),
  selectedLocation: {
    name: 'Haryana map overview',
    district: 'Haryana',
    tehsil: 'Select a point',
    landType: 'No location selected',
    area: 'Search or click the map',
    lat: INITIAL_MAP_CENTER[0],
    lng: INITIAL_MAP_CENTER[1],
    zoom: DEFAULT_ZOOM,
  },
  selectionIsExplicit: false,
  view: {
    lat: INITIAL_MAP_CENTER[0],
    lng: INITIAL_MAP_CENTER[1],
    zoom: DEFAULT_ZOOM,
  },
  cursor: { lat: INITIAL_MAP_CENTER[0], lng: INITIAL_MAP_CENTER[1] },
  mapInstance: null,
  goToRequest: null,
  selectedFeature: null,
  leftCollapsed: leftStartsCollapsed,
  rightCollapsed: inspectorStartsCollapsed,
  activeWorkspace: 'explore',
  welcomeOpen: welcomeStartsOpen(),
  activeLeftTab: 'layers',
  isCommandPaletteOpen: false,
  activeInspectorTab: 'overview',
  isInspectorPinned: false,
  apiLatencyMs: null,
  tileStatus: { loading: false, error: null },
  investorHighlights: null,
  analysisOverlay: null,
  setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),
  setWelcomeOpen: (welcomeOpen) => set({ welcomeOpen }),
  /** Opens the inspector on a tab — used by the welcome screen's big buttons. */
  openInspector: (activeInspectorTab) => set({ activeInspectorTab, rightCollapsed: false }),
  activateWorkspace: (activeWorkspace) =>
    set((state) => {
      const leftTabs = {
        explore: 'layers',
        analysis: 'analysis',
        ai: 'ai',
        reports: 'reports',
        data: 'data',
        collaboration: 'projects',
        admin: 'admin',
      };
      const inspectorTabs = {
        analysis: 'analysis',
        reports: 'investor',
        collaboration: 'investor',
      };
      return {
        activeWorkspace,
        activeLeftTab: leftTabs[activeWorkspace] || state.activeLeftTab,
        activeInspectorTab: inspectorTabs[activeWorkspace] || state.activeInspectorTab,
        leftCollapsed: false,
        ...(inspectorTabs[activeWorkspace] ? { rightCollapsed: false } : {}),
      };
    }),
  setActiveLeftTab: (activeLeftTab) => set({ activeLeftTab }),
  setCommandPaletteOpen: (isCommandPaletteOpen) => set({ isCommandPaletteOpen }),
  setActiveInspectorTab: (activeInspectorTab) => set({ activeInspectorTab }),
  toggleInspectorPin: () => set((state) => ({ isInspectorPinned: !state.isInspectorPinned })),
  setBasemapId: (basemapId) => set({ basemapId }),
  setView: (view) => set({ view }),
  setCursor: (cursor) => set({ cursor }),
  setMapInstance: (mapInstance) => set({ mapInstance }),
  setTileStatus: (patch) => set((state) => ({ tileStatus: { ...state.tileStatus, ...patch } })),
  setApiLatencyMs: (apiLatencyMs) => set({ apiLatencyMs }),
  setInvestorHighlights: (investorHighlights) => set({ investorHighlights }),
  setAnalysisOverlay: (analysisOverlay) => set({ analysisOverlay }),
  setSelectedLocation: (selectedLocation) => set({ selectedLocation, selectionIsExplicit: true }),
  setSelectedFeature: (selectedFeature) => set({ selectedFeature }),
  flyTo: ({ lng, lat, zoom = 12, name, type, feature, district, tehsil }) =>
    set({
      goToRequest: { t: Date.now(), lng, lat, zoom },
      selectedFeature: feature
        ? {
            ...feature,
            center: feature.center || { lng, lat },
            lng: feature.lng ?? lng,
            lat: feature.lat ?? lat,
          }
        : null,
      selectedLocation: {
        name: name || 'Selected location',
        district: district || 'Haryana',
        tehsil: tehsil || null,
        landType: type || feature?.tableId || 'Point analysis',
        area: 'On-demand scoring',
        lng,
        lat,
        zoom,
      },
      selectionIsExplicit: true,
    }),
  toggleLeft: () => set((state) => ({ leftCollapsed: !state.leftCollapsed })),
  toggleRight: () => set((state) => ({ rightCollapsed: !state.rightCollapsed })),
  toggleLayer: (id, visible) =>
    set((state) => {
      const focus = visible ? getLayerFocus(id) : null;
      return {
        visibility: {
          ...state.visibility,
          [id]: { ...state.visibility[id], visible },
        },
        ...(focus
          ? {
              goToRequest: {
                t: Date.now(),
                lng: focus.lng,
                lat: focus.lat,
                zoom: focus.zoom,
                reason: 'layer-toggle',
                layerId: id,
              },
            }
          : {}),
      };
    }),
  setLayerOpacity: (id, opacity) =>
    set((state) => ({
      visibility: {
        ...state.visibility,
        [id]: { ...state.visibility[id], opacity },
      },
    })),
}));
