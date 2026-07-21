import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertTriangle, Brain, BriefcaseBusiness, Building2, CheckCircle2, ChevronDown, ChevronUp, Mail, MapPinned, Route, ShieldCheck, Trophy, Zap, Pin, PanelRightClose, Search, Navigation } from 'lucide-react';
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
import { ScoreBreakdown } from '../analytics/ScoreBreakdown';
import { MethodBadge } from '../components/MethodBadge';
import { InvestorPipelineBoard } from '../components/InvestorPipelineBoard';
import { scoreLocation } from '../services/analysis';
import { compareInvestorZones, downloadInvestorReport, downloadPortfolioReport, emailInvestorReport, getInvestorDistricts, getInvestorOpportunities, getInvestorZoneAnalysis } from '../services/investor';
import { useDashboardStore } from '../stores/useDashboardStore';
import { addFavorite, deleteFavorite, listFavorites, recordAnalysis, saveSearch, listSearches, getPipelineBoard, upsertPipelineItem, upsertPortfolio, listPortfolios, deletePortfolio, subscribeSearchAlert, listSearchAlerts, deleteSearchAlert } from '../services/portal';
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

function formatInr(value) {
  if (value == null || Number.isNaN(Number(value))) return 'N/A';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function buildInsight(analysis) {
  if (!analysis) return 'Select a location on the map to generate location intelligence.';
  return analysis.insights?.summary || 'Analysis complete — see component scores below.';
}

function InsightList({ title, items, icon: Icon, tone = 'default' }) {
  if (!items?.length) return null;
  const toneClass =
    tone === 'success'
      ? 'text-ds-success'
      : tone === 'warning'
        ? 'text-ds-warning'
        : tone === 'accent'
          ? 'text-ds-accent'
          : 'text-ds-text-secondary';
  return (
    <div>
      <div className={`mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${toneClass}`}>
        <Icon size={14} /> {title}
      </div>
      <ul className="space-y-2 text-sm leading-6 text-ds-text-primary">
        {items.map((item) => (
          <li key={item} className="rounded-lg bg-ds-surface-sunken px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoreInsightsBlock({ analysis, loading }) {
  if (loading) {
    return (
      <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
        <div className="text-sm text-ds-text-secondary">Generating location intelligence brief…</div>
      </section>
    );
  }
  if (!analysis?.insights) return null;

  const { verdict, summary, strengths, cautions, opportunities, methodology } = analysis.insights;
  const narrative = analysis.narrative;
  const verdictTone =
    verdict === 'Strong opportunity' ? 'text-ds-success' : verdict === 'Moderate opportunity' ? 'text-ds-warning' : 'text-ds-danger';

  return (
    <section className="rounded-lg border border-ds-accent/30 bg-ds-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">
          <Brain size={16} className="text-ds-accent" /> Location intelligence brief
          {narrative?.method === 'llm' ? (
            <span className="rounded bg-ds-accent/20 px-1.5 py-0.5 text-[9px] normal-case text-ds-accent">AI narrative</span>
          ) : (
            <span className="rounded bg-ds-surface-sunken px-1.5 py-0.5 text-[9px] normal-case text-ds-text-tertiary">Rule-based</span>
          )}
        </div>
        <span className={`text-xs font-bold uppercase tracking-wide ${verdictTone}`}>{verdict}</span>
      </div>
      <p className="mt-3 text-sm leading-7 text-ds-text-primary">{summary}</p>

      {analysis.landValue?.estimatedPerSqYardInr ? (
        <div className="mt-3 rounded-lg bg-ds-surface-sunken px-3 py-2 text-xs leading-5 text-ds-text-secondary">
          <span className="font-semibold text-ds-text-primary">Land value estimate: </span>
          ₹{analysis.landValue.estimatedPerSqYardInr.toLocaleString('en-IN')}/sq yd
          {analysis.landValue.roiProxy != null ? ` · ROI proxy vs circle rate: ${(analysis.landValue.roiProxy * 100).toFixed(1)}%` : ''}
          {' · '}
          {analysis.landValue.method.replace(/_/g, ' ')}
        </div>
      ) : null}

      {analysis.comparables?.summary?.message ? (
        <div className="mt-2 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 py-2 text-xs text-ds-text-secondary">
          {analysis.comparables.summary.message}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4">
        <InsightList title="Why it works" items={strengths} icon={CheckCircle2} tone="success" />
        <InsightList title="Risks to review" items={cautions} icon={AlertTriangle} tone="warning" />
        <InsightList title="Next steps" items={opportunities} icon={Trophy} tone="accent" />
      </div>

      {narrative?.memo ? (
        <div className="mt-4 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ds-text-tertiary">Investor memo</div>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-ds-text-primary">{narrative.memo}</p>
        </div>
      ) : null}

      {analysis.policyCitations?.length ? (
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ds-text-tertiary">Policy references</div>
          <ul className="mt-1 space-y-1 text-[11px] leading-5 text-ds-text-secondary">
            {analysis.policyCitations.slice(0, 3).map((p) => (
              <li key={p.docKey}>
                <span className="text-ds-accent">{p.citation}</span> — {p.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {methodology ? (
        <p className="mt-4 border-t border-ds-border-subtle pt-3 text-[11px] leading-5 text-ds-text-tertiary">{methodology}</p>
      ) : null}
    </section>
  );
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
    district: '',
    nearMe: false,
  });
  const [expandedZoneId, setExpandedZoneId] = useState(null);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [saveSearchMsg, setSaveSearchMsg] = useState('');
  const [portfolioName, setPortfolioName] = useState('');
  const [portfolioMsg, setPortfolioMsg] = useState('');
  const [alertEmail, setAlertEmail] = useState('');
  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState('');
  const [alertMsg, setAlertMsg] = useState('');
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
  const setInvestorHighlights = useDashboardStore((s) => s.setInvestorHighlights);
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
    queryKey: ['investor-opportunities', investorFilters, selectedLocation.lat, selectedLocation.lng],
    queryFn: () =>
      getInvestorOpportunities({
        ...investorFilters,
        district: investorFilters.district,
        limit: 20,
        nearLat: investorFilters.nearMe ? selectedLocation.lat : null,
        nearLng: investorFilters.nearMe ? selectedLocation.lng : null,
      }),
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const districtsQuery = useQuery({
    queryKey: ['investor-districts'],
    queryFn: getInvestorDistricts,
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });

  const districtOptions = [
    { value: '', label: 'All districts' },
    ...(districtsQuery.data || []).map((d) => ({ value: d, label: d })),
  ];

  useEffect(() => {
    const highlights = opportunitiesQuery.data?.mapHighlights;
    if (!highlights?.length) {
      setInvestorHighlights(null);
      return;
    }
    setInvestorHighlights({
      type: 'FeatureCollection',
      features: highlights.map((h) => ({
        type: 'Feature',
        geometry:
          h.geometry?.type && h.geometry.type !== 'GeometryCollection'
            ? h.geometry
            : { type: 'Point', coordinates: [h.center.lng, h.center.lat] },
        properties: {
          rank: h.rank,
          score: h.opportunityScore,
          name: h.name,
          label: `#${h.rank} · ${h.opportunityScore}`,
          centerLng: h.center?.lng,
          centerLat: h.center?.lat,
        },
      })),
    });
  }, [opportunitiesQuery.data, setInvestorHighlights]);

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

  const savedSearchesQuery = useQuery({
    queryKey: ['portal-saved-searches'],
    queryFn: () => listSearches().catch(() => []),
    staleTime: 1000 * 60 * 5,
  });

  const pipelineQuery = useQuery({
    queryKey: ['portal-pipeline'],
    queryFn: () => getPipelineBoard().catch(() => ({ items: [], stages: [] })),
    staleTime: 1000 * 60 * 2,
    retry: 0,
  });

  const portfoliosQuery = useQuery({
    queryKey: ['portal-portfolios'],
    queryFn: () => listPortfolios().catch(() => []),
    staleTime: 1000 * 60 * 2,
  });

  const alertsQuery = useQuery({
    queryKey: ['portal-search-alerts'],
    queryFn: () => listSearchAlerts().catch(() => []),
    staleTime: 1000 * 60 * 2,
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

  async function handleSaveInvestorSearch() {
    const name = saveSearchName.trim() || `Investor ${investorFilters.sector} · ${new Date().toLocaleDateString('en-IN')}`;
    setSaveSearchMsg('');
    try {
      await saveSearch(name, investorFilters);
      setSaveSearchMsg('Saved search view');
      setSaveSearchName('');
      queryClient.invalidateQueries({ queryKey: ['portal-saved-searches'] });
    } catch (err) {
      setSaveSearchMsg(err.message || 'Could not save search');
    }
  }

  function handleLoadSavedSearch(filters) {
    if (!filters || typeof filters !== 'object') return;
    setInvestorFilters((current) => ({ ...current, ...filters }));
    setSaveSearchMsg('Loaded saved search');
  }

  async function handleAddToPipeline(zoneId) {
    try {
      await upsertPipelineItem({ zoneId, stage: 'discovered' });
      queryClient.invalidateQueries({ queryKey: ['portal-pipeline'] });
    } catch (err) {
      setSaveSearchMsg(err.message || 'Pipeline update failed');
    }
  }

  async function handleSavePortfolio() {
    const name = portfolioName.trim() || `Shortlist ${new Date().toLocaleDateString('en-IN')}`;
    const zoneIds = compareIds.length >= 2 ? compareIds : (opportunitiesQuery.data?.opportunities || []).slice(0, 5).map((z) => z.id);
    if (!zoneIds.length) return;
    setPortfolioMsg('');
    try {
      const portfolio = await upsertPortfolio({ name, zoneIds });
      setPortfolioMsg(`Portfolio saved${portfolio.shareToken ? ' — share token ready' : ''}`);
      setPortfolioName('');
      queryClient.invalidateQueries({ queryKey: ['portal-portfolios'] });
    } catch (err) {
      setPortfolioMsg(err.message || 'Could not save portfolio');
    }
  }

  async function handleSubscribeAlert() {
    if (!alertEmail.trim()) return;
    setAlertMsg('');
    try {
      const result = await subscribeSearchAlert({
        email: alertEmail.trim(),
        savedSearchId: selectedSavedSearchId || null,
        minScoreDelta: 5,
      });
      setAlertMsg(result.note || 'Alert subscription saved');
      setAlertEmail('');
      queryClient.invalidateQueries({ queryKey: ['portal-search-alerts'] });
    } catch (err) {
      setAlertMsg(err.message || 'Alert subscription failed');
    }
  }

  async function handlePortfolioPdf(portfolio) {
    try {
      const { blob, filename } = await downloadPortfolioReport({
        zoneIds: portfolio.zoneIds,
        sector: investorFilters.sector,
        portfolioName: portfolio.name,
      });
      triggerDownload(blob, filename);
    } catch (err) {
      setPortfolioMsg(err.message || 'Portfolio PDF failed');
    }
  }

  function handleBulkExportCsv() {
    const rows = opportunitiesQuery.data?.opportunities || [];
    if (!rows.length) return;
    const header = [
      'name', 'district', 'type', 'opportunityScore', 'verdict', 'availability', 'keyRisk',
      'landPerSqYard', 'landCostInr', 'locationQuality', 'infrastructure', 'accessibility',
      'environmentalSuitability', 'zoneFit', 'zoningCertainty', 'utilityScore',
      'areaAcres', 'distanceKm', 'benchmark', 'scoredAt',
    ];
    const lines = [header.join(',')];
    for (const row of rows) {
      const c = row.components || {};
      lines.push(
        [
          row.name, row.district, row.type, row.opportunityScore, row.verdict,
          row.availability?.label, row.keyRisk,
          c.landPerSqYard, c.estimatedLandCostInr, c.v3Composite, c.infrastructure, c.accessibility,
          c.environmentalSuitability, c.zoneFit, c.cluScore, c.utilityScore,
          row.areaAcres, row.distanceKm, row.benchmark?.message,
          opportunitiesQuery.data?.scoredAt,
        ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
      );
    }
    triggerDownload(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `locatium-investor-bulk-${Date.now()}.csv`);
  }

  function handleDeepAnalysis(zone) {
    flyTo({
      lng: zone.center.lng,
      lat: zone.center.lat,
      zoom: 14,
      name: zone.name,
      type: zone.type,
    });
    setActiveTab('analysis');
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

        <ScoreInsightsBlock analysis={analysis} loading={analysisQuery.isLoading} />

        <ScoreBreakdown breakdown={analysis?.scoreBreakdown} />

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
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">Investment score</div>
                <div className="mt-1 text-2xl font-black text-ds-text-primary">
                  {analysisQuery.isLoading ? '…' : analysis?.overallScore ?? '—'}
                </div>
              </div>
              {analysis ? (
                <MethodBadge method={analysis.method} modelVersion={analysis.model_version} fallback={analysis.fallback} />
              ) : null}
            </div>

            <section className="grid grid-cols-2 gap-3">
              <ScoreGauge label="Infrastructure" value={scores.infrastructure} kind="infrastructure" />
          <ScoreGauge label="Accessibility" value={scores.accessibility} kind="accessibility" />
          <ScoreGauge
            label="Env. suitability"
            value={scores.environmentalRisk}
            kind="environmentalRisk"
            tooltip="Higher = safer site (lower flood/forest/water/air constraint risk)"
          />
          <ScoreGauge label="Zone fit" value={scores.zoneCompatibility} kind="zoneCompatibility" />
        </section>

        <ScoreInsightsBlock analysis={analysis} loading={analysisQuery.isLoading} />

        <ScoreBreakdown breakdown={analysis?.scoreBreakdown} />

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
          <Metric icon={ShieldCheck} label="Constraint risk" value={details.environmentalRisk?.risk ?? 'N/A'} tone="success" />
          <Metric icon={AlertTriangle} label="Air proxy" value={details.environmentalRisk?.metrics?.airQualityRisk ?? 'N/A'} tone="warning" />
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
                  <div className="mt-1 text-xs text-ds-text-secondary">
                    Rank investment zones by sector, budget, and risk. Top results show as{' '}
                    <span className="font-semibold text-ds-accent">shaded zones</span> on the map.
                  </div>
                </div>
                <div className="rounded-lg border border-ds-warning/30 bg-ds-warning-subtle px-2 py-1 text-[11px] font-bold text-ds-warning">
                  {opportunitiesQuery.data?.count ?? 0}
                </div>
              </div>

              {(opportunitiesQuery.data?.mapHighlights || []).length > 0 ? (
                <div className="mt-3 rounded-lg border border-ds-accent/25 bg-ds-accent-subtle px-3 py-2 text-[11px] leading-5 text-ds-accent-text">
                  <strong>Map guide:</strong> colored outlines = top {opportunitiesQuery.data.mapHighlights.length} investment zones.
                  Label shows rank + score (e.g. #1 · 72). Click any row below to fly to that zone.
                </div>
              ) : null}

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
                  label="Budget (₹)"
                  value={investorFilters.budget}
                  onChange={(value) => updateFilter('budget', value)}
                  options={[
                    { value: '', label: 'Any' },
                    { value: 'low', label: 'Low (< ₹5 cr)' },
                    { value: 'medium', label: 'Medium (₹5–25 cr)' },
                    { value: 'high', label: 'High (> ₹25 cr)' },
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
                <SelectField
                  label="District"
                  value={investorFilters.district}
                  onChange={(value) => updateFilter('district', value)}
                  options={districtOptions}
                />
                <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ds-text-secondary">
                  Near map center
                  <button
                    type="button"
                    onClick={() => updateFilter('nearMe', !investorFilters.nearMe)}
                    className={`flex h-9 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold transition ${
                      investorFilters.nearMe
                        ? 'border-ds-accent bg-ds-accent-subtle text-ds-accent'
                        : 'border-ds-border-subtle bg-ds-surface-sunken text-ds-text-secondary'
                    }`}
                  >
                    <Navigation size={13} />
                    {investorFilters.nearMe ? 'Within 25 km' : 'Off'}
                  </button>
                </label>
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={saveSearchName}
                  onChange={(e) => setSaveSearchName(e.target.value)}
                  placeholder="Name this filter set…"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-2 text-xs text-ds-text-primary outline-none focus:border-ds-accent"
                />
                <button
                  type="button"
                  onClick={handleSaveInvestorSearch}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 text-xs font-semibold text-ds-text-primary hover:border-ds-accent"
                >
                  <Search size={13} /> Save
                </button>
              </div>
              {saveSearchMsg ? <div className="mt-2 text-xs text-ds-text-secondary">{saveSearchMsg}</div> : null}

              {(savedSearchesQuery.data || []).length ? (
                <div className="mt-2">
                  <SelectField
                    label="Load saved search"
                    value=""
                    onChange={(id) => {
                      const search = (savedSearchesQuery.data || []).find((s) => s.id === id);
                      if (search?.filters) handleLoadSavedSearch(search.filters);
                    }}
                    options={[
                      { value: '', label: 'Choose…' },
                      ...(savedSearchesQuery.data || []).map((s) => ({ value: s.id, label: s.name })),
                    ]}
                  />
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={handleBulkExportCsv} className="h-8 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 text-[11px] font-semibold text-ds-text-primary hover:border-ds-accent">
                  Bulk export CSV
                </button>
                <input
                  type="text"
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  placeholder="Portfolio name…"
                  className="h-8 min-w-[120px] flex-1 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-2 text-[11px] text-ds-text-primary"
                />
                <button type="button" onClick={handleSavePortfolio} className="h-8 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 text-[11px] font-semibold hover:border-ds-accent">
                  Save portfolio
                </button>
              </div>
              {portfolioMsg ? <div className="mt-1 text-xs text-ds-text-secondary">{portfolioMsg}</div> : null}

              <div className="mt-2 flex gap-2">
                <SelectField
                  label="Alert for saved search"
                  value={selectedSavedSearchId}
                  onChange={setSelectedSavedSearchId}
                  options={[
                    { value: '', label: 'Current filters only' },
                    ...(savedSearchesQuery.data || []).map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="email"
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  placeholder="Alert email (score Δ > 5)…"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-2 text-[11px]"
                />
                <button type="button" onClick={handleSubscribeAlert} className="h-8 shrink-0 rounded-lg border border-ds-border-subtle px-3 text-[11px] font-semibold hover:border-ds-accent">
                  Alert me
                </button>
              </div>
              {alertMsg ? <div className="mt-1 text-xs text-ds-text-secondary">{alertMsg}</div> : null}

              <div className="mt-3">
                <InvestorPipelineBoard
                  stages={pipelineQuery.data?.stages || ['discovered', 'shortlisted', 'due_diligence', 'negotiation', 'closed', 'passed']}
                  items={pipelineQuery.data?.items || []}
                  opportunities={opportunitiesQuery.data?.opportunities || []}
                  onRefresh={() => queryClient.invalidateQueries({ queryKey: ['portal-pipeline'] })}
                  onFlyToZone={(zone) =>
                    flyTo({
                      lng: zone.center.lng,
                      lat: zone.center.lat,
                      zoom: 13,
                      name: zone.name,
                      type: zone.type,
                      feature: {
                        tableId: zone.tableId,
                        investorZoneId: zone.id,
                        featureId: zone.featureId,
                        name: zone.name,
                        geometry: zone.geometry,
                        center: zone.center,
                      },
                    })
                  }
                />
              </div>

              {(portfoliosQuery.data || []).length ? (
                <div className="mt-3 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-ds-text-tertiary">Saved portfolios</div>
                  <div className="mt-2 space-y-2">
                    {(portfoliosQuery.data || []).map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md bg-ds-surface-raised p-2 text-[11px]">
                        <span className="font-semibold text-ds-text-primary">{p.name}</span>
                        <span className="text-ds-text-secondary">{p.zoneIds?.length || 0} zones</span>
                        {p.shareToken ? (
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/portfolio/${p.shareToken}`)}
                            className="rounded border border-ds-border-subtle px-2 py-0.5 hover:border-ds-accent"
                          >
                            Copy share link
                          </button>
                        ) : null}
                        <button type="button" onClick={() => handlePortfolioPdf(p)} className="rounded border border-ds-border-subtle px-2 py-0.5 hover:border-ds-accent">
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await deletePortfolio(p.id);
                            queryClient.invalidateQueries({ queryKey: ['portal-portfolios'] });
                          }}
                          className="text-ds-danger"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {(alertsQuery.data || []).length ? (
                <div className="mt-3 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-ds-text-tertiary">Active alerts</div>
                  <div className="mt-2 space-y-1 text-[11px] text-ds-text-secondary">
                    {(alertsQuery.data || []).map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2">
                        <span>{a.email} · {a.searchName || 'custom filters'}</span>
                        <button type="button" onClick={async () => { await deleteSearchAlert(a.id); queryClient.invalidateQueries({ queryKey: ['portal-search-alerts'] }); }} className="text-ds-danger">Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {opportunitiesQuery.isError ? (
                <div className="mt-3 rounded-lg border border-ds-danger/40 bg-ds-danger-subtle p-3 text-xs text-ds-danger">
                  {opportunitiesQuery.error.message}
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                {opportunitiesQuery.isLoading ? (
                  <div className="rounded-lg bg-ds-surface-sunken px-3 py-3 text-sm text-ds-text-secondary">Ranking local investment zones…</div>
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
                            {index < 5 ? (
                              <span className="shrink-0 rounded bg-ds-accent-subtle px-1.5 py-0.5 text-[10px] font-bold text-ds-accent">
                                Map zone #{index + 1}
                              </span>
                            ) : null}
                            {zone.verdict ? (
                              <span className="shrink-0 rounded bg-ds-surface-raised px-1.5 py-0.5 text-[10px] font-bold uppercase text-ds-text-secondary">
                                {zone.verdict}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 truncate text-xs text-ds-text-secondary">
                            {zone.district} · {zone.type} · {acres(zone.areaAcres)}
                            {zone.distanceKm != null ? ` · ${zone.distanceKm} km` : ''}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                            <span className="rounded bg-ds-surface-raised px-1.5 py-0.5 text-ds-text-tertiary">
                              {zone.availability?.label || 'Availability unknown'}
                            </span>
                            {zone.landCostBand?.lowPerSqYard ? (
                              <span className="rounded bg-ds-surface-raised px-1.5 py-0.5 text-ds-text-secondary">
                                ₹{zone.landCostBand.lowPerSqYard.toLocaleString('en-IN')}
                                {zone.landCostBand.highPerSqYard ? `–${zone.landCostBand.highPerSqYard.toLocaleString('en-IN')}` : ''}/sq yd
                              </span>
                            ) : null}
                          </div>
                          {zone.keyRisk ? (
                            <div className="mt-1 text-[10px] text-ds-warning">Key risk: {zone.keyRisk}</div>
                          ) : null}
                          {zone.benchmark?.message ? (
                            <div className="mt-1 text-[10px] text-ds-text-tertiary">{zone.benchmark.message}</div>
                          ) : null}
                        </div>
                        <div className="shrink-0 rounded-lg bg-ds-warning-subtle px-2 py-1 text-sm font-black text-ds-warning">
                          {zone.opportunityScore}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {zone.mlScore != null ? (
                          <MethodBadge
                            method={zone.mlAdjusted ? 'ml' : 'heuristic'}
                            modelVersion={zone.mlModelVersion}
                            fallback={zone.mlMethod === 'unavailable'}
                          />
                        ) : null}
                        {zone.formulaRank != null && zone.mlRank != null && zone.formulaRank !== zone.mlRank ? (
                          <span className="rounded bg-ds-surface-raised px-1.5 py-0.5 text-[10px] text-ds-accent">
                            List #{zone.formulaRank} · AI #{zone.mlRank}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-ds-text-secondary">
                        <span>Infra {zone.components?.infrastructure ?? '—'}</span>
                        <span>Access {zone.components?.accessibility ?? '—'}</span>
                        <span>Fit {zone.components?.zoneTypeMatch ?? '—'}</span>
                      </div>
                      {zone.components?.estimatedLandCostInr ? (
                        <div className="mt-1 text-[11px] text-ds-text-secondary">
                          Est. land {formatInr(zone.components.estimatedLandCostInr)}
                        </div>
                      ) : null}
                    </button>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedZoneId((current) => (current === zone.id ? null : zone.id))}
                        className="flex items-center gap-1 text-[11px] font-semibold text-ds-accent"
                      >
                        {expandedZoneId === zone.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        Why this rank
                      </button>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddToPipeline(zone.id)}
                          className="rounded-md border border-ds-border-subtle bg-ds-surface-raised px-2 py-1 text-[11px] font-bold text-ds-text-secondary hover:border-ds-accent"
                        >
                          + Pipeline
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeepAnalysis(zone)}
                          className="rounded-md border border-ds-border-subtle bg-ds-surface-raised px-2 py-1 text-[11px] font-bold text-ds-text-secondary hover:border-ds-accent"
                        >
                          Deep analysis
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCompare(zone.id)}
                          className={`rounded-md border px-2 py-1 text-[11px] font-bold ${
                            compareIds.includes(zone.id)
                              ? 'border-ds-success bg-ds-success-subtle text-ds-success'
                              : 'border-ds-border-subtle bg-ds-surface-raised text-ds-text-secondary'
                          }`}
                        >
                          Compare
                        </button>
                      </div>
                    </div>
                        {expandedZoneId === zone.id && (zone.explain?.length || zone.components) ? (
                      <div className="mt-2 space-y-2">
                        <ul className="space-y-1 rounded-lg bg-ds-surface-raised px-3 py-2 text-[11px] leading-5 text-ds-text-secondary">
                          {(zone.explain || [])
                            .map((line) =>
                              String(line)
                                .replace(/\bPostGIS\b/gi, '')
                                .replace(/\bv3\b/gi, '')
                                .replace(/\s{2,}/g, ' ')
                                .trim()
                            )
                            .filter(Boolean)
                            .map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                        {zone.opportunityBreakdown?.length ? (
                          <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-2">
                            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ds-text-tertiary">Score drivers</div>
                            {zone.opportunityBreakdown.map((row) => (
                              <div key={row.key} className="mb-1 flex items-center gap-2 text-[10px]">
                                <span className="w-28 truncate text-ds-text-secondary">{row.label}</span>
                                <div className="h-1.5 flex-1 rounded bg-ds-surface-sunken">
                                  <div className="h-full rounded bg-ds-warning" style={{ width: `${Math.min(100, row.score)}%` }} />
                                </div>
                                <span className="w-8 text-right text-ds-text-primary">{row.score}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {zone.scoreBreakdown?.length ? (
                          <ScoreBreakdown breakdown={zone.scoreBreakdown} />
                        ) : null}
                        {zone.financialPreview?.totalCapexInr ? (
                          <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-2 text-[11px]">
                            <div className="font-semibold uppercase tracking-wide text-ds-text-tertiary">Financial preview</div>
                            <div className="mt-1 text-ds-text-secondary">
                              Land {formatInr(zone.financialPreview.landCostInr)} · Build {formatInr(zone.financialPreview.buildCostInr)} · Total {formatInr(zone.financialPreview.totalCapexInr)}
                            </div>
                            <div className="mt-1 text-ds-text-secondary">
                              ROI: {zone.financialPreview.scenarios?.map((s) => `${s.label} ${s.roiPct ?? '—'}%`).join(' · ')}
                            </div>
                          </div>
                        ) : null}
                        {zone.plotInventory?.plots?.length ? (
                          <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-2 text-[11px]">
                            <div className="font-semibold uppercase tracking-wide text-ds-text-tertiary">Plot inventory ({zone.plotInventory.count})</div>
                            <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto text-ds-text-secondary">
                              {zone.plotInventory.plots.slice(0, 8).map((p) => (
                                <li key={p.id}>{p.name} · {p.statusLabel || p.status}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {zone.regulatoryChecklist?.length ? (
                          <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-2 text-[11px]">
                            <div className="font-semibold uppercase tracking-wide text-ds-text-tertiary">Regulatory checklist</div>
                            <ul className="mt-1 space-y-1 text-ds-text-secondary">
                              {zone.regulatoryChecklist.map((item) => (
                                <li key={item.id}>{item.label}: {item.status}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
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
                  {comparisonQuery.isLoading ? <div className="mt-2 text-xs text-ds-text-secondary">Building comparison…</div> : null}
                  {comparisonQuery.isError ? <div className="mt-2 text-xs text-ds-danger">{comparisonQuery.error.message}</div> : null}
                  {comparisonQuery.data?.matrix?.length ? (
                    <div className="mt-2 space-y-3">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-[10px]">
                          <thead>
                            <tr className="text-ds-text-tertiary">
                              <th className="pb-2 pr-2 font-semibold">Zone</th>
                              <th className="pb-2 px-1 font-semibold">Opp</th>
                              <th className="pb-2 px-1 font-semibold">Land ₹/sq yd</th>
                              <th className="pb-2 px-1 font-semibold">Env</th>
                              <th className="pb-2 px-1 font-semibold">CLU</th>
                              <th className="pb-2 px-1 font-semibold">Area</th>
                              <th className="pb-2 px-1 font-semibold">Dist.</th>
                              <th className="pb-2 px-1 font-semibold">Utility</th>
                              <th className="pb-2 px-1 font-semibold">Risk</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comparisonQuery.data.matrix.map((row) => (
                              <tr key={row.id} className="border-t border-ds-border-subtle text-ds-text-secondary">
                                <td className="max-w-[120px] truncate py-2 pr-2 font-semibold text-ds-text-primary">{row.name}</td>
                                <td className="px-1 py-2 font-bold text-ds-warning">{row.opportunityScore}</td>
                                <td className="px-1 py-2">{row.landPerSqYard ? formatInr(row.landPerSqYard) : '—'}</td>
                                <td className="px-1 py-2">{row.environmentalSuitability ?? '—'}</td>
                                <td className="px-1 py-2">{row.cluScore ?? '—'} <span className="text-ds-text-tertiary">({row.cluLabel || '—'})</span></td>
                                <td className="px-1 py-2">{row.areaAcres ? acres(row.areaAcres) : '—'}</td>
                                <td className="px-1 py-2">{row.distanceKm != null ? `${row.distanceKm} km` : '—'}</td>
                                <td className="px-1 py-2">{row.utilityReadiness || row.utilityScore || '—'}</td>
                                <td className="max-w-[100px] truncate px-1 py-2">{row.keyRisk || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-3">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ds-text-tertiary">Side-by-side comparison</div>
                        <EChartPanel
                          option={zoneComparisonRadarOption(
                            comparisonQuery.data.matrix.map((row) => ({
                              name: row.name,
                              analysis: { scores: row.analysis?.scores || {
                                infrastructure: row.infrastructure,
                                accessibility: row.accessibility,
                                environmentalRisk: row.environmentalSuitability,
                                zoneCompatibility: row.zoneFit,
                              }},
                            }))
                          )}
                        />
                      </div>
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
