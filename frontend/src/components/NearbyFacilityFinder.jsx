import { useState } from 'react';
import { IconClose, IconSearch, IconMapPin } from './UiIcons';

const FACILITY_TYPES = [
  { id: 'social-infrastructure', label: 'Hospital/School', icon: '🏥' },
  { id: 'transportation', label: 'Transportation', icon: '🚂' },
  { id: 'utilities', label: 'Utilities', icon: '⚡' },
  { id: 'administrative', label: 'Administrative', icon: '🏛️' },
  { id: 'all', label: 'Any Facility', icon: '📍' },
];

export function NearbyFacilityFinder({ open, onClose, onLocationSelect, currentView }) {
  const [selectedType, setSelectedType] = useState('social-infrastructure');
  const [maxDistance, setMaxDistance] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFind = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Use current map center as search location
      const lat = currentView?.lat || 28.48;
      const lng = currentView?.lng || 76.98;

      const response = await fetch('http://localhost:3001/api/features/nearest-facility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lng,
          facility_type: selectedType === 'all' ? null : selectedType,
          max_distance_km: maxDistance,
        }),
      });

      const data = await response.json();
      
      if (data.found) {
        setResult(data.facility);
        // Notify parent to fly to location
        if (onLocationSelect && data.facility.coordinates) {
          onLocationSelect(data.facility.coordinates);
        }
      } else {
        setError(data.message || 'No facility found');
      }
    } catch (err) {
      setError('Failed to find facility. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#1c1c1f] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nf-red/20">
                  <IconSearch className="h-5 w-5 text-nf-red" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-white">Find Closest Facility</h3>
                  <p className="text-xs text-white/50">Search from map center</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-white/55 transition hover:bg-white/10 hover:text-white"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-4">
              {/* Search Location Info */}
              <div className="mb-4 rounded-lg border border-white/10 bg-[#1a1a1d] px-3 py-2">
                <p className="text-[10px] text-white/50 uppercase tracking-wider">Search Location</p>
                <p className="text-xs text-white/80">
                  {currentView?.lat?.toFixed(4)}°, {currentView?.lng?.toFixed(4)}°
                </p>
                <p className="text-[10px] text-white/40 mt-1">Using current map center</p>
              </div>

              {/* Facility Type Selection */}
              <div className="mb-4">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-kp-teal">
                  Facility Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {FACILITY_TYPES.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setSelectedType(type.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                        selectedType === type.id
                          ? 'border-nf-red bg-nf-red/10 text-white'
                          : 'border-white/10 bg-[#1a1a1d] text-white/70 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <span className="text-lg">{type.icon}</span>
                      <span>{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Distance Range */}
              <div className="mb-4">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-kp-teal">
                  Search Radius: {maxDistance} km
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(Number(e.target.value))}
                  className="h-2 w-full accent-nf-red"
                />
                <div className="mt-1 flex justify-between text-[10px] text-white/40">
                  <span>1 km</span>
                  <span>20 km</span>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {error}
                </div>
              )}

              {/* Result */}
              {result && (
                <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20">
                      <IconMapPin className="h-4 w-4 text-green-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{result.name}</p>
                      <p className="text-xs text-white/60 capitalize">{result.type}</p>
                      <p className="mt-1 text-xs text-green-300">
                        {result.distanceKm.toFixed(2)} km away
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                type="button"
                onClick={handleFind}
                disabled={loading}
                className="w-full rounded-xl bg-nf-red px-4 py-3 text-sm font-bold text-white transition hover:bg-nf-red/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Searching...' : 'Find Closest Facility'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
