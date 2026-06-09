import { useState, useCallback, useEffect } from 'react';
import { IconClose, IconSearch, IconMapPin, IconCircle, IconLayers } from './UiIcons';

const FACILITY_LAYERS = [
  { id: 'social-infrastructure', label: 'Social Infrastructure', icon: '🏥', color: '#ef4444' },
  { id: 'transportation', label: 'Transportation', icon: '🚂', color: '#3b82f6' },
  { id: 'utilities', label: 'Utilities', icon: '⚡', color: '#eab308' },
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
  const [featuresOnMap, setFeaturesOnMap] = useState([]);

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
        } catch (e) {
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
    } catch (err) {
      // ignore
    }

    return () => {
      try {
        map.off('click', handleMapClick);
        const container = map.getCanvas ? map.getCanvas() : null;
        if (container) container.style.cursor = '';
      } catch (err) {
        // ignore
      }
    };
  }, [map, step, handleMapClick]);

  const clearResults = () => {
    setResults(null);
    setCenter(null);
    setFeaturesOnMap([]);
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
      <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#1c1c1f] shadow-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sticky top-0 bg-[#1c1c1f] z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nf-red/20">
                <IconCircle className="h-5 w-5 text-nf-red" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-white">Find Nearby Facilities</h3>
                <p className="text-xs text-white/50">
                  {step === 'selecting' ? 'Click on the map to select center point' : 'Search facilities in radius'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full p-2 text-white/55 transition hover:bg-white/10 hover:text-white"
            >
              <IconClose className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-5 py-4">
            {/* Step Indicator */}
            <div className="flex items-center gap-2 mb-4">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                step === 'config' || step === 'selecting' ? 'bg-nf-red text-white' : 'bg-white/10 text-white/50'
              }`}>
                1
              </div>
              <div className="flex-1 h-0.5 bg-white/10" />
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                step === 'selecting' ? 'bg-nf-red text-white' : 'bg-white/10 text-white/50'
              }`}>
                2
              </div>
              <div className="flex-1 h-0.5 bg-white/10" />
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                step === 'results' ? 'bg-nf-red text-white' : 'bg-white/10 text-white/50'
              }`}>
                3
              </div>
            </div>

            {/* Layer Selection */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-kp-teal">
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
                        ? 'border-nf-red bg-nf-red/10 text-white'
                        : 'border-white/10 bg-[#1a1a1d] text-white/70 hover:border-white/20 hover:text-white'
                    }`}
                    disabled={step === 'selecting'}
                  >
                    <div 
                      className="w-4 h-4 rounded border flex items-center justify-center"
                      style={{ 
                        borderColor: selectedLayers.includes(layer.id) ? layer.color : '#ffffff30',
                        backgroundColor: selectedLayers.includes(layer.id) ? layer.color : 'transparent'
                      }}
                    >
                      {selectedLayers.includes(layer.id) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-lg">{layer.icon}</span>
                    <span className="flex-1">{layer.label}</span>
                    {results && results.results && results.results[layer.id] && (
                      <span className="text-xs bg-white/10 px-2 py-0.5 rounded">
                        {results.results[layer.id].features?.length || 0}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Distance Range */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-kp-teal">
                Search Radius: {radius} km
              </label>
              <input
                type="range"
                min="1"
                max="20"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="h-2 w-full accent-nf-red"
                disabled={step === 'selecting'}
              />
              <div className="mt-1 flex justify-between text-[10px] text-white/40">
                <span>1 km</span>
                <span>20 km</span>
              </div>
            </div>

            {/* Center Point Info */}
            {center && (
              <div className="mb-4 rounded-lg border border-white/10 bg-[#1a1a1d] px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <IconMapPin className="h-4 w-4 text-nf-red" />
                  <span className="text-white/70">Center:</span>
                  <span className="text-white font-mono">
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
                    <p className="text-sm font-semibold text-white">
                      Found {results.totalFeatures || 0} facilities
                    </p>
                    <p className="text-xs text-white/60 mt-1">
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
                className="w-full rounded-xl bg-nf-red px-4 py-3 text-sm font-bold text-white transition hover:bg-nf-red/90 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/5"
                >
                  New Search
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 rounded-xl bg-nf-red px-4 py-3 text-sm font-bold text-white transition hover:bg-nf-red/90"
                >
                  Done
                </button>
              </div>
            )}

            {step === 'selecting' && (
              <div className="text-center py-3">
                <p className="text-sm text-white/70">
                  🗺️ Click anywhere on the map to set the search center
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStep('config');
                    if (onSelectionEnd) onSelectionEnd();
                  }}
                  className="mt-2 text-xs text-white/50 hover:text-white underline"
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
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-[19999] bg-black/80 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm">
          Click on the map to select center point
        </div>
      )}
    </>
  );
}