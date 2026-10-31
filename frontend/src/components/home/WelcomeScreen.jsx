import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Hexagon, Map, MapPin, MessageCircle, Search } from 'lucide-react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useLangStore, useT } from '../../i18n';
import { usePrefersReducedMotion } from '../../design-system/usePrefersReducedMotion';

function Choice({ icon: Icon, title, blurb, onClick, primary = false, buttonRef }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={`group flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:shadow-ds-focus ${
        primary
          ? 'border-ds-accent bg-ds-accent-subtle hover:shadow-ds-md'
          : 'border-ds-border bg-ds-surface-raised hover:border-ds-accent hover:shadow-ds-sm'
      }`}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ds-accent text-white">
        <Icon size={22} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 text-base font-bold text-ds-text-primary">
          {title}
          <ArrowRight size={18} className="shrink-0 text-ds-accent transition group-hover:translate-x-0.5" aria-hidden />
        </span>
        <span className="mt-1 block text-[13px] leading-5 text-ds-text-secondary">{blurb}</span>
      </span>
    </button>
  );
}

/**
 * Question-first start: three big, plain choices instead of a GIS map full of layers.
 * The map stays one tap away ("Just show me the map").
 */
export function WelcomeScreen() {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const open = useDashboardStore((s) => s.welcomeOpen);
  const setWelcomeOpen = useDashboardStore((s) => s.setWelcomeOpen);
  const openInspector = useDashboardStore((s) => s.openInspector);
  const setCommandPaletteOpen = useDashboardStore((s) => s.setCommandPaletteOpen);
  const reduce = usePrefersReducedMotion();
  const [dontShow, setDontShow] = useState(false);
  const firstChoiceRef = useRef(null);

  // Escape closes; focus moves into the dialog so keyboard and screen-reader users land on the choices.
  useEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => firstChoiceRef.current?.focus());
    const onKey = (e) => {
      if (e.key === 'Escape') setWelcomeOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setWelcomeOpen]);

  function close() {
    try {
      if (dontShow) window.localStorage.setItem('locatium.welcome.skip', '1');
    } catch {
      /* storage unavailable */
    }
    setWelcomeOpen(false);
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="welcome"
          className="fixed inset-0 z-[1250] flex items-end justify-center bg-slate-900/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-ds-border bg-ds-surface-base p-5 shadow-2xl sm:rounded-3xl sm:p-7"
            initial={reduce ? false : { y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-ds-text-primary">
                <Hexagon size={20} className="text-ds-accent" aria-hidden />
                <span className="text-sm font-bold tracking-wide">LOCATIUM</span>
              </div>
              <button
                type="button"
                onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}
                className="rounded-full border border-ds-border px-3 py-1.5 text-xs font-semibold text-ds-text-primary hover:border-ds-accent"
                aria-label={t('nav.languageTitle')}
              >
                {t('nav.language')}
              </button>
            </div>
            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-ds-accent">{t('welcome.kicker')}</div>
            <h1 id="welcome-title" className="mt-1 text-2xl font-black leading-tight text-ds-text-primary sm:text-3xl">
              {t('welcome.title')}
            </h1>
            <p className="mt-2 text-sm leading-6 text-ds-text-secondary">{t('welcome.subtitle')}</p>

            <div className="mt-5 space-y-3">
              <Choice
                primary
                buttonRef={firstChoiceRef}
                icon={Search}
                title={t('welcome.buy.title')}
                blurb={t('welcome.buy.blurb')}
                onClick={() => {
                  close();
                  openInspector('investor');
                }}
              />
              <Choice
                icon={MapPin}
                title={t('welcome.check.title')}
                blurb={t('welcome.check.blurb')}
                onClick={() => {
                  close();
                  openInspector('overview');
                  setCommandPaletteOpen(true);
                }}
              />
              <Choice
                icon={MessageCircle}
                title={t('welcome.ask.title')}
                blurb={t('welcome.ask.blurb')}
                onClick={() => {
                  close();
                  window.dispatchEvent(new CustomEvent('locatium:open-assistant'));
                }}
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={close}
                className="inline-flex items-center gap-2 text-sm font-semibold text-ds-accent hover:underline"
              >
                <Map size={16} aria-hidden /> {t('welcome.explore')}
              </button>
              <label className="flex items-center gap-2 text-xs text-ds-text-secondary">
                <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} className="h-4 w-4" />
                {t('welcome.dontShow')}
              </label>
            </div>
            <p className="mt-4 text-[11px] leading-4 text-ds-text-tertiary">{t('welcome.trust')}</p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
