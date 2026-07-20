import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Hospital,
  Landmark,
  MapPin,
  TrainFront,
  TreePine,
  Vote,
  Zap,
} from 'lucide-react';
import { Panel } from './ui/Panel';
import { StatCard } from './ui/StatCard';
import { Card } from './ui/Card';
import { Tabs } from './ui/Tabs';
import { EmptyState } from './ui/EmptyState';
import { Skeleton } from './ui/Skeleton';
import { colors, layout } from '../design-system/tokens';
import { getMapsApiOrigin } from '../config/api';

const FACILITY_ICONS = {
  'social-infrastructure': Hospital,
  transportation: TrainFront,
  utilities: Zap,
  administrative: Landmark,
  environmental: TreePine,
  cadastral: Building2,
  constituencies: Vote,
};

const [c0, c1, c2, c3, c4, c5] = colors.dataCategorical;

const FACILITY_COLORS = {
  'social-infrastructure': c3,
  transportation: c0,
  utilities: c2,
  administrative: c4,
  environmental: c1,
  cadastral: c5,
  constituencies: c4,
};

export function ZoneFacilitiesPanel({ open, onClose, zoneId, zoneName, lng, lat }) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [selectedFacilityType, setSelectedFacilityType] = useState(null);
  const [facilitiesList, setFacilitiesList] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('nearby');

  function buildQuery() {
    const params = new URLSearchParams();
    if (zoneId) params.set('zoneId', zoneId);
    if (lng != null && lat != null) {
      params.set('lng', String(lng));
      params.set('lat', String(lat));
    }
    return params.toString();
  }

  useEffect(() => {
    if (!open || (!zoneId && (lng == null || lat == null))) return undefined;
    let cancelled = false;

    async function fetchSummary() {
      setLoading(true);
      setError(null);
      try {
        const qs = buildQuery();
        const response = await fetch(`${getMapsApiOrigin()}/api/features/zone-facilities-summary?${qs}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.message || data.error || data.details || "Couldn't load facilities summary");
        }
        if (!cancelled) setSummary(data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Couldn't load facilities summary — check your connection and retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setSummary(null);
    setSelectedFacilityType(null);
    setFacilitiesList(null);
    fetchSummary();
    return () => {
      cancelled = true;
    };
  }, [open, zoneId, lng, lat]);

  const fetchFacilitiesByType = async (facilityType) => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery();
      const pathZone = encodeURIComponent(zoneId || 'point');
      const response = await fetch(
        `${getMapsApiOrigin()}/api/features/zone-facilities/${pathZone}/${facilityType}?sort=distance&limit=20&${qs}`
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || data.error || data.details || "Couldn't load facilities");
      }
      setFacilitiesList(data);
      setSelectedFacilityType(facilityType);
    } catch (err) {
      setError(err.message || "Couldn't load facilities — check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-0 right-0 top-[52px] z-ds-floating-panel w-full md:w-ds-panel">
      <Panel
        title="Nearby facilities"
        icon={Building2}
        onClose={onClose}
        anchor="bottom-sheet"
        className="h-full max-h-none rounded-none border-l border-ds-border md:rounded-none"
        width={layout.panelWidth}
      >
        <div className="border-b border-ds-border-subtle px-ds-4 py-ds-2">
          <p className="text-ds-small text-ds-text-secondary">{zoneName || 'Selected zone'}</p>
          <Tabs
            className="mt-ds-2"
            value={tab}
            onChange={setTab}
            tabs={[{ id: 'nearby', label: 'Nearby facilities' }]}
          />
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-ds-4 py-ds-4">
          {loading && !summary ? <Skeleton variant="card" count={3} /> : null}

          {error ? (
            <div className="rounded-ds-sm border border-ds-danger/30 bg-ds-danger-subtle p-ds-3 text-ds-body text-ds-danger">
              {error}
            </div>
          ) : null}

          {selectedFacilityType ? (
            <FacilitiesListView
              facilities={facilitiesList}
              facilityType={selectedFacilityType}
              onBack={() => setSelectedFacilityType(null)}
            />
          ) : summary ? (
            <SummaryView summary={summary} onFacilityTypeClick={fetchFacilitiesByType} />
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function SummaryView({ summary, onFacilityTypeClick }) {
  const facilityTypes = Object.keys(summary.facilitiesCount || {});

  if (facilityTypes.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="No facilities nearby"
        description="Try another zone or expand your search radius from Find nearest facility."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-ds-2">
      {facilityTypes.map((type) => {
        const counts = summary.facilitiesCount[type];
        const Icon = FACILITY_ICONS[type] || MapPin;
        const label = type.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        const value = `${counts['2km'] ?? 0}`;
        return (
          <button key={type} type="button" onClick={() => onFacilityTypeClick(type)} className="text-left">
            <StatCard
              icon={Icon}
              value={value}
              label={`${label} · ${counts['5km'] ?? 0} in 5 km`}
              accentColor={FACILITY_COLORS[type] || colors.dataCategorical[0]}
              className="transition hover:border-ds-accent"
            />
          </button>
        );
      })}
    </div>
  );
}

function FacilitiesListView({ facilities, facilityType, onBack }) {
  const Icon = FACILITY_ICONS[facilityType] || MapPin;
  const label = facilityType.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="space-y-ds-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-ds-1 text-ds-body-med text-ds-accent-text hover:underline focus-visible:outline-none focus-visible:shadow-ds-focus"
      >
        <ArrowLeft size={layout.iconInline} /> Back to summary
      </button>

      <div className="flex items-center gap-ds-2 border-b border-ds-border-subtle pb-ds-2">
        <Icon size={layout.iconButtonGlyph} style={{ color: FACILITY_COLORS[facilityType] || colors.accent.default }} />
        <div>
          <p className="text-ds-subtitle text-ds-text-primary">{label}</p>
          <p className="text-ds-small text-ds-text-secondary">
            {facilities?.count ?? 0} facilities nearby
          </p>
        </div>
      </div>

      {!facilities?.facilities?.length ? (
        <EmptyState title="No facilities found" description="Try another category from the summary." />
      ) : (
        <div className="space-y-ds-2">
          {facilities.facilities.map((facility) => (
            <Card key={facility.id} interactive padding="sm">
              <p className="truncate text-ds-body-med text-ds-text-primary">{facility.name}</p>
              <p className="mt-ds-1 text-ds-small text-ds-text-secondary">
                {facility.distanceFromZoneKm.toFixed(2)} km away
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
