import { useCallback } from 'react';
import { create } from 'zustand';
import { STRINGS } from './strings';

const KEY = 'locatium.lang';

function initialLang() {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'hi' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && /^hi\b/i.test(navigator.language || '') ? 'hi' : 'en';
}

function applyDocumentLang(lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export const useLangStore = create((set) => {
  const lang = typeof window === 'undefined' ? 'en' : initialLang();
  applyDocumentLang(lang);
  return {
    lang,
    setLang: (next) => {
      const value = next === 'hi' ? 'hi' : 'en';
      try {
        window.localStorage.setItem(KEY, value);
      } catch {
        /* storage unavailable: choice lasts this visit */
      }
      applyDocumentLang(value);
      set({ lang: value });
    },
  };
});

/** Looks a key up in the active language, falling back to English, then to the key. */
export function translate(lang, key, vars) {
  const raw = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  if (typeof raw === 'function') return raw(vars || {});
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
}

/** `const t = useT(); t('welcome.title')` — re-renders when the language changes. */
export function useT() {
  const lang = useLangStore((s) => s.lang);
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}

export function useLang() {
  return useLangStore((s) => s.lang);
}

/** "Good / Average / Weak" for a 0–100 score, matching the backend thresholds. */
export function scoreWordKey(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  return s >= 75 ? 'good' : s >= 55 ? 'average' : 'weak';
}

export const formatInr = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : `₹${Math.round(Number(v)).toLocaleString('en-IN')}`);
