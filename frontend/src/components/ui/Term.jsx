import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { getGlossary } from '../../services/plot';
import { useLang, useT } from '../../i18n';

/**
 * Tap-to-explain jargon: `<Term k="circle rate">circle rate</Term>`.
 * Explanations come from the copilot's glossary (English + Hindi), so the words mean the
 * same thing everywhere. The popover is portalled and fixed-positioned so scrolling panels
 * never clip it.
 */
export function Term({ k, children }) {
  const lang = useLang();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const { data: glossary } = useQuery({ queryKey: ['glossary'], queryFn: getGlossary, staleTime: Infinity, retry: 1 });
  const entry = (glossary || []).find((g) => g.key === k);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target))) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (!entry) return <>{children}</>;

  function toggle(e) {
    e.stopPropagation();
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    const left = Math.min(Math.max(12, r.left), window.innerWidth - width - 12);
    const below = r.bottom + 8 + 180 < window.innerHeight;
    setPos({ left, width, top: below ? r.bottom + 6 : undefined, bottom: below ? undefined : window.innerHeight - r.top + 6 });
    setOpen((v) => !v);
  }

  const explanation = lang === 'hi' ? entry.hi || entry.en : entry.en || entry.explanation;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title={t('term.help')}
        className="cursor-help border-b border-dotted border-current text-inherit decoration-transparent hover:text-ds-accent focus-visible:outline-none focus-visible:text-ds-accent"
      >
        {children}
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={popRef}
              role="dialog"
              aria-label={entry.term}
              style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 1300 }}
              className="rounded-xl border border-ds-border bg-ds-surface-raised p-3 text-left shadow-ds-md"
            >
              <div className="text-sm font-bold text-ds-text-primary">{entry.term}</div>
              <p className="mt-1 text-xs leading-5 text-ds-text-primary">{explanation}</p>
              {lang !== 'hi' && entry.why ? (
                <p className="mt-2 text-[11px] leading-5 text-ds-text-secondary">
                  <span className="font-semibold">{t('term.why')}: </span>
                  {entry.why}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-2 text-[11px] font-semibold text-ds-accent"
              >
                {t('term.close')}
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
