import { useState } from 'react';
import { IconClose, IconBuilding, IconMapPin, IconUsers } from './UiIcons';

const FACILITY_ICONS = {
  'social-infrastructure': '🏥',
  'transportation': '🚂',
  'utilities': '⚡',
  'administrative': '🏛️',
  'environmental': '🌳',
  'cadastral': '📋',
  'constituencies': '🗳️',
};

export function ZoneFacilitiesPanel({ open, onClose, zoneId, zoneName }) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [selectedFacilityType, setSelectedFacilityType] = useState(null);
  const [facilitiesList, setFacilitiesList] = useState(null);
  const [error, setError] = useState(null);

  const fetchSummary = async () => {
    if (!zoneId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`http://localhost:3001/api/features/zone-facilities-summary?zoneId=${zoneId}`);
      const data = await response.json();
      setSummary(data);
    } catch (err) {
      setError('Failed to load facilities summary');
    } finally {
      setLoading(false);
    }
  };

  const fetchFacilitiesByType = async (facilityType) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`http://localhost:3001/api/features/zone-facilities/${zoneId}/${facilityType}?sort=distance&limit=20`);
      const data = await response.json();
      setFacilitiesList(data);
      setSelectedFacilityType(facilityType);
    } catch (err) {
      setError('Failed to load facilities');
    } finally {
      setLoading(false);
    }
  };

  // Fetch summary when panel opens
  if (open && !summary && !loading) {
    fetchSummary();
  }

  if (!open) return null;

  return (
    <div className="fixed bottom-0 right-0 top-16 z-[20000] flex w-full flex-col border-l border-white/15 bg-[#1c1c1f] sm:max-w-[400px] sm:top-16 sm:rounded-l-3xl sm:border-t">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-nf-red/20">
            <IconBuilding className="h-5 w-5 text-nf-red" />
          </div>
          <div>
            <h3 className="font-display text-sm font-bold text-white">Nearby Facilities</h3>
            <p className="text-xs text-white/50">{zoneName || 'Selected Zone'}</p>
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
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && !summary ? (
          <div className="flex items-center justify-center py-8 text-white/50">
            <div className="text-sm">Loading facilities...</div>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        ) : selectedFacilityType ? (
          // Facilities List View
          <FacilitiesListView
            facilities={facilitiesList}
            facilityType={selectedFacilityType}
            onBack={() => setSelectedFacilityType(null)}
          />
        ) : summary ? (
          // Summary Cards View
          <SummaryView
            summary={summary}
            onFacilityTypeClick={fetchFacilitiesByType}
          />
        ) : null}
      </div>
    </div>
  );
}

function SummaryView({ summary, onFacilityTypeClick }) {
  const facilityTypes = Object.keys(summary.facilitiesCount || {});

  if (facilityTypes.length === 0) {
    return (
      <div className="text-center py-8 text-white/50">
        <IconMapPin className="mx-auto h-12 w-12 mb-3 opacity-50" />
        <p className="text-sm">No facilities found nearby</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/40">Click a category to see details</p>
      
      {facilityTypes.map((type) => {
        const counts = summary.facilitiesCount[type];
        const icon = FACILITY_ICONS[type] || '📍';
        const label = type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        return (
          <button
            key={type}
            type="button"
            onClick={() => onFacilityTypeClick(type)}
            className="w-full rounded-xl border border-white/10 bg-[#1a1a1d] p-4 text-left transition hover:border-kp-teal/40 hover:bg-[#222225]"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{icon}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{label}</p>
                <div className="mt-1 flex gap-4 text-xs text-white/60">
                  <span>📍 2km: <strong className="text-white">{counts['2km']}</strong></span>
                  <span>📍 5km: <strong className="text-white">{counts['5km']}</strong></span>
                </div>
              </div>
              <IconUsers className="h-4 w-4 text-white/30" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FacilitiesListView({ facilities, facilityType, onBack }) {
  if (!facilities || facilities.facilities.length === 0) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-kp-teal hover:text-kp-teal/80"
        >
          ← Back to summary
        </button>
        <div className="text-center py-8 text-white/50">
          <p className="text-sm">No facilities found</p>
        </div>
      </div>
    );
  }

  const icon = FACILITY_ICONS[facilityType] || '📍';
  const label = facilityType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-kp-teal hover:text-kp-teal/80"
      >
        ← Back to summary
      </button>
      
      <div className="flex items-center gap-2 pb-2 border-b border-white/10">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-xs text-white/50">{facilities.count} facilities nearby</p>
        </div>
      </div>

      <div className="space-y-2">
        {facilities.facilities.map((facility) => (
          <div
            key={facility.id}
            className="rounded-lg border border-white/10 bg-[#1a1a1d] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{facility.name}</p>
                <p className="text-xs text-white/50 mt-1">
                  {facility.distanceFromZoneKm.toFixed(2)} km away
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
