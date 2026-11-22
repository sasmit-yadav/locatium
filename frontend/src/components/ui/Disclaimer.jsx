import { useQuery } from '@tanstack/react-query';
import { useLang, useT } from '../../i18n';
import { getTransparencyStats } from '../../services/portal';

function formatDate(iso, lang) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Short "screening tool, not advice" line with the date of the newest circle rates and a
 * link to the Terms. Shown next to every score and plot summary.
 */
export function Disclaimer({ className = '' }) {
  const t = useT();
  const lang = useLang();
  const { data } = useQuery({
    queryKey: ['public-transparency'],
    queryFn: getTransparencyStats,
    staleTime: 1000 * 60 * 10,
  });
  const asOf = formatDate(data?.dataAsOf?.circleRates, lang);
  const stale = data?.dataAsOf?.circleRatesStale;
  return (
    <p className={`text-[10px] leading-4 text-ds-text-tertiary ${className}`}>
      {asOf ? (
        <span className={stale ? 'font-semibold text-ds-warning' : ''}>
          {t(stale ? 'data.asOfStale' : 'data.asOf', { date: asOf })}{' '}
        </span>
      ) : null}
      {t('inv.disclaimer')}{' '}
      <a href="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-2">
        {t('legal.terms')}
      </a>
    </p>
  );
}
