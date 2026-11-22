import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, Loader2, MapPin } from 'lucide-react';
import { downloadPlotReport, getPlotSummary } from '../../services/plot';
import { useLang, useT } from '../../i18n';
import { ScoreWord } from '../ui/ScoreWord';
import { Term } from '../ui/Term';
import { CostCalculator } from './CostCalculator';
import { Disclaimer } from '../ui/Disclaimer';
import { BuyerChecklist } from './BuyerChecklist';

const USES = ['industrial', 'commercial', 'residential', 'agricultural'];

function List({ items, tone, icon: Icon, empty }) {
  if (!items?.length) return <p className="text-xs text-ds-text-tertiary">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-[13px] leading-5 text-ds-text-primary">
          <Icon size={15} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Check my plot": the plain-language answer for any point — what's good, what to watch,
 * the land price with its source, the full cost, a checklist and a downloadable PDF.
 */
export function CheckPlotCard({ location }) {
  const t = useT();
  const lang = useLang();
  const [sector, setSector] = useState('industrial');
  const [reportLang, setReportLang] = useState(null);
  const [costInputs, setCostInputs] = useState({ areaSqYd: null, buyer: 'man', areaType: 'urban' });
  const [download, setDownload] = useState({ state: 'idle', error: '' });
  const onInputsChange = useCallback((next) => setCostInputs(next), []);

  const { lat, lng } = location;
  const query = useQuery({
    queryKey: ['plot-summary', lat, lng, sector, lang],
    queryFn: () => getPlotSummary({ lat, lng, sector, lang }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const s = query.data;
  const pdfLang = reportLang || lang;

  async function handleDownload() {
    setDownload({ state: 'busy', error: '' });
    try {
      await downloadPlotReport({
        lat,
        lng,
        sector,
        lang: pdfLang,
        area: costInputs.areaSqYd || undefined,
        buyer: costInputs.buyer,
        areaType: costInputs.areaType,
        place: location.name && location.name !== 'Selected analysis point' ? location.name : location.district,
      });
      setDownload({ state: 'done', error: '' });
    } catch (err) {
      setDownload({ state: 'idle', error: err.message || t('check.error') });
    }
  }

  return (
    <div className="space-y-ds-4">
      <section className="rounded-xl border border-ds-accent/30 bg-ds-surface-raised p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ds-text-secondary">
          <MapPin size={14} className="text-ds-accent" aria-hidden /> {t('check.title')}
        </div>

        <div className="mt-3">
          <div className="text-[11px] font-semibold text-ds-text-secondary">{t('check.useFor')}</div>
          <div role="radiogroup" aria-label={t('check.useFor')} className="mt-1.5 grid grid-cols-2 gap-1.5">
            {USES.map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={sector === u}
                onClick={() => setSector(u)}
                className={`min-h-9 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                  sector === u
                    ? 'border-ds-accent bg-ds-accent-subtle text-ds-accent'
                    : 'border-ds-border-subtle bg-ds-surface-base text-ds-text-secondary hover:border-ds-accent/50'
                }`}
              >
                {t(`check.use.${u}`)}
              </button>
            ))}
          </div>
        </div>

        {query.isLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-ds-text-secondary">
            <Loader2 size={16} className="animate-spin text-ds-accent" aria-hidden /> {t('check.loading')}
          </div>
        ) : query.isError ? (
          <p className="mt-4 rounded-lg bg-ds-danger-subtle px-3 py-2 text-sm text-ds-danger">{t('check.error')}</p>
        ) : s ? (
          <>
            <div className="mt-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-bold leading-6 text-ds-text-primary">{s.headline}</h3>
              <div className="shrink-0 text-right">
                <div className="text-2xl font-black tabular-nums text-ds-text-primary">
                  {s.score}
                  <span className="text-xs font-semibold text-ds-text-tertiary">/100</span>
                </div>
                <ScoreWord score={s.score} />
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 text-xs font-bold text-ds-success">{t('check.good')}</div>
              <List items={s.good} tone="text-ds-success" icon={CheckCircle2} empty={t('check.none')} />
            </div>
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-bold text-ds-warning">{t('check.watch')}</div>
              <List items={s.watch} tone="text-ds-warning" icon={AlertTriangle} empty={t('check.none')} />
            </div>

            <div className="mt-4 rounded-lg bg-ds-surface-sunken p-3">
              <div className="text-xs font-bold text-ds-text-primary">
                {t('check.land')} · <Term k="circle rate">{lang === 'hi' ? 'सर्कल रेट' : 'circle rate'}</Term>
              </div>
              <ul className="mt-1.5 space-y-1 text-[13px] leading-5 text-ds-text-primary">
                {s.land.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {s.land.source ? (
                <p className="mt-2 text-[11px] leading-4 text-ds-text-tertiary">
                  {t('check.source')}: {s.land.source.label}
                  {s.land.source.district ? ` — ${s.land.source.district}` : ''}
                  {s.land.source.effectiveFrom ? ` (${s.land.source.effectiveFrom})` : ''}.{' '}
                  <a href={s.land.source.verifyUrl} target="_blank" rel="noreferrer" className="font-semibold text-ds-accent underline">
                    {t('check.verify')}
                  </a>
                </p>
              ) : null}
            </div>

            <div className="mt-4 rounded-lg border border-ds-border-subtle p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-ds-text-secondary">{t('check.downloadIn')}:</span>
                {['en', 'hi'].map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setReportLang(l)}
                    aria-pressed={pdfLang === l}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                      pdfLang === l ? 'border-ds-accent bg-ds-accent-subtle text-ds-accent' : 'border-ds-border-subtle text-ds-text-secondary'
                    }`}
                  >
                    {l === 'en' ? 'English' : 'हिंदी'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleDownload}
                disabled={download.state === 'busy'}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ds-accent px-4 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
              >
                {download.state === 'busy' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Download size={16} aria-hidden />}
                {download.state === 'busy' ? t('check.downloading') : t('check.download')}
              </button>
              {download.state === 'done' ? <p className="mt-1.5 text-[11px] text-ds-success">{t('check.downloaded')}</p> : null}
              {download.error ? <p className="mt-1.5 text-[11px] text-ds-danger">{download.error}</p> : null}
            </div>
          </>
        ) : null}
      </section>

      {s ? (
        <CostCalculator
          key={`${lat},${lng},${sector}`}
          initialPrice={s.land.estimatePerSqYd || s.land.circleRatePerSqYd}
          circleRate={s.land.circleRatePerSqYd}
          onInputsChange={onInputsChange}
        />
      ) : null}
      {s ? <BuyerChecklist items={s.checklist} /> : null}
      {s ? <Disclaimer className="px-1" /> : null}
    </div>
  );
}
