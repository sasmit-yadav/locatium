import { useCallback, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { colors } from '../design-system/tokens';
import { LAYER_PRIMARY_COLOR } from '../config/layer-registry';

/** Distinct category fallbacks when a specific table color is unknown. */
const CATEGORY_COLORS = {
  'social-infrastructure': '#dc2626',
  transportation: '#2563eb',
  utilities: '#f59e0b',
  environmental: '#166534',
  cadastral: '#db2777',
  administrative: '#c2410c',
  'industrial-investment': '#f59e0b',
};

const LAYER_LABELS = {
  'social-infrastructure': 'Social Infrastructure',
  transportation: 'Transportation',
  utilities: 'Utilities',
};

function resolveFacilityColor(layerId, feature) {
  const tableHint =
    feature?.properties?.table ||
    feature?.properties?.tableId ||
    feature?.properties?.layer_table ||
    feature?.tableId ||
    null;
  if (tableHint && LAYER_PRIMARY_COLOR[tableHint]) return LAYER_PRIMARY_COLOR[tableHint];
  return CATEGORY_COLORS[layerId] || colors.dataCategorical[4] || '#64748b';
}

/**
 * Component to display facility markers on the map from HARSAC query results
 */
export function FacilityMarkers({
  map,
  results,
  center,
  visible = true,
  onMarkerClick,
  selectedId = null,
}) {
  const markersRef = useRef([]);
  const sourceRef = useRef(null);

  // Clear existing markers
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (map && sourceRef.current) {
      if (map.getLayer('facility-markers-fill')) {
        map.removeLayer('facility-markers-fill');
      }
      if (map.getLayer('facility-markers-glow')) {
        map.removeLayer('facility-markers-glow');
      }
      if (map.getLayer('facility-labels')) {
        map.removeLayer('facility-labels');
      }
      map.removeSource('facility-markers');
      sourceRef.current = null;
    }
  }, [map]);

  // Add markers for each facility
  useEffect(() => {
    if (!map || !results || !visible) {
      clearMarkers();
      return;
    }

    // Collect all features from all layers
    const allFeatures = [];
    if (results.results) {
      Object.entries(results.results).forEach(([layerId, layerData]) => {
        if (layerData.features && Array.isArray(layerData.features)) {
          layerData.features.forEach(feature => {
            allFeatures.push({
              ...feature,
              layerColor: resolveFacilityColor(layerId, feature),
              layerLabel: LAYER_LABELS[layerId] || layerId
            });
          });
        }
      });
    }

    if (allFeatures.length === 0) {
      clearMarkers();
      return;
    }

    // Create GeoJSON for the features
    const geojson = {
      type: 'FeatureCollection',
      features: allFeatures
        .filter(f => f.geometry && f.geometry.coordinates)
        .map(f => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            id: f.id,
            name: f.name,
            layerId: f.layerId,
            layerColor: f.layerColor,
            layerLabel: f.layerLabel,
            distanceKm: f.distanceKm,
            properties: f.properties
          }
        }))
    };

    // Add source
    if (!map.getSource('facility-markers')) {
      map.addSource('facility-markers', {
        type: 'geojson',
        data: geojson,
        cluster: false
      });
      sourceRef.current = 'facility-markers';
    } else {
      map.getSource('facility-markers').setData(geojson);
    }

    // Static fill + stroke (no glow / pulse). Selected marker gets 2px accent ring.
    if (!map.getLayer('facility-markers-fill')) {
      map.addLayer({
        id: 'facility-markers-fill',
        type: 'circle',
        source: 'facility-markers',
        paint: {
          'circle-radius': [
            'case',
            ['==', ['to-string', ['get', 'id']], String(selectedId ?? '')],
            8,
            6,
          ],
          'circle-color': ['get', 'layerColor'],
          'circle-stroke-width': 2,
          'circle-stroke-color': [
            'case',
            ['==', ['to-string', ['get', 'id']], String(selectedId ?? '')],
            colors.accent.default,
            colors.surface.raised,
          ],
          'circle-opacity': 1,
        },
      });
    } else {
      map.setPaintProperty('facility-markers-fill', 'circle-radius', [
        'case',
        ['==', ['to-string', ['get', 'id']], String(selectedId ?? '')],
        8,
        6,
      ]);
      map.setPaintProperty('facility-markers-fill', 'circle-stroke-color', [
        'case',
        ['==', ['to-string', ['get', 'id']], String(selectedId ?? '')],
        colors.accent.default,
        colors.surface.raised,
      ]);
    }

    // Soft one-time presence: no continuous pulse layer
    if (map.getLayer('facility-markers-glow')) {
      map.removeLayer('facility-markers-glow');
    }

    // Add labels layer
    if (!map.getLayer('facility-labels')) {
      map.addLayer({
        id: 'facility-labels',
        type: 'symbol',
        source: 'facility-markers',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-optional': true
        },
        paint: {
          'text-color': colors.text.primary,
          'text-halo-color': colors.surface.raised,
          'text-halo-width': 1
        }
      });
    }

    // Add click handler
    map.on('click', 'facility-markers-fill', (e) => {
      const properties = e.features[0].properties;
      const coordinates = e.features[0].geometry.coordinates.slice();

      if (onMarkerClick) {
        onMarkerClick({
          ...properties,
          coordinates
        });
      }

      // Show popup
      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(`
          <div class="p-2 max-w-xs">
            <h3 class="font-medium text-sm text-gray-900">${properties.name || 'Unnamed facility'}</h3>
            <p class="text-xs text-gray-600 mt-1">${properties.layerLabel}</p>
            ${properties.distanceKm !== null ? `<p class="text-xs text-gray-600 mt-1">${properties.distanceKm} km away</p>` : ''}
            <div class="mt-2 text-[10px] text-gray-500">
              <p><strong>ID:</strong> ${properties.id}</p>
            </div>
          </div>
        `)
        .addTo(map);
    });

    // Change cursor on hover
    map.on('mouseenter', 'facility-markers-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'facility-markers-fill', () => {
      map.getCanvas().style.cursor = '';
    });

    // Add radius circle around center
    if (center && results.radiusMeters) {
      const radiusInKm = results.radiusMeters / 1000;
      
      // Create a circle polygon around the center point
      const centerPoint = [center.lng, center.lat];
      const radiusInDegrees = (radiusInKm / 6371) * (180 / Math.PI);
      
      const circlePoints = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * 2 * Math.PI;
        circlePoints.push([
          centerPoint[0] + radiusInDegrees * Math.cos(angle),
          centerPoint[1] + radiusInDegrees * Math.sin(angle)
        ]);
      }

      const circleGeoJSON = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [circlePoints]
          },
          properties: {}
        }]
      };

      if (!map.getSource('search-radius')) {
        map.addSource('search-radius', {
          type: 'geojson',
          data: circleGeoJSON
        });
      } else {
        map.getSource('search-radius').setData(circleGeoJSON);
      }

      if (!map.getLayer('search-radius-fill')) {
        map.addLayer({
          id: 'search-radius-fill',
          type: 'fill',
          source: 'search-radius',
          paint: {
            'fill-color': colors.accent.default,
            'fill-opacity': 0.08
          }
        });
      }

      if (!map.getLayer('search-radius-outline')) {
        map.addLayer({
          id: 'search-radius-outline',
          type: 'line',
          source: 'search-radius',
          paint: {
            'line-color': colors.accent.default,
            'line-width': 2,
            'line-dasharray': [2, 2]
          }
        });
      }
    }

    return () => {
      map.off('click', 'facility-markers-fill');
      map.off('mouseenter', 'facility-markers-fill');
      map.off('mouseleave', 'facility-markers-fill');
    };
  }, [map, results, center, visible, onMarkerClick, clearMarkers, selectedId]);

  // Toggle visibility
  useEffect(() => {
    if (!map) return;

    const layers = ['facility-markers-glow', 'facility-markers-fill', 'facility-labels', 'search-radius-fill', 'search-radius-outline'];
    layers.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    });
  }, [map, visible]);

  return null; // This component doesn't render any DOM, it only manages map layers
}
