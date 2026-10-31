import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Calculator } from 'lucide-react';
import { calculateAcquisitionCost } from '../../services/plot';
import { useDebounced } from '../../hooks/useDebounced';
import { formatInr, useT } from '../../i18n';
import { Term } from '../ui/Term';

function Segmented({ value, options, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
            value === o.value
              ? 'border-ds-accent bg-ds-accent-subtle text-ds-accent'
              : 'border-ds-border-subtle bg-ds-surface-base text-ds-text-secondary hover:border-ds-accent/50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const field =
  'h-10 w-full rounded-lg border border-ds-border-subtle bg-ds-surface-base px-2.5 text-sm text-ds-text-primary outline-none focus:border-ds-accent';

const LINE_TERMS = { stampDuty: 'stamp duty', land: null, registration: null, legal: null, brokerage: null };

/**
 * Total cost of buying: land + stamp duty (by buyer and urban/rural) + registration +
 * lawyer + broker, and an optional loan EMI. Calculated by the backend from one rates file.
 */
export function CostCalculator({ initialPrice, circleRate, onInputsChange }) {
  const t = useT();
  const [area, setArea] = useState('');
  const [unit, setUnit] = useState('sqyd');
  const [price, setPrice] = useState(initialPrice ? String(Math.round(initialPrice)) : '');
  const [buyer, setBuyer] = useState('man');
  const [areaType, setAreaType] = useState('urban');
  const [withLoan, setWithLoan] = useState(false);
  const [loanSharePct, setLoanSharePct] = useState('70');
  const [interestPct, setInterestPct] = useState('9.5');
  const [tenureYears, setTenureYears] = useState('15');

  // Memoised on the primitives so the debounce only restarts when an input really changes.
  const inputs = useMemo(
    () => ({
    area: Number(area),
    unit,
    pricePerSqYd: Number(price),
    circleRatePerSqYd: circleRate || undefined,
    buyer,
    areaType,
    withLoan,
    loanSharePct: Number(loanSharePct) / 100,
    interestPct: Number(interestPct),
    tenureYears: Number(tenureYears),
    }),
    [area, unit, price, circleRate, buyer, areaType, withLoan, loanSharePct, interestPct, tenureYears]
  );
  const debounced = useDebounced(inputs, 300);
  const ready = debounced.area > 0 && debounced.pricePerSqYd > 0;

  const { data, isError } = useQuery({
    queryKey: ['acquisition-cost', debounced],
    queryFn: () => calculateAcquisitionCost(debounced),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  useEffect(() => {
    onInputsChange?.({ areaSqYd: data && ready ? data.areaSqYd : null, buyer, areaType });
  }, [data, ready, buyer, areaType, onInputsChange]);

  return (
    <section className="rounded-xl border border-ds-border-subtle bg-ds-surface-raised p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-ds-text-primary">
        <Calculator size={16} className="text-ds-accent" aria-hidden /> {t('cost.title')}
      </div>
      <p className="mt-0.5 text-xs text-ds-text-secondary">{t('cost.subtitle')}</p>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-ds-text-secondary">{t('cost.area')}</span>
          <input
            inputMode="decimal"
            value={area}
            onChange={(e) => setArea(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="500"
            className={field}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-transparent" aria-hidden>
            .
          </span>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${field} pr-7`} aria-label={t('cost.area')}>
            {['sqyd', 'acre', 'sqm', 'sqft'].map((u) => (
              <option key={u} value={u}>
                {t(`cost.unit.${u}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block text-[11px] font-semibold text-ds-text-secondary">{t('cost.price')}</span>
        <input
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
          className={field}
        />
        <span className="mt-1 block text-[10px] leading-4 text-ds-text-tertiary">{t('cost.priceHint')}</span>
      </label>

      <div className="mt-3 space-y-1">
        <div className="text-[11px] font-semibold text-ds-text-secondary">{t('cost.buyer')}</div>
        <Segmented
          label={t('cost.buyer')}
          value={buyer}
          onChange={setBuyer}
          options={['man', 'woman', 'joint'].map((v) => ({ value: v, label: t(`cost.buyer.${v}`) }))}
        />
      </div>
      <div className="mt-2 space-y-1">
        <div className="text-[11px] font-semibold text-ds-text-secondary">{t('cost.place')}</div>
        <Segmented
          label={t('cost.place')}
          value={areaType}
          onChange={setAreaType}
          options={[
            { value: 'urban', label: t('cost.urban') },
            { value: 'rural', label: t('cost.rural') },
          ]}
        />
      </div>

      {!ready ? (
        <p className="mt-3 rounded-lg bg-ds-surface-sunken px-3 py-2 text-xs text-ds-text-secondary">{t('cost.enter')}</p>
      ) : isError ? null : data ? (
        <div className="mt-3 rounded-lg bg-ds-surface-sunken p-3">
          {data.belowCircleRate ? (
            <p className="mb-2 rounded-md bg-ds-warning-subtle px-2 py-1.5 text-[11px] leading-5 text-ds-warning">{t('cost.belowCircle')}</p>
          ) : null}
          <dl className="space-y-1.5 text-sm">
            {data.lines.map((line) => (
              <div key={line.key} className="flex items-baseline justify-between gap-3">
                <dt className="text-ds-text-secondary">
                  {LINE_TERMS[line.key] ? <Term k={LINE_TERMS[line.key]}>{t(`cost.line.${line.key}`)}</Term> : t(`cost.line.${line.key}`)}
                  {line.ratePct != null ? <span className="ml-1 text-[11px] text-ds-text-tertiary">({line.ratePct}%{line.basis === 'circle' ? `, ${t('cost.basisCircle')}` : ''})</span> : null}
                </dt>
                <dd className="tabular-nums text-ds-text-primary">{formatInr(line.amount)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-ds-border-subtle pt-2">
              <dt className="font-bold text-ds-text-primary">{t('cost.total')}</dt>
              <dd className="text-lg font-black tabular-nums text-ds-text-primary">{formatInr(data.total)}</dd>
            </div>
          </dl>

          <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-ds-text-primary">
            <input type="checkbox" checked={withLoan} onChange={(e) => setWithLoan(e.target.checked)} className="h-4 w-4 accent-[var(--ds-accent,#2563eb)]" />
            {t('cost.loan')}
          </label>
          {withLoan ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                [t('cost.loanShare'), loanSharePct, setLoanSharePct, '%'],
                [t('cost.interest'), interestPct, setInterestPct, ''],
                [t('cost.tenure'), tenureYears, setTenureYears, ''],
              ].map(([label, value, set, suffix]) => (
                <label key={label} className="block">
                  <span className="mb-1 block text-[10px] font-semibold text-ds-text-secondary">
                    {label}
                    {suffix ? ` (${suffix})` : ''}
                  </span>
                  <input inputMode="decimal" value={value} onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ''))} className={field} />
                </label>
              ))}
            </div>
          ) : null}
          {withLoan && data.loan ? (
            <div className="mt-2 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-ds-surface-raised p-2">
                <div className="text-base font-black tabular-nums text-ds-accent">{formatInr(data.loan.emi)}</div>
                <div className="text-[10px] text-ds-text-secondary">{t('cost.emi')}</div>
              </div>
              <div className="rounded-lg bg-ds-surface-raised p-2">
                <div className="text-base font-black tabular-nums text-ds-text-primary">{formatInr(data.loan.upfrontCash)}</div>
                <div className="text-[10px] text-ds-text-secondary">{t('cost.upfront')}</div>
              </div>
            </div>
          ) : null}
          <p className="mt-3 text-[10px] leading-4 text-ds-text-tertiary">
            {t('cost.note', { asOf: data.source?.asOf })}{' '}
            <a href={data.source?.verifyUrl} target="_blank" rel="noreferrer" className="font-semibold text-ds-accent underline">
              igrharyana.gov.in
            </a>
          </p>
        </div>
      ) : null}
    </section>
  );
}
