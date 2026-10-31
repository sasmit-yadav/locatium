import { lazy, Suspense, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Brain, Building2, CheckCircle2, Mail, MapPinned, Route, ShieldCheck, Trophy, Zap, PanelRightClose } from 'lucide-react';
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
import { InvestorPublicSection } from '../components/InvestorPublicSection';
import { scoreLocation, getLandForecast } from '../services/analysis';
import { compareInvestorZones, downloadInvestorReport, downloadPortfolioReport, emailInvestorReport, getInvestorDistricts, getInvestorOpportunities, getInvestorZoneAnalysis } from '../services/investor';
import { useDashboardStore } from '../stores/useDashboardStore';
import { addFavorite, deleteFavorite, listFavorites, recordAnalysis, saveSearch, listSearches, getPipelineBoard, upsertPipelineItem, upsertPortfolio, listPortfolios, deletePortfolio, subscribeSearchAlert, listSearchAlerts, deleteSearchAlert } from '../services/portal';
import { layout } from '../design-system/tokens';

const LazyEChartPanel = lazy(() =>
  import('../analytics/EChartPanel').then((module) => ({ default: module.EChartPanel }))
);

function EChartPanel(props) {
  return (
    <Suspense fallback={<div className="h-56 animate-pulse rounded-lg bg-ds-surface-sunken" />}>
      <LazyEChartPanel {...props} />
    </Suspense>
  );
}

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

      {analysis.landValue?.estimatedPerSqYardInr || analysis.landValue?.circleRatePerSqYardInr ? (
        <div className="mt-3 space-y-1.5 rounded-lg bg-ds-surface-sunken px-3 py-2 text-xs leading-5 text-ds-text-secondary">
          <div>
            <span className="font-semibold text-ds-text-primary">Land ₹: </span>
            {analysis.landValue.estimatedPerSqYardInr
              ? `₹${analysis.landValue.estimatedPerSqYardInr.toLocaleString('en-IN')}/sq yd est.`
              : '—'}
            {analysis.landValue.estimatedLowPerSqYardInr != null &&
            analysis.landValue.estimatedHighPerSqYardInr != null &&
            analysis.landValue.estimatedLowPerSqYardInr !== analysis.landValue.estimatedHighPerSqYardInr
              ? ` (band ₹${analysis.landValue.estimatedLowPerSqYardInr.toLocaleString('en-IN')}–${analysis.landValue.estimatedHighPerSqYardInr.toLocaleString('en-IN')})`
              : ''}
            {analysis.landValue.confidence ? (
              <span className="ml-1 text-[10px] uppercase tracking-wide text-ds-text-tertiary">
                · {analysis.landValue.confidence} confidence
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            <span>
              Gov floor:{' '}
              {analysis.landValue.circleRatePerSqYardInr
                ? `₹${analysis.landValue.circleRatePerSqYardInr.toLocaleString('en-IN')}/sq yd`
                : '—'}
              {analysis.landValue.circleRateSampleCount
                ? ` (n=${analysis.landValue.circleRateSampleCount})`
                : ''}
              {analysis.landValue.circleRateTehsil
                ? ` · ${analysis.landValue.circleRateTehsil}`
                : ''}
              {analysis.landValue.circleRateEffectiveFrom
                ? ` · vintage ${analysis.landValue.circleRateEffectiveFrom}`
                : ''}
            </span>
            <span>
              Market:{' '}
              {analysis.landValue.marketAvailable &&
              (analysis.landValue.comparableWeightedPerSqYardInr ||
                analysis.landValue.comparableMedianPerSqYardInr)
                ? `₹${(analysis.landValue.comparableWeightedPerSqYardInr ?? analysis.landValue.comparableMedianPerSqYardInr).toLocaleString('en-IN')}/sq yd (n=${analysis.landValue.comparableSampleCount ?? analysis.landValue.comparableCount ?? 0})`
                : 'No market comps yet'}
            </span>
          </div>
          <div className="text-[10px] text-ds-text-tertiary">
            {(analysis.landValue.method || '').replace(/_/g, ' ')}
            {(analysis.landValue.marketPremiumVsFloor ?? analysis.landValue.roiProxy) != null &&
            analysis.landValue.marketAvailable
              ? ` · market premium vs floor: ${((analysis.landValue.marketPremiumVsFloor ?? analysis.landValue.roiProxy) * 100).toFixed(1)}%`
              : ''}
            {analysis.landValue.note ? ` · ${analysis.landValue.note}` : ''}
          </div>
        </div>
      ) : analysis.landValue?.method === 'insufficient_data' ? (
        <div className="mt-3 rounded-lg bg-ds-surface-sunken px-3 py-2 text-xs text-ds-text-tertiary">
          No official collector rate for this district yet. Market comps unavailable.
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

const OUTLOOK_CONFIDENCE_TONE = {
  medium: 'text-ds-text-secondary',
  low: 'text-ds-warning',
  very_low: 'text-ds-warning',
};

/**
 * Forward land-price outlook.
 *
 * This extrapolates published collector-rate revisions, so it renders the method, the
 * confidence and the horizon cap alongside the numbers — a projected rupee figure shown
 * bare would read as a forecast, which it is not. When the rate history is too thin the
 * service says so, and we show that reason rather than hiding the section.
 */
function LandOutlook({ outlook }) {
  if (!outlook) return null;

  if (outlook.method !== 'official_rate_trend' || !outlook.horizons?.length) {
    return (
      <p className="mt-2 border-t border-ds-border-subtle pt-2 text-[11px] leading-5 text-ds-text-tertiary">
        No forward outlook: {outlook.note || 'not enough official rate history for this district.'}
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-ds-border-subtle pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">
          Official-rate outlook
        </span>
        <span className={`text-[10px] ${OUTLOOK_CONFIDENCE_TONE[outlook.confidence] || 'text-ds-text-tertiary'}`}>
          {outlook.cagrPct}%/yr · {String(outlook.confidence).replace('_', ' ')} confidence
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {outlook.horizons.map((h) => (
          <li key={h.years} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-ds-text-secondary">{h.year}</span>
            <span className="font-semibold text-ds-text-primary">
              ₹{Number(h.p50).toLocaleString('en-IN')}
              <span className="ml-1 font-normal text-ds-text-tertiary">
                (₹{Number(h.p10).toLocaleString('en-IN')}–₹{Number(h.p90).toLocaleString('en-IN')})
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-5 text-ds-text-tertiary">{outlook.note}</p>
    </div>
  );
}

function acres(value) {
  if (!value) return 'N/A';
  return `${Number(value).toFixed(Number(value) >= 10 ? 1 : 2)} ac`;
}

export function IntelligencePanel({ collapsed }) {
  const [investorFilters, setInvestorFilters] = useState({
    sector: 'industrial',
    risk: 'medium',
    budget: '',
    zoneType: '',
    district: '',
    nearMe: false,
    nearRadiusKm: 25,
    landData: '',
    sourceLayer: '',
    utilityMin: '',
    availability: '',
    minScore: '',
    maxRatePerSqYard: '',
    maxLandCr: '',
  });
  const [investorReady, setInvestorReady] = useState(false);
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
  const selectionIsExplicit = useDashboardStore((s) => s.selectionIsExplicit);
  const mapView = useDashboardStore((s) => s.view);
  
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

  useEffect(() => {
    const applyFilters = (event) => {
      const next = event.detail || {};
      setInvestorFilters((current) => ({
        ...current,
        ...(next.sector ? { sector: next.sector } : {}),
        ...(next.district ? { district: next.district } : {}),
        ...(next.risk ? { risk: next.risk } : {}),
        ...(next.zoneType ? { zoneType: next.zoneType } : {}),
        ...(next.budgetInr
          ? { budget: '', maxLandCr: String(Math.ceil(Number(next.budgetInr) / 10_000_000)) }
          : {}),
      }));
      setInvestorReady(true);
    };
    const compareZones = (event) => {
      const zoneIds = Array.isArray(event.detail) ? event.detail.filter(Boolean).slice(0, 4) : [];
      if (zoneIds.length >= 2) {
        setCompareIds(zoneIds);
        setInvestorReady(true);
      }
    };
    window.addEventListener('locatium:apply-investor-filters', applyFilters);
    window.addEventListener('locatium:compare-zones', compareZones);
    return () => {
      window.removeEventListener('locatium:apply-investor-filters', applyFilters);
      window.removeEventListener('locatium:compare-zones', compareZones);
    };
  }, []);

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
    enabled: selectionIsExplicit,
  });

  const forecastQuery = useQuery({
    queryKey: ['land-forecast', selectedLocation.lat, selectedLocation.lng],
    queryFn: () =>
      getLandForecast({
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        sector: 'industrial',
        horizon: [1, 3, 5],
      }),
    staleTime: 1000 * 60 * 5,
    retry: 1,
    enabled: selectionIsExplicit,
  });

  const opportunitiesQuery = useQuery({
    queryKey: ['investor-opportunities', investorFilters, mapView.lat, mapView.lng],
    queryFn: () =>
      getInvestorOpportunities({
        ...investorFilters,
        district: investorFilters.district,
        limit: 20,
        nearLat: investorFilters.nearMe ? mapView.lat : null,
        nearLng: investorFilters.nearMe ? mapView.lng : null,
      }),
    enabled: investorReady && activeTab === 'investor',
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
          ? "Email isn't set up on this server, so nothing was sent. The report is saved: download it from Reports."
          : `Email sent successfully to ${result.to}.`;
      setEmailState((prev) => ({
        ...prev,
        loading: false,
        success: modeNote,
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
    // Below md the inspector is a bottom sheet over the map, matching the left panel.
    // As a fixed-width flex column it claimed 420px of a 375px viewport, which together
    // with the rail left the map no width at all.
    <div className="z-ds-floating-panel flex max-h-[85vh] w-full shrink-0 flex-col border-ds-border bg-ds-surface-raised shadow-ds-sm max-xl:fixed max-xl:inset-x-0 max-xl:bottom-0 max-xl:rounded-t-ds-lg max-xl:border max-xl:border-b-0 xl:h-auto xl:max-h-none xl:w-[420px] xl:border-l">
      <div className="flex shrink-0 flex-col border-b border-ds-border-subtle">
        <div className="flex items-center justify-between p-ds-3">
          <div className="flex items-center gap-ds-2 text-ds-caption uppercase tracking-wide text-ds-text-tertiary">
            <Brain size={layout.iconInline} className="text-ds-accent" /> Inspector
          </div>
          <div className="flex gap-ds-1">
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
              <h2 className="mt-1 text-xl font-bold text-ds-text-primary">
                {selectionIsExplicit ? selectedLocation.name : 'Select a location'}
              </h2>
              {selectionIsExplicit ? (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ds-text-secondary">
                  <span>District: {selectedLocation.district}</span>
                  <span>Tehsil: {selectedLocation.tehsil}</span>
                  <span>Land: {selectedLocation.landType}</span>
                  <span>{selectedLocation.area}</span>
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-ds-text-secondary">
                  Search for a place or click the map to run a live, evidence-backed score.
                </p>
              )}
            </div>
            <div className="grid h-20 w-24 place-items-center rounded-lg border border-ds-border bg-ds-surface-sunken text-center">
              <div>
                <div className="text-xl font-black text-ds-accent">{selectionIsExplicit ? analysis?.overallScore ?? '…' : '—'}</div>
                <div className="text-[9px] uppercase tracking-wide text-ds-text-tertiary">score</div>
              </div>
            </div>
          </div>
          {selectionIsExplicit ? (
            <div className="mt-3 rounded-lg bg-ds-surface-sunken px-3 py-2 font-mono text-xs text-ds-text-secondary">
              {selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)}
            </div>
          ) : null}
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
                <MethodBadge
                  method={analysis.method}
                  fallback={analysis.fallback}
                  experimentalScore={analysis.mlExperimental?.appliedToScore ? null : analysis.mlExperimental?.overallScore ?? null}
                />
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

        {forecastQuery.data ? (
          <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">Land-price band</div>
            <div className="mt-2 text-lg font-black text-ds-text-primary">
              {forecastQuery.data.p50 != null
                ? `₹${Number(forecastQuery.data.p50).toLocaleString('en-IN')}/sq yd`
                : 'Insufficient data'}
            </div>
            {forecastQuery.data.p10 != null && forecastQuery.data.p90 != null ? (
              <div className="mt-1 text-xs text-ds-text-secondary">
                Band ₹{Number(forecastQuery.data.p10).toLocaleString('en-IN')} – ₹{Number(forecastQuery.data.p90).toLocaleString('en-IN')}
                {forecastQuery.data.confidence ? ` · ${forecastQuery.data.confidence} confidence` : ''}
              </div>
            ) : null}
            <p className="mt-2 text-[11px] leading-5 text-ds-text-tertiary">{forecastQuery.data.note}</p>
            <LandOutlook outlook={forecastQuery.data.outlook} />
          </section>
        ) : null}

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
            <InvestorPublicSection
              filters={investorFilters}
              updateFilter={updateFilter}
              setFilters={setInvestorFilters}
              districtOptions={districtOptions}
              opportunities={opportunitiesQuery.data?.opportunities || []}
              count={opportunitiesQuery.data?.count ?? 0}
              loading={opportunitiesQuery.isLoading}
              error={opportunitiesQuery.isError ? opportunitiesQuery.error.message : ''}
              mapHighlightCount={(opportunitiesQuery.data?.mapHighlights || []).length}
              selectedLocation={
                selectionIsExplicit
                  ? selectedLocation
                  : { ...selectedLocation, name: 'Current map center', lat: mapView.lat, lng: mapView.lng }
              }
              expandedZoneId={expandedZoneId}
              setExpandedZoneId={setExpandedZoneId}
              compareIds={compareIds}
              onFlyToZone={(zone) =>
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
              onDeepAnalysis={handleDeepAnalysis}
              onToggleCompare={toggleCompare}
              onAddToPipeline={handleAddToPipeline}
              onSaveSearch={handleSaveInvestorSearch}
              saveSearchName={saveSearchName}
              setSaveSearchName={setSaveSearchName}
              saveSearchMsg={saveSearchMsg}
              savedSearches={savedSearchesQuery.data || []}
              onLoadSavedSearch={(filters) => {
                handleLoadSavedSearch(filters);
                setInvestorReady(true);
              }}
              onBulkExport={handleBulkExportCsv}
              portfolioName={portfolioName}
              setPortfolioName={setPortfolioName}
              onSavePortfolio={handleSavePortfolio}
              portfolioMsg={portfolioMsg}
              portfolios={portfoliosQuery.data || []}
              onPortfolioPdf={handlePortfolioPdf}
              onDeletePortfolio={async (id) => {
                await deletePortfolio(id);
                queryClient.invalidateQueries({ queryKey: ['portal-portfolios'] });
              }}
              alertEmail={alertEmail}
              setAlertEmail={setAlertEmail}
              onSubscribeAlert={handleSubscribeAlert}
              alertMsg={alertMsg}
              selectedSavedSearchId={selectedSavedSearchId}
              setSelectedSavedSearchId={setSelectedSavedSearchId}
              alerts={alertsQuery.data || []}
              onDeleteAlert={async (id) => {
                await deleteSearchAlert(id);
                queryClient.invalidateQueries({ queryKey: ['portal-search-alerts'] });
              }}
              pipelineStages={pipelineQuery.data?.stages}
              pipelineItems={pipelineQuery.data?.items || []}
              onRefreshPipeline={() => queryClient.invalidateQueries({ queryKey: ['portal-pipeline'] })}
              onSearchReady={() => setInvestorReady(true)}
            />

              {compareIds.length ? (
                <div className="mt-3 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ds-text-secondary">
                      Compare · {compareIds.length}/4
                    </div>
                    <button type="button" onClick={() => setCompareIds([])} className="text-[11px] font-semibold text-ds-text-secondary hover:text-ds-text-primary">
                      Clear
                    </button>
                  </div>
                  {compareIds.length < 2 ? <div className="mt-2 text-xs text-ds-text-secondary">Select one more zone to compare.</div> : null}
                  {comparisonQuery.isLoading ? <div className="mt-2 text-xs text-ds-text-secondary">Building comparison…</div> : null}
                  {comparisonQuery.isError ? <div className="mt-2 text-xs text-ds-danger">{comparisonQuery.error.message}</div> : null}
                  {comparisonQuery.data?.matrix?.length ? (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-[10px]">
                        <thead>
                          <tr className="text-ds-text-tertiary">
                            <th className="pb-2 pr-2 font-semibold">Zone</th>
                            <th className="pb-2 px-1 font-semibold">Match</th>
                            <th className="pb-2 px-1 font-semibold">Official ₹/sq yd</th>
                            <th className="pb-2 px-1 font-semibold">Env</th>
                            <th className="pb-2 px-1 font-semibold">Utility</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonQuery.data.matrix.map((row) => (
                            <tr key={row.id} className="border-t border-ds-border-subtle text-ds-text-secondary">
                              <td className="py-2 pr-2 font-semibold text-ds-text-primary">{row.name}</td>
                              <td className="px-1 py-2">{row.opportunityScore ?? '—'}</td>
                              <td className="px-1 py-2">{row.landPerSqYard ? Number(row.landPerSqYard).toLocaleString('en-IN') : '—'}</td>
                              <td className="px-1 py-2">{row.environmentalSuitability ?? '—'}</td>
                              <td className="px-1 py-2">{row.utilityReadiness || row.utilityScore || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}
          </>
        )}
      </div>
    </div>
  );
}
