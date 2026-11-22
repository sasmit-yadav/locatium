/* Zone cards intentionally close over the current investor workflow callbacks. */
/* eslint-disable react-hooks/static-components */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Info,
  MapPinned,
  Navigation,
  Search,
  Trophy,
} from 'lucide-react';
import { InvestorPipelineBoard } from './InvestorPipelineBoard';
import { MethodBadge } from './MethodBadge';
import { ScoreWord } from './ui/ScoreWord';
import { Disclaimer } from './ui/Disclaimer';
import { useT } from '../i18n';

function formatInr(value) {
  if (value == null || Number.isNaN(Number(value))) return 'N/A';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function acres(value) {
  if (!value) return 'N/A';
  return `${Number(value).toFixed(Number(value) >= 10 ? 1 : 2)} ac`;
}

function SelectField({ label, value, onChange, options, hint }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ds-text-secondary">
        {label}
        {hint ? (
          <span title={hint} className="cursor-help text-ds-text-tertiary">
            <HelpCircle size={11} />
          </span>
        ) : null}
      </span>
      <div className="relative min-w-0">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full min-w-0 appearance-none truncate rounded-lg border border-ds-border-subtle bg-ds-surface-sunken py-0 pl-2.5 pr-8 text-xs font-semibold text-ds-text-primary outline-none transition focus:border-ds-accent"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-ds-surface-raised text-ds-text-primary">
              {option.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-ds-text-tertiary"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </label>
  );
}

function plainVerdict(verdict, score, t) {
  if (verdict === 'shortlist' || score >= 75) return { label: t('inv.verdict.visit'), tone: 'success' };
  if (verdict === 'review' || score >= 55) return { label: t('inv.verdict.compare'), tone: 'warning' };
  return { label: t('inv.verdict.weak'), tone: 'muted' };
}

function confidenceTip(confidence, marketAvailable, compsN, t) {
  if (confidence === 'high') return t('inv.tip.high');
  if (confidence === 'medium') return t('inv.tip.medium');
  if (marketAvailable && (compsN || 0) <= 2) return t('inv.tip.lowComps');
  if (!marketAvailable) return t('inv.tip.noMarket');
  return t('inv.tip.other');
}

function whyMatchLine(zone, t) {
  const bits = [];
  if (zone.components?.accessibility >= 70) bits.push(t('inv.why.access'));
  if (zone.components?.infrastructure >= 70) bits.push(t('inv.why.facilities'));
  if (zone.landValue?.circleRatePerSqYardInr) bits.push(t('inv.why.rate'));
  if (zone.availability?.status === 'available') bits.push(t('inv.why.available'));
  if (zone.utilityReadiness === 'High' || zone.utilityReadiness === 'Medium') {
    bits.push(t('inv.why.utility', { level: String(zone.utilityReadiness).toLowerCase() }));
  }
  if (!bits.length) return t('inv.why.default');
  return t('inv.why.standsOut', { list: bits.slice(0, 3).join(', ') });
}

/** Risk notes come from the ranking engine as short English fragments; say them plainly. */
function plainRisk(risk, t) {
  if (!risk) return null;
  return String(risk)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      let m = part.match(/^forest ([\d.]+) km$/i);
      if (m) return t('inv.risk.forest', { km: m[1] });
      m = part.match(/^flood\/low-lying ([\d.]+) km$/i);
      if (m) return t('inv.risk.flood', { km: m[1] });
      if (/no utility mesh/i.test(part)) return t('inv.risk.utility');
      if (/low environmental suitability/i.test(part)) return t('inv.risk.env');
      if (/no major nearby risk/i.test(part)) return t('inv.risk.none');
      return part;
    })
    .join('; ');
}

function availabilityLabel(availability, t) {
  if (!availability) return null;
  // "mixed" zones carry the boundary-level placeholder label too.
  if (availability.status === 'unknown' || /boundary-level data/i.test(availability.label || '')) return t('inv.avail.unknown');
  if (availability.status === 'available') return t('inv.avail.available');
  if (availability.status === 'allotted') return t('inv.avail.allotted');
  return availability.label;
}

const USE_VALUES = ['industrial', 'commercial', 'residential', 'agricultural'];
const BUDGET_VALUES = [
  { value: '', key: 'any' },
  { value: 'micro', key: 'micro' },
  { value: 'low', key: 'low' },
  { value: 'medium', key: 'medium' },
  { value: 'high', key: 'high' },
];

export function InvestorPublicSection({
  filters,
  updateFilter,
  setFilters,
  districtOptions,
  opportunities = [],
  count = 0,
  loading,
  error,
  mapHighlightCount = 0,
  selectedLocation,
  expandedZoneId,
  setExpandedZoneId,
  compareIds,
  onFlyToZone,
  onDeepAnalysis,
  onToggleCompare,
  onAddToPipeline,
  onSaveSearch,
  saveSearchName,
  setSaveSearchName,
  saveSearchMsg,
  savedSearches = [],
  onLoadSavedSearch,
  onBulkExport,
  portfolioName,
  setPortfolioName,
  onSavePortfolio,
  portfolioMsg,
  portfolios = [],
  onPortfolioPdf,
  onDeletePortfolio,
  onSubscribeAlert,
  alertMsg,
  selectedSavedSearchId,
  setSelectedSavedSearchId,
  alerts = [],
  onDeleteAlert,
  pipelineStages,
  pipelineItems,
  onRefreshPipeline,
  onSearchReady,
}) {
  const t = useT();
  const USE_OPTIONS = USE_VALUES.map((value) => ({ value, title: t(`inv.use.${value}`), blurb: t(`inv.use.${value}.blurb`) }));
  const BUDGET_OPTIONS = BUDGET_VALUES.map(({ value, key }) => ({
    value,
    title: t(`inv.budget.${key}`),
    blurb: t(`inv.budget.${key}.blurb`),
  }));
  const [step, setStep] = useState(1);
  const [started, setStarted] = useState(Boolean(opportunities.length));
  const [showPro, setShowPro] = useState(false);
  const [showPricingHelp, setShowPricingHelp] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const top = opportunities[0] || null;
  const rest = opportunities.slice(1, 5);
  const more = opportunities.slice(5);

  const placeSummary = useMemo(() => {
    if (filters.nearMe) return t('inv.placeNear', { km: filters.nearRadiusKm || 25 });
    if (filters.district) return filters.district;
    return t('inv.placeAll');
  }, [filters.district, filters.nearMe, filters.nearRadiusKm, t]);

  function applyPublicDefaults(next) {
    setFilters((current) => ({
      ...current,
      ...next,
      risk: 'medium',
      landData: next.landData ?? 'floor',
      zoneType: next.zoneType ?? '',
      availability: next.availability ?? '',
      minScore: '',
      maxRatePerSqYard: '',
      maxLandCr: '',
      utilityMin: '',
      sourceLayer: '',
    }));
  }

  function handleFindMatches() {
    applyPublicDefaults({
      sector: filters.sector || 'industrial',
      budget: filters.budget,
      district: filters.district,
      nearMe: filters.nearMe,
      nearRadiusKm: filters.nearRadiusKm || 25,
      landData: 'floor',
    });
    setStarted(true);
    setStep(4);
    onSearchReady?.();
  }

  function ChoiceCard({ active, title, blurb, onClick }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-xl border px-3 py-3 text-left transition ${
          active
            ? 'border-ds-accent bg-ds-accent-subtle shadow-sm'
            : 'border-ds-border-subtle bg-ds-surface-sunken hover:border-ds-accent/50'
        }`}
      >
        <div className="text-sm font-bold text-ds-text-primary">{title}</div>
        <div className="mt-1 text-[11px] leading-4 text-ds-text-secondary">{blurb}</div>
      </button>
    );
  }

  function ZoneCard({ zone, index, featured = false }) {
    const verdict = plainVerdict(zone.verdict, zone.opportunityScore, t);
    const compsN = zone.landValue?.comparableSampleCount ?? zone.landValue?.comparableCount ?? 0;
    const tip = confidenceTip(zone.landValue?.confidence, zone.landValue?.marketAvailable, compsN, t);
    const rate =
      zone.landValue?.estimatedPerSqYardInr ||
      zone.landValue?.circleRatePerSqYardInr ||
      zone.landCostBand?.lowPerSqYard;
    const allIn = zone.components?.estimatedAllInLandCostInr || zone.components?.estimatedLandCostInr;
    const toneClass =
      verdict.tone === 'success'
        ? 'bg-ds-success-subtle text-ds-success'
        : verdict.tone === 'warning'
          ? 'bg-ds-warning-subtle text-ds-warning'
          : 'bg-ds-surface-raised text-ds-text-secondary';

    return (
      <div
        className={`rounded-xl border px-3 py-3 transition ${
          featured
            ? 'border-ds-accent/40 bg-gradient-to-br from-ds-accent-subtle/80 to-ds-surface-sunken'
            : 'border-ds-border-subtle bg-ds-surface-sunken hover:border-ds-accent/40'
        }`}
      >
        <button type="button" onClick={() => onFlyToZone(zone)} className="w-full text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Trophy size={14} className={index === 0 ? 'text-ds-warning' : 'text-ds-text-tertiary'} />
                <div className="truncate text-sm font-bold text-ds-text-primary">{zone.name}</div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${toneClass}`}>
                  {verdict.label}
                </span>
                {index < 5 ? (
                  <span className="shrink-0 rounded bg-ds-surface-raised px-1.5 py-0.5 text-[10px] font-semibold text-ds-text-tertiary">
                    {t('inv.onMap', { n: index + 1 })}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-ds-text-secondary">
                {zone.district}
                {zone.distanceKm != null ? ` · ${t('inv.kmAway', { km: zone.distanceKm })}` : ''}
                {' · '}
                {t('inv.estate', { acres: acres(zone.areaAcres) })}
              </div>
              <p className="mt-2 text-[12px] leading-5 text-ds-text-primary">{whyMatchLine(zone, t)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                {rate ? (
                  <span className="rounded-md bg-ds-surface-raised px-1.5 py-0.5 text-ds-text-secondary">
                    {t('inv.rate', { rate: Number(rate).toLocaleString('en-IN') })}
                    {zone.landValue?.circleRateEffectiveFrom
                      ? ` · ${t('inv.rateFrom', { date: zone.landValue.circleRateEffectiveFrom })}`
                      : ''}
                  </span>
                ) : (
                  <span className="rounded-md bg-ds-surface-raised px-1.5 py-0.5 text-ds-text-tertiary">
                    {t('inv.noRate')}
                  </span>
                )}
                {zone.landValue?.marketAvailable ? (
                  <span className="rounded-md bg-ds-surface-raised px-1.5 py-0.5 text-ds-text-secondary">
                    {t('inv.deals', { n: compsN })}
                  </span>
                ) : rate ? (
                  <span className="rounded-md bg-ds-surface-raised px-1.5 py-0.5 text-ds-text-tertiary">
                    {t('inv.officialOnly')}
                  </span>
                ) : null}
                {zone.availability?.label ? (
                  <span className="rounded-md bg-ds-surface-raised px-1.5 py-0.5 text-ds-text-secondary">
                    {availabilityLabel(zone.availability, t)}
                  </span>
                ) : null}
              </div>
              {allIn ? (
                <div className="mt-2 text-[12px] font-semibold text-ds-text-primary">
                  {t('inv.allIn', { v: formatInr(allIn) })}
                </div>
              ) : null}
              <div className="mt-1 text-[10px] leading-4 text-ds-text-tertiary">{tip}</div>
              {zone.keyRisk ? (
                <div className="mt-1 text-[10px] text-ds-warning">{t('inv.watch', { risk: plainRisk(zone.keyRisk, t) })}</div>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <div className="rounded-lg bg-ds-warning-subtle px-2 py-1 text-sm font-black text-ds-warning">
                {zone.opportunityScore}
              </div>
              <div className="mt-1">
                <ScoreWord score={zone.opportunityScore} />
              </div>
            </div>
          </div>
        </button>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ds-border-subtle/60 pt-2">
          <button
            type="button"
            onClick={() => setExpandedZoneId((current) => (current === zone.id ? null : zone.id))}
            className="flex items-center gap-1 text-[11px] font-semibold text-ds-accent"
          >
            {expandedZoneId === zone.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {t('inv.whyMatch')}
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAddToPipeline(zone.id)}
              className="rounded-md border border-ds-border-subtle bg-ds-surface-raised px-2 py-1 text-[11px] font-bold text-ds-text-secondary hover:border-ds-accent"
            >
              {t('inv.save')}
            </button>
            <button
              type="button"
              onClick={() => onDeepAnalysis(zone)}
              className="rounded-md border border-ds-border-subtle bg-ds-surface-raised px-2 py-1 text-[11px] font-bold text-ds-text-secondary hover:border-ds-accent"
            >
              {t('inv.details')}
            </button>
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/embed/${encodeURIComponent(zone.id)}`;
                navigator.clipboard.writeText(
                  `<iframe src="${url}" title="${zone.name} LOCATIUM card" width="420" height="360" style="border:0"></iframe>`
                );
              }}
              className="rounded-md border border-ds-border-subtle bg-ds-surface-raised px-2 py-1 text-[11px] font-bold text-ds-text-secondary hover:border-ds-accent"
            >
              {t('inv.embed')}
            </button>
            <button
              type="button"
              onClick={() => onToggleCompare(zone.id)}
              className={`rounded-md border px-2 py-1 text-[11px] font-bold ${
                compareIds.includes(zone.id)
                  ? 'border-ds-success bg-ds-success-subtle text-ds-success'
                  : 'border-ds-border-subtle bg-ds-surface-raised text-ds-text-secondary'
              }`}
            >
              {t('inv.compare')}
            </button>
          </div>
        </div>

        {expandedZoneId === zone.id ? (
          <div className="mt-2 space-y-2 rounded-lg bg-ds-surface-raised p-2 text-[11px] text-ds-text-secondary">
            <div className="grid grid-cols-3 gap-2">
              <span>Infrastructure {zone.components?.infrastructure ?? '—'}</span>
              <span>Access {zone.components?.accessibility ?? '—'}</span>
              <span>Use fit {zone.components?.zoneTypeMatch ?? '—'}</span>
            </div>
            {(zone.opportunityBreakdown || []).slice(0, 4).map((row) => (
              <div key={row.key || row.label} className="flex justify-between gap-2">
                <span>{row.label}</span>
                <span className="font-semibold text-ds-text-primary">{row.score ?? row.value ?? '—'}</span>
              </div>
            ))}
            {zone.mlScore != null ? (
              <MethodBadge
                method={zone.mlAdjusted && !zone.mlExperimental ? 'ml' : 'heuristic'}
                fallback={zone.mlMethod === 'unavailable'}
                experimentalScore={zone.mlExperimental ? zone.mlScore : null}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ds-text-secondary">
            <BriefcaseBusiness size={15} className="text-ds-warning" /> {t('inv.title')}
          </div>
          <p className="mt-1 text-xs leading-5 text-ds-text-secondary">
            {t('inv.intro')}
          </p>
        </div>
        {started ? (
          <div className="rounded-lg border border-ds-warning/30 bg-ds-warning-subtle px-2 py-1 text-[11px] font-bold text-ds-warning">
            {t('inv.matches', { n: count })}
          </div>
        ) : null}
      </div>

      {/* Wizard */}
      {!started || step < 4 ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 text-[11px] text-ds-text-tertiary">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                  step === n
                    ? 'bg-ds-accent text-white'
                    : step > n
                      ? 'bg-ds-success-subtle text-ds-success'
                      : 'bg-ds-surface-sunken text-ds-text-tertiary'
                }`}
              >
                {step > n ? <CheckCircle2 size={12} /> : n}
              </span>
            ))}
            <span className="ml-1">
              {step === 1 ? t('inv.q1') : step === 2 ? t('inv.q2') : t('inv.q3')}
            </span>
          </div>

          {step === 1 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {USE_OPTIONS.map((opt) => (
                <ChoiceCard
                  key={opt.value}
                  active={filters.sector === opt.value}
                  title={opt.title}
                  blurb={opt.blurb}
                  onClick={() => {
                    updateFilter('sector', opt.value);
                    setStep(2);
                  }}
                />
              ))}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BUDGET_OPTIONS.map((opt) => (
                  <ChoiceCard
                    key={opt.value || 'any'}
                    active={filters.budget === opt.value}
                    title={opt.title}
                    blurb={opt.blurb}
                    onClick={() => {
                      updateFilter('budget', opt.value);
                      setStep(3);
                    }}
                  />
                ))}
              </div>
              <button type="button" onClick={() => setStep(1)} className="text-[11px] font-semibold text-ds-accent">
                {t('inv.back')}
              </button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2">
                <ChoiceCard
                  active={!filters.district && !filters.nearMe}
                  title={t('inv.where.all')}
                  blurb={t('inv.where.all.blurb')}
                  onClick={() => {
                    updateFilter('district', '');
                    updateFilter('nearMe', false);
                  }}
                />
                <ChoiceCard
                  active={filters.nearMe}
                  title={t('inv.where.near')}
                  blurb={
                    selectedLocation?.lat != null
                      ? t('inv.where.near.blurb', {
                          lat: Number(selectedLocation.lat).toFixed(2),
                          lng: Number(selectedLocation.lng).toFixed(2),
                        })
                      : t('inv.where.near.blurbEmpty')
                  }
                  onClick={() => {
                    updateFilter('nearMe', true);
                    updateFilter('district', '');
                  }}
                />
              </div>
              {filters.nearMe ? (
                <SelectField
                  label={t('inv.howFar')}
                  value={String(filters.nearRadiusKm || 25)}
                  onChange={(value) => updateFilter('nearRadiusKm', Number(value))}
                  options={[
                    { value: '10', label: t('inv.withinKm', { km: 10 }) },
                    { value: '25', label: t('inv.withinKm', { km: 25 }) },
                    { value: '50', label: t('inv.withinKm', { km: 50 }) },
                    { value: '100', label: t('inv.withinKm', { km: 100 }) },
                  ]}
                />
              ) : (
                <SelectField
                  label={t('inv.pickDistrict')}
                  value={filters.district}
                  onChange={(value) => {
                    updateFilter('district', value);
                    if (value) updateFilter('nearMe', false);
                  }}
                  options={districtOptions}
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setStep(2)} className="text-[11px] font-semibold text-ds-accent">
                  {t('inv.back')}
                </button>
                <button
                  type="button"
                  onClick={handleFindMatches}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-ds-accent px-4 text-sm font-bold text-white hover:opacity-95 sm:flex-none"
                >
                  <Search size={15} /> {t('inv.find')}
                </button>
              </div>
              <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 py-2 text-[11px] text-ds-text-secondary">
                {t('inv.example')}{' '}
                <button
                  type="button"
                  className="font-semibold text-ds-accent underline"
                  onClick={() => {
                    applyPublicDefaults({
                      sector: 'industrial',
                      budget: 'low',
                      district: 'Gurugram',
                      nearMe: false,
                      landData: 'floor',
                    });
                    setStarted(true);
                    setStep(4);
                    onSearchReady?.();
                  }}
                >
                  {t('inv.exampleLabel')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Results */}
      {started && step >= 4 ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-sunken px-3 py-2 text-[11px] text-ds-text-secondary">
            <span>
              {t('inv.lookingFor')} <strong className="text-ds-text-primary">{USE_OPTIONS.find((u) => u.value === filters.sector)?.title || filters.sector}</strong>
              {' · '}
              <strong className="text-ds-text-primary">
                {BUDGET_OPTIONS.find((b) => b.value === filters.budget)?.title || t('inv.budget.any')}
              </strong>
              {' · '}
              <strong className="text-ds-text-primary">{placeSummary}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setStarted(false);
              }}
              className="font-semibold text-ds-accent"
            >
              {t('inv.change')}
            </button>
          </div>

          {mapHighlightCount > 0 ? (
            <div className="rounded-lg border border-ds-accent/25 bg-ds-accent-subtle px-3 py-2 text-[11px] leading-5 text-ds-accent-text">
              <MapPinned size={13} className="mr-1 inline" />
              {t('inv.mapHint', { n: mapHighlightCount })}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-ds-danger/40 bg-ds-danger-subtle p-3 text-xs text-ds-danger">{error}</div>
          ) : null}

          {loading ? (
            <div className="rounded-xl bg-ds-surface-sunken px-3 py-6 text-center text-sm text-ds-text-secondary">
              {t('inv.finding')}
              <SlowSearchHint />
            </div>
          ) : null}

          {!loading && !opportunities.length ? (
            <div className="rounded-xl border border-dashed border-ds-border-subtle bg-ds-surface-sunken px-4 py-6 text-center">
              <AlertTriangle size={18} className="mx-auto text-ds-warning" />
              <div className="mt-2 text-sm font-semibold text-ds-text-primary">{t('inv.none')}</div>
              <p className="mt-1 text-xs text-ds-text-secondary">
                {t('inv.noneHint')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setStarted(false);
                }}
                className="mt-3 text-[11px] font-semibold text-ds-accent"
              >
                {t('inv.edit')}
              </button>
            </div>
          ) : null}

          {top ? (
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ds-text-tertiary">
                {t('inv.best')}
              </div>
              <ZoneCard zone={top} index={0} featured />
            </div>
          ) : null}

          {rest.length ? (
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ds-text-tertiary">
                {t('inv.others')}
              </div>
              <div className="space-y-2">
                {rest.map((zone, i) => (
                  <ZoneCard key={zone.id} zone={zone} index={i + 1} />
                ))}
              </div>
            </div>
          ) : null}

          {more.length ? (
            <details className="rounded-xl border border-ds-border-subtle bg-ds-surface-sunken px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-ds-text-secondary">
                {t('inv.more', { n: more.length })}
              </summary>
              <div className="mt-2 space-y-2">
                {more.map((zone, i) => (
                  <ZoneCard key={zone.id} zone={zone} index={i + 5} />
                ))}
              </div>
            </details>
          ) : null}

          <div className="rounded-xl border border-ds-border-subtle bg-ds-surface-sunken px-3 py-3">
            <button
              type="button"
              onClick={() => setShowPricingHelp((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="flex items-center gap-2 text-[12px] font-semibold text-ds-text-primary">
                <Info size={14} className="text-ds-accent" /> {t('inv.pricingHelp')}
              </span>
              {showPricingHelp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showPricingHelp ? (
              <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-ds-text-secondary">
                <li>{t('inv.pricing.official')}</li>
                <li>{t('inv.pricing.market')}</li>
                <li>{t('inv.pricing.allIn')}</li>
                <li>{t('inv.pricing.never')}</li>
              </ul>
            ) : null}
          </div>

          <Disclaimer />

          {/* Quick actions for public */}
          {/* Alerts always go to the signed-in account's own confirmed email. */}
          <button
            type="button"
            onClick={onSubscribeAlert}
            className="h-9 w-full rounded-lg border border-ds-border-subtle px-3 text-xs font-semibold hover:border-ds-accent"
          >
            Email me if better matches appear
          </button>
          {alertMsg ? <div className="text-xs text-ds-text-secondary">{alertMsg}</div> : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={saveSearchName}
              onChange={(e) => setSaveSearchName(e.target.value)}
              placeholder="Name this search (optional)"
              className="h-9 min-w-0 flex-1 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 text-xs"
            />
            <button
              type="button"
              onClick={onSaveSearch}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-ds-border-subtle px-3 text-xs font-semibold hover:border-ds-accent"
            >
              <Search size={13} /> Save search
            </button>
          </div>
          {saveSearchMsg ? <div className="text-xs text-ds-text-secondary">{saveSearchMsg}</div> : null}

          <button
            type="button"
            onClick={() => setShowPro((v) => !v)}
            className="text-[11px] font-semibold text-ds-accent"
          >
            {showPro ? 'Hide pro tools' : 'Show pro tools · pipeline, advanced filters, export'}
          </button>
        </div>
      ) : null}

      {/* Pro tools (advanced) */}
      {showPro ? (
        <div className="mt-4 space-y-3 border-t border-ds-border-subtle pt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ds-text-tertiary">Pro filters</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SelectField
              label="Environmental risk"
              hint="How strict to be about flood/forest/air constraints"
              value={filters.risk}
              onChange={(value) => updateFilter('risk', value)}
              options={[
                { value: 'low', label: 'Low · safer sites' },
                { value: 'medium', label: 'Medium · balanced' },
                { value: 'high', label: 'High · allow risk' },
              ]}
            />
            <SelectField
              label="Ownership"
              value={filters.zoneType}
              onChange={(value) => updateFilter('zoneType', value)}
              options={[
                { value: '', label: 'Any ownership' },
                { value: 'government', label: 'Govt (HSIIDC / HSVP)' },
                { value: 'private', label: 'Private (licensed)' },
                { value: 'cooperative', label: 'Cooperative' },
              ]}
            />
            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ds-text-secondary">
              Near map center
              <button
                type="button"
                onClick={() => updateFilter('nearMe', !filters.nearMe)}
                className={`flex h-9 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold transition ${
                  filters.nearMe
                    ? 'border-ds-accent bg-ds-accent-subtle text-ds-accent'
                    : 'border-ds-border-subtle bg-ds-surface-sunken text-ds-text-secondary'
                }`}
              >
                <Navigation size={13} />
                {filters.nearMe ? 'On' : 'Off'}
              </button>
            </label>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-[11px] font-semibold text-ds-accent"
          >
            {showAdvanced ? 'Hide detailed filters' : 'Show detailed filters'}
          </button>

          {showAdvanced ? (
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken/40 p-2 sm:grid-cols-2">
              <SelectField
                label="Land data quality"
                value={filters.landData}
                onChange={(value) => updateFilter('landData', value)}
                options={[
                  { value: '', label: 'Any land data' },
                  { value: 'floor', label: 'Has gov floor' },
                  { value: 'comps', label: 'Has market comps' },
                  { value: 'medium_plus', label: 'Medium+ confidence' },
                  { value: 'high_confidence', label: 'High confidence' },
                ]}
              />
              <SelectField
                label="Land source layer"
                value={filters.sourceLayer}
                onChange={(value) => updateFilter('sourceLayer', value)}
                options={[
                  { value: '', label: 'All sources' },
                  { value: 'hsiidc', label: 'HSIIDC estates' },
                  { value: 'hsvp', label: 'HSVP plots' },
                  { value: 'licensed', label: 'Licensed colonies' },
                  { value: 'land_bank', label: 'Karnal land bank' },
                ]}
              />
              <SelectField
                label="Utility readiness"
                value={filters.utilityMin}
                onChange={(value) => updateFilter('utilityMin', value)}
                options={[
                  { value: '', label: 'Any utility level' },
                  { value: 'medium', label: 'Medium or better' },
                  { value: 'high', label: 'High only' },
                ]}
              />
              <SelectField
                label="Plot availability"
                value={filters.availability}
                onChange={(value) => updateFilter('availability', value)}
                options={[
                  { value: '', label: 'Any availability' },
                  { value: 'available', label: 'Has available plots' },
                  { value: 'plot_inventory', label: 'Has plot inventory' },
                ]}
              />
              <SelectField
                label="Minimum score"
                value={String(filters.minScore || '')}
                onChange={(value) => updateFilter('minScore', value)}
                options={[
                  { value: '', label: 'No minimum' },
                  { value: '55', label: '≥ 55' },
                  { value: '65', label: '≥ 65' },
                  { value: '75', label: '≥ 75' },
                ]}
              />
              <SelectField
                label="Max ₹ / sq yd"
                value={String(filters.maxRatePerSqYard || '')}
                onChange={(value) => updateFilter('maxRatePerSqYard', value)}
                options={[
                  { value: '', label: 'No rate cap' },
                  { value: '10000', label: '≤ ₹10,000' },
                  { value: '20000', label: '≤ ₹20,000' },
                  { value: '35000', label: '≤ ₹35,000' },
                  { value: '50000', label: '≤ ₹50,000' },
                  { value: '100000', label: '≤ ₹1,00,000' },
                ]}
              />
            </div>
          ) : null}

          {savedSearches.length ? (
            <SelectField
              label="Load saved search"
              value=""
              onChange={(id) => {
                const search = savedSearches.find((s) => s.id === id);
                if (search?.filters) onLoadSavedSearch(search.filters);
              }}
              options={[
                { value: '', label: 'Choose…' },
                ...savedSearches.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onBulkExport}
              className="h-8 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 text-[11px] font-semibold hover:border-ds-accent"
            >
              Export CSV
            </button>
            <input
              type="text"
              value={portfolioName}
              onChange={(e) => setPortfolioName(e.target.value)}
              placeholder="Portfolio name…"
              className="h-8 min-w-[120px] flex-1 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-2 text-[11px]"
            />
            <button
              type="button"
              onClick={onSavePortfolio}
              className="h-8 rounded-lg border border-ds-border-subtle px-3 text-[11px] font-semibold hover:border-ds-accent"
            >
              Save portfolio
            </button>
          </div>
          {portfolioMsg ? <div className="text-xs text-ds-text-secondary">{portfolioMsg}</div> : null}

          <SelectField
            label="Alert for saved search"
            value={selectedSavedSearchId}
            onChange={setSelectedSavedSearchId}
            options={[
              { value: '', label: 'Current filters only' },
              ...savedSearches.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />

          <InvestorPipelineBoard
            stages={pipelineStages || ['discovered', 'shortlisted', 'due_diligence', 'negotiation', 'closed', 'passed']}
            items={pipelineItems || []}
            opportunities={opportunities}
            onRefresh={onRefreshPipeline}
            onFlyToZone={onFlyToZone}
          />

          {portfolios.length ? (
            <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ds-text-tertiary">Saved portfolios</div>
              <div className="mt-2 space-y-2">
                {portfolios.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md bg-ds-surface-raised p-2 text-[11px]">
                    <span className="font-semibold text-ds-text-primary">{p.name}</span>
                    <span className="text-ds-text-secondary">{p.zoneIds?.length || 0} zones</span>
                    {p.shareToken ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard.writeText(`${window.location.origin}/portfolio/${p.shareToken}`)
                        }
                        className="rounded border border-ds-border-subtle px-2 py-0.5 hover:border-ds-accent"
                      >
                        Copy share link
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onPortfolioPdf(p)}
                      className="rounded border border-ds-border-subtle px-2 py-0.5 hover:border-ds-accent"
                    >
                      PDF
                    </button>
                    <button type="button" onClick={() => onDeletePortfolio(p.id)} className="text-ds-danger">
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {alerts.length ? (
            <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ds-text-tertiary">Active alerts</div>
              <div className="mt-2 space-y-1 text-[11px] text-ds-text-secondary">
                {alerts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2">
                    <span>
                      {a.email} · {a.searchName || 'custom filters'}
                    </span>
                    <button type="button" onClick={() => onDeleteAlert(a.id)} className="text-ds-danger">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** After a few seconds of waiting, explains why a first district search is slow. */
function SlowSearchHint() {
  const t = useT();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (seconds < 6) return null;
  return (
    <p className="mt-2 text-xs leading-5 text-ds-text-tertiary">{t('inv.slow', { s: seconds })}</p>
  );
}
