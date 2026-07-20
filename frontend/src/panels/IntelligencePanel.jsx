import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertTriangle, Brain, BriefcaseBusiness, Building2, CheckCircle2, Mail, MapPinned, Route, ShieldCheck, Trophy, Zap, Pin, PanelRightClose } from 'lucide-react';
import { EChartPanel } from '../analytics/EChartPanel';
import {
  accessibilityContourOption,
  facilityBarOption,
  infrastructureHeatmapOption,
  opportunityRankingOption,
  scoreRadarOption,
  zoneComparisonRadarOption,
} from '../analytics/chartOptions';
import { ScoreGauge } from '../analytics/ScoreGauge';
import { scoreLocation } from '../services/analysis';
import { compareInvestorZones, downloadInvestorReport, emailInvestorReport, getInvestorOpportunities, getInvestorZoneAnalysis } from '../services/investor';
import { useDashboardStore } from '../stores/useDashboardStore';
import { addFavorite, deleteFavorite, listFavorites, recordAnalysis } from '../services/portal';
import { layout } from '../design-system/tokens';

function Metric({ icon: Icon, label, value, tone = 'accent' }) {
  const color =
    tone === 'warning' ? 'text-ds-warning' : tone === 'success' ? 'text-ds-success' : 'text-ds-accent';
  return (
    <div className="rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised p-ds-3">
      <div className="flex items-center gap-ds-2 text-ds-caption uppercase tracking-wide text-ds-text-tertiary">
        <Icon size={layout.iconInline} className={color} /> {label}
      </div>
      <div className="mt-ds-2 text-ds-stat text-ds-text-primary">{value}</div>
    </div>
  );
}

function distance(value) {
  if (value === null || value === undefined) return 'N/A';
  return `${Number(value).toFixed(2)} km`;
}

function buildInsight(analysis) {
  if (!analysis) return 'Select a location to generate spatial intelligence from local PostGIS layers.';
  const { scores } = analysis;
  const positives = [];
  const warnings = [];
  if (scores.accessibility >= 75) positives.push('strong logistics accessibility');
  if (scores.infrastructure >= 75) positives.push('dense public infrastructure');
  if (scores.environmentalRisk < 55) warnings.push('environmental screening required');
  if (scores.zoneCompatibility < 50) warnings.push('zone compatibility constraints');
  return `This location shows ${positives.join(' and ') || 'moderate opportunity potential'}. ${
    warnings.length ? `Watch for ${warnings.join(' and ')}.` : 'Risk indicators are currently manageable.'
  }`;
}

function acres(value) {
  if (!value) return 'N/A';
  return `${Number(value).toFixed(Number(value) >= 10 ? 1 : 2)} ac`;
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ds-text-secondary">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-2 text-xs font-semibold text-ds-text-primary outline-none transition focus:border-ds-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-ds-surface-raised text-ds-text-primary">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function IntelligencePanel({ collapsed }) {
  const [investorFilters, setInvestorFilters] = useState({
    sector: 'industrial',
    risk: 'medium',
    budget: '',
    zoneType: '',
  });
  const [compareIds, setCompareIds] = useState([]);
  const [reportState, setReportState] = useState({ loading: false, error: '' });
  const [emailState, setEmailState] = useState({
    open: false,
    to: '',
    message: '',
    loading: false,
    error: '',
    success: '',
  });
  const selectedLocation = useDashboardStore((s) => s.selectedLocation);
  
  // Bookmarking / favorites functionality
  const queryClient = useQueryClient();
  const [bookmarkNotes, setBookmarkNotes] = useState('');
  const [bookmarkError, setBookmarkError] = useState('');

  const favoritesQuery = useQuery({
    queryKey: ['portal-favorites'],
    queryFn: () => listFavorites().catch(() => []),
    staleTime: 1000 * 60 * 5,
  });

  const favorites = favoritesQuery.data || [];
  const selectedInvestorZoneId = useDashboardStore((s) => s.selectedFeature?.investorZoneId);
  const activeFavorite = favorites.find(fav => fav.zoneId === selectedInvestorZoneId);
  const isBookmarked = Boolean(activeFavorite);

  const addBookmarkMutation = useMutation({
    mutationFn: ({ zoneId, notes }) => addFavorite(zoneId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-favorites'] });
      setBookmarkNotes('');
      setBookmarkError('');
    },
    onError: (err) => {
      setBookmarkError(err.message || 'Failed to add bookmark');
    },
  });

  const removeBookmarkMutation = useMutation({
    mutationFn: (favId) => deleteFavorite(favId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-favorites'] });
      setBookmarkError('');
    },
    onError: (err) => {
      setBookmarkError(err.message || 'Failed to remove bookmark');
    },
  });

  function handleToggleBookmark() {
    if (isBookmarked) {
      removeBookmarkMutation.mutate(activeFavorite.id);
    } else {
      if (!selectedInvestorZoneId) return;
      addBookmarkMutation.mutate({ zoneId: selectedInvestorZoneId, notes: bookmarkNotes });
    }
  }
  const selectedFeature = useDashboardStore((s) => s.selectedFeature);
  const setApiLatencyMs = useDashboardStore((s) => s.setApiLatencyMs);
  const flyTo = useDashboardStore((s) => s.flyTo);
  const rightCollapsed = useDashboardStore((s) => s.rightCollapsed);
  const toggleRight = useDashboardStore((s) => s.toggleRight);
  const activeTab = useDashboardStore((s) => s.activeInspectorTab);
  const setActiveTab = useDashboardStore((s) => s.setActiveInspectorTab);
  const isPinned = useDashboardStore((s) => s.isInspectorPinned);
  const togglePin = useDashboardStore((s) => s.toggleInspectorPin);

  const analysisQuery = useQuery({
    queryKey: ['score-location', selectedLocation.lat, selectedLocation.lng],
    queryFn: async () => {
      const started = performance.now();
      const result = await scoreLocation({ lat: selectedLocation.lat, lng: selectedLocation.lng, sector: 'industrial' });
      setApiLatencyMs(Math.round(performance.now() - started));
      recordAnalysis({
        label: selectedLocation.name,
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        sector: 'industrial',
        overallScore: result.overallScore,
        scores: result.scores,
      })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['portal-analysis-history'] });
          queryClient.invalidateQueries({ queryKey: ['portal-stats'] });
        })
        .catch(() => {});
      return result;
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const opportunitiesQuery = useQuery({
    queryKey: ['investor-opportunities', investorFilters],
    queryFn: () => getInvestorOpportunities({ ...investorFilters, limit: 20 }),
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const zoneAnalysisQuery = useQuery({
    queryKey: ['investor-zone-analysis', selectedInvestorZoneId, investorFilters.sector],
    queryFn: () => getInvestorZoneAnalysis({ zoneId: selectedInvestorZoneId, sector: investorFilters.sector }),
    enabled: Boolean(selectedInvestorZoneId),
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const comparisonQuery = useQuery({
    queryKey: ['investor-zone-comparison', compareIds, investorFilters.sector],
    queryFn: () => compareInvestorZones({ zones: compareIds, sector: investorFilters.sector }),
    enabled: compareIds.length >= 2,
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  function updateFilter(key, value) {
    setInvestorFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleCompare(zoneId) {
    setCompareIds((current) => {
      if (current.includes(zoneId)) return current.filter((id) => id !== zoneId);
      if (current.length >= 4) return [...current.slice(1), zoneId];
      return [...current, zoneId];
    });
  }

  function triggerDownload(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function handleExportCsv() {
    const rows = opportunitiesQuery.data?.opportunities || [];
    if (!rows.length) return;

    const header = ['name', 'district', 'type', 'zoneType', 'opportunityScore', 'infrastructure', 'accessibility', 'environmentalRisk', 'zoneCompatibility'];
    const lines = [header.join(',')];
    for (const row of rows) {
      const scores = row.analysis?.scores || {};
      lines.push(
        [
          row.name,
          row.district,
          row.type,
          row.zoneType,
          row.opportunityScore,
          scores.infrastructure ?? '',
          scores.accessibility ?? '',
          scores.environmentalRisk ?? '',
          scores.zoneCompatibility ?? '',
        ]
          .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
          .join(',')
      );
    }

    triggerDownload(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `locatium-investor-ranking-${selectedLocation.name.replace(/\s+/g, '-').toLowerCase()}.csv`);
  }

  function handleExportGeoJson() {
    const rows = comparisonZones.length ? comparisonZones : opportunitiesQuery.data?.opportunities || [];
    if (!rows.length) return;

    const features = rows.map((row) => {
      const geometry = row.geometry || (row.center ? { type: 'Point', coordinates: [row.center.lng, row.center.lat] } : null);
      return {
        type: 'Feature',
        geometry,
        properties: {
          id: row.id,
          name: row.name,
          district: row.district,
          type: row.type,
          zoneType: row.zoneType,
          opportunityScore: row.opportunityScore ?? null,
          infrastructure: row.analysis?.scores?.infrastructure ?? row.scores?.infrastructure ?? null,
          accessibility: row.analysis?.scores?.accessibility ?? row.scores?.accessibility ?? null,
          environmentalRisk: row.analysis?.scores?.environmentalRisk ?? row.scores?.environmentalRisk ?? null,
          zoneCompatibility: row.analysis?.scores?.zoneCompatibility ?? row.scores?.zoneCompatibility ?? null,
        },
      };
    });

    const geoJson = {
      type: 'FeatureCollection',
      features,
    };

    triggerDownload(
      new Blob([JSON.stringify(geoJson, null, 2)], { type: 'application/geo+json;charset=utf-8' }),
      `locatium-investor-zones-${selectedLocation.name.replace(/\s+/g, '-').toLowerCase()}.geojson`
    );
  }

  async function handleDownloadReport() {
    if (!selectedInvestorZoneId || reportState.loading) return;

    try {
      setReportState({ loading: true, error: '' });
      const { blob, filename } = await downloadInvestorReport({
        zoneId: selectedInvestorZoneId,
        sector: investorFilters.sector,
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setReportState({ loading: false, error: '' });
    } catch (error) {
      setReportState({ loading: false, error: error instanceof Error ? error.message : 'Failed to generate report' });
    }
  }

  async function handleEmailReport() {
    if (!selectedInvestorZoneId) return;

    if (!emailState.open) {
      setEmailState((prev) => ({ ...prev, open: true, error: '', success: '' }));
      return;
    }

    if (!emailState.to.trim()) {
      setEmailState((prev) => ({ ...prev, error: 'Recipient email is required' }));
      return;
    }

    try {
      setEmailState((prev) => ({ ...prev, loading: true, error: '', success: '' }));
      const result = await emailInvestorReport({
        to: emailState.to.trim(),
        zoneId: selectedInvestorZoneId,
        sector: investorFilters.sector,
        message: emailState.message.trim() || undefined,
      });
      const modeNote =
        result.deliveryMode === 'outbox'
          ? 'Saved to server outbox (SMTP not configured).'
          : 'Email sent successfully.';
      setEmailState((prev) => ({
        ...prev,
        loading: false,
        success: `${modeNote} Delivered to ${result.to}.`,
        error: '',
      }));
    } catch (error) {
      setEmailState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to email report',
        success: '',
      }));
    }
  }

  if (collapsed) return null;

  const analysis = analysisQuery.data;
  const scores = analysis?.scores || {};
  const details = analysis?.details || {};
  const comparisonZones =
    comparisonQuery.data?.zones?.length
      ? comparisonQuery.data.zones
      : analysis
        ? [
            {
              name: selectedLocation.name,
              scores: {
                infrastructure: scores.infrastructure,
                accessibility: scores.accessibility,
                environmentalRisk: scores.environmentalRisk,
                zoneCompatibility: scores.zoneCompatibility,
              },
            },
            ...(opportunitiesQuery.data?.opportunities || []).slice(0, 3),
          ]
        : [];

  if (rightCollapsed) return null;

  return (
    <div className="z-ds-floating-panel flex w-[420px] shrink-0 flex-col border-l border-ds-border bg-ds-surface-raised shadow-ds-sm">
      <div className="flex shrink-0 flex-col border-b border-ds-border-subtle">
        <div className="flex items-center justify-between p-ds-3">
          <div className="flex items-center gap-ds-2 text-ds-caption uppercase tracking-wide text-ds-text-tertiary">
            <Brain size={layout.iconInline} className="text-ds-accent" /> Inspector
          </div>
          <div className="flex gap-ds-1">
            <button
              type="button"
              onClick={togglePin}
              className={`grid h-8 w-8 place-items-center rounded-ds-sm transition focus-visible:outline-none focus-visible:shadow-ds-focus ${
                isPinned ? 'bg-ds-accent-subtle text-ds-accent' : 'text-ds-text-secondary hover:bg-ds-surface-sunken hover:text-ds-text-primary'
              }`}
              title={isPinned ? 'Unpin' : 'Pin'}
              aria-label={isPinned ? 'Unpin inspector' : 'Pin inspector'}
            >
              <Pin size={layout.iconInline} />
            </button>
            <button
              type="button"
              onClick={toggleRight}
              className="grid h-8 w-8 place-items-center rounded-ds-sm text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary focus-visible:outline-none focus-visible:shadow-ds-focus"
              title="Close"
              aria-label="Close inspector"
            >
              <PanelRightClose size={layout.iconInline} />
            </button>
          </div>
        </div>
        
        <div className="flex gap-ds-4 px-ds-3">
          {['overview', 'analysis', 'investor'].map((t) => (
            <button
              key={t}
              type="button"
              className={`relative flex h-10 items-center text-ds-body-med capitalize transition-colors duration-ds-fast ease-ds ${
                activeTab === t ? 'text-ds-text-primary' : 'text-ds-text-secondary hover:text-ds-text-primary'
              }`}
              onClick={() => setActiveTab(t)}
            >
              {t}
              {activeTab === t ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ds-accent" aria-hidden /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-ds-4 overflow-y-auto bg-ds-surface-base p-ds-4">
        {activeTab === 'overview' && (
          <>
        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">Location overview</div>
              <h2 className="mt-1 text-xl font-bold text-ds-text-primary">{selectedLocation.name}</h2>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ds-text-secondary">
                <span>District: {selectedLocation.district}</span>
                <span>Tehsil: {selectedLocation.tehsil}</span>
                <span>Land: {selectedLocation.landType}</span>
                <span>{selectedLocation.area}</span>
              </div>
            </div>
            <div className="h-20 w-24 rounded-lg border border-ds-border bg-ds-surface-sunken" />
          </div>
          <div className="mt-3 rounded-lg bg-ds-surface-sunken px-3 py-2 font-mono text-xs text-ds-text-secondary">
            {selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)}
          </div>
        </section>

        {selectedFeature ? (
          <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">Selected feature</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-ds-text-primary">{selectedFeature.name}</div>
                <div className="text-xs text-ds-text-secondary">{selectedFeature.tableId} · {selectedFeature.layerId}</div>
              </div>
              <div className="rounded-lg border border-ds-accent bg-ds-accent-subtle px-2 py-1 text-[11px] font-semibold text-ds-accent">
                {selectedFeature.type}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ds-text-secondary">
              {Object.entries(selectedFeature.properties || {})
                .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
                .slice(0, 6)
                .map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-ds-surface-sunken px-2 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-ds-text-tertiary">{key}</div>
                    <div className="truncate text-ds-text-primary">{String(value)}</div>
                  </div>
                ))}
            </div>
          </section>
        ) : null}

        {analysisQuery.isError ? (
          <div className="rounded-lg border border-ds-danger/40 bg-ds-danger-subtle p-3 text-sm text-ds-danger">
            {analysisQuery.error.message}
          </div>
        ) : null}

        {selectedInvestorZoneId ? (
          <section className="rounded-lg border border-ds-warning/30 bg-ds-surface-raised p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">Zone profile</div>
                <div className="mt-1 text-sm font-bold text-ds-text-primary">
                  {zoneAnalysisQuery.data?.zone?.name || selectedFeature.name}
                </div>
              </div>
              <div className="rounded-lg border border-ds-warning/30 bg-ds-warning-subtle px-2 py-1 text-sm font-black text-ds-warning">
                {zoneAnalysisQuery.data?.opportunity?.opportunityScore ?? '...'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadReport}
              disabled={!selectedInvestorZoneId || reportState.loading}
              className="mt-3 flex h-10 w-full items-center justify-center rounded-lg border border-ds-accent bg-ds-accent-subtle px-3 text-ds-body-med text-ds-accent transition hover:border-ds-accent-hover hover:bg-ds-accent-subtle disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reportState.loading ? 'Generating PDF report...' : 'Download PDF report'}
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!opportunitiesQuery.data?.opportunities?.length}
                className="flex h-9 items-center justify-center rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 text-ds-small text-ds-text-primary transition hover:border-ds-accent hover:bg-ds-accent-subtle disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={handleExportGeoJson}
                disabled={!((comparisonZones.length || opportunitiesQuery.data?.opportunities?.length) > 0)}
                className="flex h-9 items-center justify-center rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 text-ds-small text-ds-text-primary transition hover:border-ds-accent hover:bg-ds-accent-subtle disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export GeoJSON
              </button>
            </div>
            <button
              type="button"
              onClick={handleEmailReport}
              disabled={!selectedInvestorZoneId || emailState.loading}
              className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 text-ds-small text-ds-text-primary transition hover:border-ds-accent hover:bg-ds-accent-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Mail size={13} /> {emailState.open ? (emailState.loading ? 'Sending...' : 'Send report email') : 'Email report'}
            </button>
            {emailState.open ? (
              <div className="mt-2 space-y-2 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ds-text-secondary">
                  Recipient email
                  <input
                    type="email"
                    value={emailState.to}
                    onChange={(event) => setEmailState((prev) => ({ ...prev, to: event.target.value, error: '', success: '' }))}
                    placeholder="stakeholder@example.com"
                    className="mt-1 h-9 w-full rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-2 text-xs text-ds-text-primary outline-none focus:border-ds-accent"
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ds-text-secondary">
                  Optional message
                  <textarea
                    value={emailState.message}
                    onChange={(event) => setEmailState((prev) => ({ ...prev, message: event.target.value }))}
                    rows={3}
                    placeholder="Add context for the recipient..."
                    className="mt-1 w-full rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-2 py-2 text-xs text-ds-text-primary outline-none focus:border-ds-accent"
                  />
                </label>
                {emailState.error ? <div className="text-xs text-red-300">{emailState.error}</div> : null}
                {emailState.success ? <div className="text-xs text-ds-success">{emailState.success}</div> : null}
              </div>
            ) : null}
            
            {/* Bookmark Section */}
            <div className="mt-4 border-t border-ds-border-subtle pt-4 space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ds-text-secondary">Bookmark & Notes</div>
              {isBookmarked ? (
                <div className="flex flex-col gap-2 rounded-lg bg-ds-accent-subtle border border-ds-accent p-3">
                  <div className="flex items-center justify-between text-xs text-ds-text-primary">
                    <span className="flex items-center gap-1 font-semibold text-ds-accent">
                      <CheckCircle2 size={14} /> Bookmarked Zone
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleBookmark}
                      disabled={removeBookmarkMutation.isPending}
                      className="text-[10px] uppercase font-bold text-red-400 hover:text-red-300 transition"
                    >
                      {removeBookmarkMutation.isPending ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                  {activeFavorite.notes ? (
                    <div className="font-sans text-[11px] leading-relaxed text-ds-text-secondary italic bg-ds-surface-sunken p-2 rounded">
                      "{activeFavorite.notes}"
                    </div>
                  ) : (
                    <div className="text-[10px] text-ds-text-secondary italic">No custom notes added.</div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={bookmarkNotes}
                    onChange={(e) => setBookmarkNotes(e.target.value)}
                    placeholder="Add bookmark notes (e.g., target area, budget constraint)..."
                    className="w-full min-h-[50px] rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-2.5 text-xs text-ds-text-primary outline-none focus:border-ds-accent"
                  />
                  <button
                    type="button"
                    onClick={handleToggleBookmark}
                    disabled={addBookmarkMutation.isPending || !selectedInvestorZoneId}
                    className="flex h-8 w-full items-center justify-center rounded-lg bg-ds-accent text-ds-text-inverse transition hover:bg-ds-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {addBookmarkMutation.isPending ? 'Bookmarking...' : 'Bookmark Zone'}
                  </button>
                </div>
              )}
              {bookmarkError && (
                <div className="text-[10px] text-red-400 mt-1">{bookmarkError}</div>
              )}
            </div>

            {reportState.error ? <div className="mt-2 rounded-lg border border-ds-danger/40 bg-ds-danger-subtle p-2 text-xs text-ds-danger">{reportState.error}</div> : null}

            {zoneAnalysisQuery.isLoading ? <div className="mt-3 text-xs text-ds-text-secondary">Loading detailed zone profile...</div> : null}
            {zoneAnalysisQuery.isError ? (
              <div className="mt-3 rounded-lg border border-ds-danger/40 bg-ds-danger-subtle p-3 text-xs text-ds-danger">
                {zoneAnalysisQuery.error.message}
              </div>
            ) : null}

            {zoneAnalysisQuery.data ? (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="rounded-lg bg-ds-surface-sunken p-2">
                    <div className="font-bold text-ds-text-primary">{acres(zoneAnalysisQuery.data.zone.areaAcres)}</div>
                    <div className="text-ds-text-secondary">Mapped area</div>
                  </div>
                  <div className="rounded-lg bg-ds-surface-sunken p-2">
                    <div className="font-bold capitalize text-ds-text-primary">{zoneAnalysisQuery.data.zone.zoneType}</div>
                    <div className="text-ds-text-secondary">Zone type</div>
                  </div>
                  <div className="rounded-lg bg-ds-surface-sunken p-2">
                    <div className="font-bold capitalize text-ds-text-primary">{zoneAnalysisQuery.data.recommendation.verdict}</div>
                    <div className="text-ds-text-secondary">Verdict</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-ds-text-secondary">
                  <div className="rounded-lg bg-ds-surface-sunken p-2">
                    <div className="text-[10px] uppercase tracking-wider text-ds-text-tertiary">Hospitals 5km</div>
                    <div className="text-ds-text-primary">{zoneAnalysisQuery.data.context.facilities.hospitals.within5Km}</div>
                  </div>
                  <div className="rounded-lg bg-ds-surface-sunken p-2">
                    <div className="text-[10px] uppercase tracking-wider text-ds-text-tertiary">Schools 5km</div>
                    <div className="text-ds-text-primary">{zoneAnalysisQuery.data.context.facilities.schools.within5Km}</div>
                  </div>
                  <div className="rounded-lg bg-ds-surface-sunken p-2">
                    <div className="text-[10px] uppercase tracking-wider text-ds-text-tertiary">Road distance</div>
                    <div className="text-ds-text-primary">{distance(zoneAnalysisQuery.data.context.transport.nearestRoadKm)}</div>
                  </div>
                  <div className="rounded-lg bg-ds-surface-sunken p-2">
                    <div className="text-[10px] uppercase tracking-wider text-ds-text-tertiary">Airport distance</div>
                    <div className="text-ds-text-primary">{distance(zoneAnalysisQuery.data.context.transport.nearestAirportKm)}</div>
                  </div>
                </div>

                <div className="rounded-lg bg-ds-surface-sunken p-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ds-text-secondary">
                    <CheckCircle2 size={14} className="text-ds-success" /> Recommendation
                  </div>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-200">
                    {zoneAnalysisQuery.data.recommendation.positives.slice(0, 2).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                    {zoneAnalysisQuery.data.recommendation.cautions.slice(0, 2).map((item) => (
                      <li key={item} className="text-amber-100">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ds-text-secondary">Similar benchmarks</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {zoneAnalysisQuery.data.benchmarks.map((benchmark) => (
                      <div key={benchmark.id} className="rounded-lg bg-ds-surface-sunken p-2">
                        <div className="truncate text-xs font-bold text-ds-text-primary">{benchmark.name}</div>
                        <div className="mt-1 text-[11px] text-ds-text-secondary">
                          Score {benchmark.opportunityScore} · Similar {benchmark.similarityScore}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

          </>
        )}

        {activeTab === 'analysis' && (
          <>
            <section className="grid grid-cols-2 gap-3">
              <ScoreGauge label="Infrastructure" value={scores.infrastructure} kind="infrastructure" />
          <ScoreGauge label="Accessibility" value={scores.accessibility} kind="accessibility" />
          <ScoreGauge label="Environmental" value={scores.environmentalRisk} kind="environmentalRisk" />
          <ScoreGauge label="Investment" value={scores.zoneCompatibility} kind="zoneCompatibility" />
        </section>

        <section className="grid grid-cols-1 gap-3">
          <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">Infrastructure heatmap</div>
            <EChartPanel option={infrastructureHeatmapOption(details)} />
          </div>
          <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">Accessibility contours</div>
            <EChartPanel option={accessibilityContourOption(details)} />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Metric icon={Route} label="Nearest road" value={distance(details.accessibility?.metrics?.nearestRoadKm)} />
          <Metric icon={Building2} label="Hospitals" value={details.infrastructure?.metrics?.hospitals ?? 'N/A'} />
          <Metric icon={MapPinned} label="Railway" value={distance(details.accessibility?.metrics?.nearestRailKm)} />
          <Metric icon={Zap} label="Airport" value={distance(details.accessibility?.metrics?.nearestAirportKm)} />
          <Metric icon={ShieldCheck} label="Risk score" value={details.environmentalRisk?.risk ?? 'N/A'} tone="success" />
          <Metric icon={AlertTriangle} label="Forest" value={distance(details.environmentalRisk?.metrics?.nearestForestKm)} tone="warning" />
        </section>

        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">Scoring radar</div>
          <EChartPanel option={scoreRadarOption(scores)} />
        </section>

        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">Facility counts</div>
          <EChartPanel option={facilityBarOption(details)} />
        </section>

        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">Top 20 opportunity ranking</div>
          <EChartPanel option={opportunityRankingOption(opportunitiesQuery.data?.opportunities || [])} />
        </section>

        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">Zone comparison radar</div>
          <EChartPanel option={zoneComparisonRadarOption(comparisonZones)} />
        </section>

        <section className="rounded-lg border border-ds-accent bg-ds-accent-subtle p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-ds-accent">
            <Brain size={16} /> AI insights
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-100">{analysisQuery.isLoading ? 'Generating spatial intelligence...' : buildInsight(analysis)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-ds-text-secondary">
            <div className="rounded-lg bg-ds-surface-sunken py-2">Summary</div>
            <div className="rounded-lg bg-ds-surface-sunken py-2">Warnings</div>
            <div className="rounded-lg bg-ds-surface-sunken py-2">Opportunities</div>
          </div>
        </section>

          </>
        )}

        {activeTab === 'investor' && (
          <>
            <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">
                    <BriefcaseBusiness size={15} className="text-ds-warning" /> Investor opportunities
                  </div>
              <div className="mt-1 text-xs text-ds-text-secondary">Week 6 ranking engine with local PostGIS filters.</div>
            </div>
            <div className="rounded-lg border border-ds-warning/30 bg-ds-warning-subtle px-2 py-1 text-[11px] font-bold text-ds-warning">
              {opportunitiesQuery.data?.count ?? 0}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <SelectField
              label="Sector"
              value={investorFilters.sector}
              onChange={(value) => updateFilter('sector', value)}
              options={[
                { value: 'industrial', label: 'Industrial' },
                { value: 'commercial', label: 'Commercial' },
                { value: 'residential', label: 'Residential' },
                { value: 'agricultural', label: 'Agricultural' },
              ]}
            />
            <SelectField
              label="Risk"
              value={investorFilters.risk}
              onChange={(value) => updateFilter('risk', value)}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
            <SelectField
              label="Budget"
              value={investorFilters.budget}
              onChange={(value) => updateFilter('budget', value)}
              options={[
                { value: '', label: 'Any' },
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
            <SelectField
              label="Zone type"
              value={investorFilters.zoneType}
              onChange={(value) => updateFilter('zoneType', value)}
              options={[
                { value: '', label: 'Any' },
                { value: 'government', label: 'Government' },
                { value: 'private', label: 'Private' },
                { value: 'cooperative', label: 'Cooperative' },
              ]}
            />
          </div>

          {opportunitiesQuery.isError ? (
            <div className="mt-3 rounded-lg border border-ds-danger/40 bg-ds-danger-subtle p-3 text-xs text-ds-danger">
              {opportunitiesQuery.error.message}
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {opportunitiesQuery.isLoading ? (
              <div className="rounded-lg bg-ds-surface-sunken px-3 py-3 text-sm text-ds-text-secondary">Ranking local investment zones...</div>
            ) : null}

            {(opportunitiesQuery.data?.opportunities || []).map((zone, index) => (
              <div
                key={zone.id}
                className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 py-3 transition hover:border-ds-accent hover:bg-ds-accent-subtle"
              >
                <button
                  type="button"
                  onClick={() =>
                    flyTo({
                      lng: zone.center.lng,
                      lat: zone.center.lat,
                      zoom: 13,
                      name: zone.name,
                      type: zone.type,
                      feature: {
                        tableId: zone.tableId,
                        layerId: 'industrial-investment',
                        investorZoneId: zone.id,
                        featureId: zone.featureId,
                        name: zone.name,
                        type: zone.type,
                        geometry: zone.geometry,
                        center: zone.center,
                        properties: zone.properties,
                      },
                    })
                  }
                  className="w-full text-left"
                >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Trophy size={14} className={index === 0 ? 'text-ds-warning' : 'text-ds-text-secondary'} />
                      <div className="truncate text-sm font-bold text-ds-text-primary">{zone.name}</div>
                    </div>
                    <div className="mt-1 truncate text-xs text-ds-text-secondary">
                      {zone.district} · {zone.type} · {acres(zone.areaAcres)}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-lg bg-ds-warning-subtle px-2 py-1 text-sm font-black text-ds-warning">
                    {zone.opportunityScore}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-ds-text-secondary">
                  <span>Infra {zone.components.infrastructure}</span>
                  <span>Access {zone.components.accessibility}</span>
                  <span>Fit {zone.components.zoneTypeMatch}</span>
                </div>
                </button>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-ds-text-secondary">
                    {zone.zoneType} · {zone.description}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCompare(zone.id)}
                    className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold ${
                      compareIds.includes(zone.id)
                        ? 'border-ds-success bg-ds-success-subtle text-ds-success'
                        : 'border-ds-border-subtle bg-ds-surface-sunken text-ds-text-secondary'
                    }`}
                  >
                    Compare
                  </button>
                </div>
              </div>
            ))}
          </div>

          {compareIds.length ? (
            <div className="mt-3 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ds-text-secondary">
                  Compare matrix · {compareIds.length}/4
                </div>
                <button type="button" onClick={() => setCompareIds([])} className="text-[11px] font-semibold text-ds-text-secondary hover:text-ds-text-primary">
                  Clear
                </button>
              </div>
              {compareIds.length < 2 ? <div className="mt-2 text-xs text-ds-text-secondary">Select one more zone to compare.</div> : null}
              {comparisonQuery.isLoading ? <div className="mt-2 text-xs text-ds-text-secondary">Building comparison...</div> : null}
              {comparisonQuery.isError ? <div className="mt-2 text-xs text-ds-danger">{comparisonQuery.error.message}</div> : null}
              {comparisonQuery.data ? (
                <div className="mt-2 space-y-2">
                  {comparisonQuery.data.matrix.map((row) => (
                    <div key={row.id} className="grid grid-cols-[1fr_48px_48px_48px] items-center gap-2 rounded-lg bg-ds-surface-sunken p-2 text-[11px]">
                      <div className="truncate font-semibold text-ds-text-primary">{row.name}</div>
                      <div className="text-ds-warning">{row.opportunityScore}</div>
                      <div className="text-ds-text-secondary">I {row.infrastructure}</div>
                      <div className="text-ds-text-secondary">A {row.accessibility}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
