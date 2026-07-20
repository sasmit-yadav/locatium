import { useState, useCallback, useEffect } from 'react';
import { IconClose, IconSearch, IconMapPin, IconCircle, IconLayers } from './UiIcons';
import { colors } from '../design-system/tokens';

const [c0, c2, c3] = [colors.dataCategorical[0], colors.dataCategorical[2], colors.dataCategorical[3]];

const FACILITY_LAYERS = [
  { id: 'social-infrastructure', label: 'Social infrastructure', color: c3 },
  { id: 'transportation', label: 'Transportation', color: c0 },
  { id: 'utilities', label: 'Utilities', color: c2 },
];

export function AreaSelectionTool({ 
  open, 
  selecting = false,
  onClose, 
  map, 
  onResultsFound,
  onSelectionStart,
  onSelectionEnd 
}) {
  const [step, setStep] = useState('config'); // config, selecting, results
  const [center, setCenter] = useState(null);
  const [radius, setRadius] = useState(5); // km
  const [selectedLayers, setSelectedLayers] = useState(
    FACILITY_LAYERS.map(l => l.id)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const toggleLayer = (layerId) => {
    setSelectedLayers(prev => 
      prev.includes(layerId) 
        ? prev.filter(l => l !== layerId)
        : [...prev, layerId]
    );
  };

  const handleStartSelection = () => {
    if (selectedLayers.length === 0) {
      setError('Please select at least one layer');
      return;
    }
    setError(null);
    setStep('selecting');
    if (onSelectionStart) onSelectionStart();
  };

  const executeSearch = useCallback(async (lat, lng) => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const layersParam = selectedLayers.join(',');
      const response = await fetch(
        `/api/harsac/multi-nearby?lat=${lat}&lng=${lng}&radius=${radius}&layers=${layersParam}`
      );

      if (!response.ok) {
        // try to parse error body, fall back to status text
        let errData = null;
        try {
          errData = await response.json();
        } catch {
          // ignore parse error
        }
        throw new Error((errData && errData.message) || `Search failed: ${response.status}`);
      }

      const data = await response.json();
      console.debug('[AreaSelectionTool] search response', data);
      setResults(data);
      if (onResultsFound) onResultsFound(data);
    } catch (err) {
      setError(err.message || 'An error occurred during search');
    } finally {
      setLoading(false);
    }
  }, [radius, selectedLayers, onResultsFound]);

  const handleMapClick = useCallback((e) => {
    if (step !== 'selecting' || !map) return;

    const lat = e.lngLat?.lat ?? (e.lat ? e.lat : null);
    const lng = e.lngLat?.lng ?? (e.lng ? e.lng : null);
    if (lat === null || lng === null) return;

    setCenter({ lat, lng });
    setStep('config');
    if (onSelectionEnd) onSelectionEnd();

    // Execute the search
    executeSearch(lat, lng);
  }, [step, map, executeSearch, onSelectionEnd]);

  // Attach/detach click listener to the map when selecting
  useEffect(() => {
    if (!map || step !== 'selecting') return undefined;

    try {
      // show crosshair cursor while selecting
      const container = map.getCanvas ? map.getCanvas() : null;
      if (container) container.style.cursor = 'crosshair';
      map.on('click', handleMapClick);
    } catch {
      // ignore
    }

    return () => {
      try {
        map.off('click', handleMapClick);
        const container = map.getCanvas ? map.getCanvas() : null;
        if (container) container.style.cursor = '';
      } catch {
        // ignore
      }
    };
  }, [map, step, handleMapClick]);

  const clearResults = () => {
    setResults(null);
    setCenter(null);
    if (onResultsFound) onResultsFound(null);
  };

  const handleReset = () => {
    clearResults();
    setStep('config');
    onClose();
  };

  // keep component mounted while selecting so map click handler works
  if (!open && !selecting) return null;

  // If the parent requested a selecting mode, render nothing visible
  // (modal will be hidden) but keep the component alive so it can attach
  // to the map and receive clicks.
  if (selecting) {
    return null;
  }

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-ds-surface-overlay backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-2xl border border-ds-border bg-ds-surface-raised shadow-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ds-border px-5 py-4 sticky top-0 bg-ds-surface-raised z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ds-accent-subtle">
                <IconCircle className="h-5 w-5 text-ds-accent" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-ds-text-primary">Find Nearby Facilities</h3>
                <p className="text-xs text-ds-text-tertiary">
                  {step === 'selecting' ? 'Click on the map to select center point' : 'Search facilities in radius'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full p-2 text-ds-text-tertiary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
            >
              <IconClose className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-5 py-4">
            {/* Step Indicator */}
            <div className="flex items-center gap-2 mb-4">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                step === 'config' || step === 'selecting' ? 'bg-ds-accent text-ds-text-primary' : 'bg-ds-surface-sunken text-ds-text-tertiary'
              }`}>
                1
              </div>
              <div className="flex-1 h-0.5 bg-ds-surface-sunken" />
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                step === 'selecting' ? 'bg-ds-accent text-ds-text-primary' : 'bg-ds-surface-sunken text-ds-text-tertiary'
              }`}>
                2
              </div>
              <div className="flex-1 h-0.5 bg-ds-surface-sunken" />
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                step === 'results' ? 'bg-ds-accent text-ds-text-primary' : 'bg-ds-surface-sunken text-ds-text-tertiary'
              }`}>
                3
              </div>
            </div>

            {/* Layer Selection */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ds-accent-text">
                <IconLayers className="inline h-3 w-3 mr-1" />
                Facility Layers
              </label>
              <div className="space-y-2">
                {FACILITY_LAYERS.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => toggleLayer(layer.id)}
                    className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                      selectedLayers.includes(layer.id)
                        ? 'border-ds-accent bg-ds-accent-subtle text-ds-text-primary'
                        : 'border-ds-border bg-ds-surface-sunken text-ds-text-secondary hover:border-ds-border hover:text-ds-text-primary'
                    }`}
                    disabled={step === 'selecting'}
                  >
                    <div 
                      className="w-4 h-4 rounded border flex items-center justify-center"
                      style={{ 
                        borderColor: selectedLayers.includes(layer.id) ? layer.color : colors.border.default,
                        backgroundColor: selectedLayers.includes(layer.id) ? layer.color : 'transparent'
                      }}
                    >
                      {selectedLayers.includes(layer.id) && (
                        <svg className="w-2.5 h-2.5 text-ds-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="flex-1">{layer.label}</span>
                    {results && results.results && results.results[layer.id] && (
                      <span className="text-xs bg-ds-surface-sunken px-2 py-0.5 rounded">
                        {results.results[layer.id].features?.length || 0}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Distance Range */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ds-accent-text">
                Search Radius: {radius} km
              </label>
              <input
                type="range"
                min="1"
                max="20"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="h-2 w-full accent-ds-accent"
                disabled={step === 'selecting'}
              />
              <div className="mt-1 flex justify-between text-[10px] text-ds-text-tertiary">
                <span>1 km</span>
                <span>20 km</span>
              </div>
            </div>

            {/* Center Point Info */}
            {center && (
              <div className="mb-4 rounded-lg border border-ds-border bg-ds-surface-sunken px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <IconMapPin className="h-4 w-4 text-ds-accent" />
                  <span className="text-ds-text-secondary">Center:</span>
                  <span className="text-ds-text-primary font-mono">
                    {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
                  </span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}

            {/* Results Summary */}
            {results && (
              <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20">
                    <IconSearch className="h-4 w-4 text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-ds-text-primary">
                      Found {results.totalFeatures || 0} facilities
                    </p>
                    <p className="text-xs text-ds-text-primary/60 mt-1">
                      Across {results.layers?.length || 0} layers within {radius}km
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Per-layer errors (if any) */}
            {results && results.results && (
              Object.keys(results.results).some(k => results.results[k].error) && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  <strong className="block text-sm text-red-100 mb-1">Layer errors:</strong>
                  {Object.entries(results.results).map(([layerId, info]) => (
                    info.error ? (
                      <div key={layerId} className="mb-1">
                        <span className="font-semibold">{layerId}:</span> {info.error}
                      </div>
                    ) : null
                  ))}
                </div>
              )
            )}

            {/* Action Button */}
            {step === 'config' && !results && (
              <button
                type="button"
                onClick={handleStartSelection}
                disabled={selectedLayers.length === 0 || loading}
                className="w-full rounded-xl bg-ds-accent px-4 py-3 text-sm font-bold text-ds-text-primary transition hover:bg-ds-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Searching...' : 'Select Point on Map'}
              </button>
            )}

            {step === 'config' && results && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    clearResults();
                    setStep('config');
                  }}
                  className="flex-1 rounded-xl border border-ds-border px-4 py-3 text-sm font-bold text-ds-text-primary transition hover:bg-ds-surface-sunken"
                >
                  New Search
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 rounded-xl bg-ds-accent px-4 py-3 text-sm font-bold text-ds-text-primary transition hover:bg-ds-accent/90"
                >
                  Done
                </button>
              </div>
            )}

            {step === 'selecting' && (
              <div className="text-center py-3">
                <p className="text-sm text-ds-text-secondary">
                  🗺️ Click anywhere on the map to set the search center
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStep('config');
                    if (onSelectionEnd) onSelectionEnd();
                  }}
                  className="mt-2 text-xs text-ds-text-tertiary hover:text-ds-text-primary underline"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions Overlay when selecting */}
      {step === 'selecting' && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-[19999] bg-ds-surface-base/80 text-ds-text-primary px-4 py-2 rounded-full text-sm backdrop-blur-sm">
          Click on the map to select center point
        </div>
      )}
    </>
  );
}
