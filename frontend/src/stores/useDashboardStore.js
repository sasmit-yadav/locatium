import { create } from 'zustand';
import { DEFAULT_BASEMAP_ID } from '../config/basemaps';
import { DEFAULT_ZOOM, INITIAL_MAP_CENTER } from '../config/layers';
import { buildDefaultVisibility, getLayerFocus } from '../config/enterpriseLayers';

export const useDashboardStore = create((set) => ({
  basemapId: DEFAULT_BASEMAP_ID,
  visibility: buildDefaultVisibility(),
  selectedLocation: {
    name: 'Gurugram Industrial Corridor',
    district: 'Gurugram',
    tehsil: 'Gurugram',
    landType: 'Industrial influence zone',
    area: 'Live point analysis',
    lat: 28.4595,
    lng: 77.0266,
    zoom: 12,
  },
  view: {
    lat: INITIAL_MAP_CENTER[0],
    lng: INITIAL_MAP_CENTER[1],
    zoom: DEFAULT_ZOOM,
  },
  cursor: { lat: INITIAL_MAP_CENTER[0], lng: INITIAL_MAP_CENTER[1] },
  mapInstance: null,
  goToRequest: null,
  selectedFeature: null,
  leftCollapsed: false,
  rightCollapsed: false,
  activeWorkspace: 'explore',
  activeLeftTab: 'layers',
  isCommandPaletteOpen: false,
  activeInspectorTab: 'overview',
  isInspectorPinned: false,
  apiLatencyMs: null,
  tileStatus: { loading: false, error: null },
  setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),
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
  setSelectedLocation: (selectedLocation) => set({ selectedLocation }),
  setSelectedFeature: (selectedFeature) => set({ selectedFeature }),
  flyTo: ({ lng, lat, zoom = 12, name, type, feature }) =>
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
        district: 'Haryana',
        tehsil: type || 'Spatial entity',
        landType: feature?.tableId || 'Point analysis',
        area: 'On-demand scoring',
        lng,
        lat,
        zoom,
      },
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
