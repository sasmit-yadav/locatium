import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { getBuyerChecklist } from '../../services/plot';
import { useLang, useT } from '../../i18n';

/** "Before you pay anything — check these", each with the official portal to do it on. */
export function BuyerChecklist({ items: provided }) {
  const t = useT();
  const lang = useLang();
  const { data } = useQuery({
    queryKey: ['buyer-checklist', lang],
    queryFn: () => getBuyerChecklist(lang),
    enabled: !provided,
    staleTime: Infinity,
  });
  const items = provided || data?.items || [];
  if (!items.length) return null;

  return (
    <section className="rounded-xl border border-ds-border-subtle bg-ds-surface-raised p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-ds-text-primary">
        <ShieldCheck size={16} className="text-ds-success" aria-hidden /> {t('checklist.title')}
      </div>
      <p className="mt-0.5 text-xs text-ds-text-secondary">{t('checklist.subtitle')}</p>
      <ol className="mt-3 space-y-2.5">
        {items.map((item, i) => (
          <li key={item.key} className="flex gap-2.5">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ds-accent-subtle text-[11px] font-bold text-ds-accent">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold leading-5 text-ds-text-primary">{item.title}</div>
              <p className="mt-0.5 text-xs leading-5 text-ds-text-secondary">{item.detail}</p>
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-ds-accent underline-offset-2 hover:underline"
                >
                  {t('checklist.open')}: {item.portal} <ExternalLink size={11} aria-hidden />
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
