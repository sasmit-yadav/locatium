import { useEffect, useState } from 'react';
import {
  Hospital,
  Landmark,
  MapPin,
  Navigation,
  TrainFront,
  Zap,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { Card } from './ui/Card';
import { Slider } from './ui/Slider';
import { colors, layout } from '../design-system/tokens';
import { getMapsApiOrigin } from '../config/api';

const FACILITY_TYPES = [
  { id: 'social-infrastructure', label: 'Hospital / school', icon: Hospital },
  { id: 'transportation', label: 'Transportation', icon: TrainFront },
  { id: 'utilities', label: 'Utilities', icon: Zap },
  { id: 'administrative', label: 'Administrative', icon: Landmark },
  { id: 'all', label: 'Any facility', icon: MapPin },
];

function normalizeFacility(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const coordinates =
    raw.coordinates ||
    raw.geometry?.coordinates ||
    (raw.properties?.longitude != null && raw.properties?.latitude != null
      ? [Number(raw.properties.longitude), Number(raw.properties.latitude)]
      : null);
  const distanceKm = Number(raw.distanceKm);
  return {
    ...raw,
    name: raw.name || raw.properties?.school_name || raw.properties?.hospital_name || 'Nearest facility',
    type: raw.type || raw.layerId || 'facility',
    coordinates,
    distanceKm: Number.isFinite(distanceKm) ? distanceKm : null,
  };
}

export function NearbyFacilityFinder({ open, onClose, onLocationSelect, currentView }) {
  const [selectedType, setSelectedType] = useState('social-infrastructure');
  const [maxDistance, setMaxDistance] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
    }
  }, [open]);

  const handleFind = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const lat = currentView?.lat || 28.48;
      const lng = currentView?.lng || 76.98;

      const response = await fetch(`${getMapsApiOrigin()}/api/features/nearest-facility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lng,
          facility_type: selectedType === 'all' ? null : selectedType,
          max_distance_km: maxDistance,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || data.error || `Search failed (${response.status})`);
      }

      if (data.found) {
        const facility = normalizeFacility(data.facility);
        setResult(facility);
        if (onLocationSelect && Array.isArray(facility?.coordinates) && facility.coordinates.length >= 2) {
          onLocationSelect(facility.coordinates);
        }
      } else {
        setError(data.message || "Couldn't find a facility nearby — try a larger radius.");
      }
    } catch (err) {
      setError(err?.message || "Couldn't find facility — check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Find nearest facility"
      footer={
        <button
          type="button"
          onClick={handleFind}
          disabled={loading}
          className="h-9 rounded-ds-sm bg-ds-accent px-ds-4 text-ds-body-med text-ds-text-inverse transition hover:bg-ds-accent-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-ds-focus"
        >
          {loading ? 'Searching…' : 'Find nearest facility'}
        </button>
      }
    >
      <div className="space-y-ds-4">
        <Card padding="sm" className="bg-ds-surface-sunken">
          <p className="text-ds-caption uppercase tracking-wide text-ds-text-tertiary">Search from</p>
          <p className="mt-ds-1 font-mono text-ds-small text-ds-text-primary">
            {currentView?.lat?.toFixed(4)}°, {currentView?.lng?.toFixed(4)}°
          </p>
          <p className="mt-ds-1 text-ds-small text-ds-text-secondary">Current map center</p>
        </Card>

        <div>
          <p className="mb-ds-2 text-ds-caption uppercase tracking-wide text-ds-text-tertiary">Facility type</p>
          <div className="grid grid-cols-1 gap-ds-2">
            {FACILITY_TYPES.map((type) => {
              const Icon = type.icon;
              const selected = selectedType === type.id;
              return (
                <Card
                  key={type.id}
                  interactive
                  selected={selected}
                  padding="sm"
                  onClick={() => setSelectedType(type.id)}
                >
                  <div className="flex items-center gap-ds-2">
                    <Icon size={layout.iconButtonGlyph} style={{ color: selected ? colors.accent.default : colors.text.secondary }} />
                    <span className="text-ds-body-med text-ds-text-primary">{type.label}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <Slider
          label={`Search radius: ${maxDistance} km`}
          min={1}
          max={20}
          value={maxDistance}
          onChange={setMaxDistance}
        />

        {error ? (
          <div className="rounded-ds-sm border border-ds-danger/30 bg-ds-danger-subtle p-ds-3 text-ds-body text-ds-danger">
            {error}
          </div>
        ) : null}

        {result ? (
          <Card padding="md" className="border-ds-success/30 bg-ds-success-subtle">
            <div className="flex items-start gap-ds-3">
              <Navigation size={layout.iconButtonGlyph} className="text-ds-success" />
              <div>
                <p className="text-ds-subtitle text-ds-text-primary">{result.name}</p>
                <p className="text-ds-body capitalize text-ds-text-secondary">{result.type}</p>
                {result.distanceKm != null ? (
                  <p className="mt-ds-1 text-ds-body text-ds-success">{result.distanceKm.toFixed(2)} km away</p>
                ) : null}
                {Array.isArray(result.coordinates) && result.coordinates.length >= 2 ? (
                  <a
                    className="mt-ds-2 inline-block text-ds-body-med text-ds-accent-text hover:underline"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${result.coordinates[1]},${result.coordinates[0]}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get directions
                  </a>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </Modal>
  );
}
