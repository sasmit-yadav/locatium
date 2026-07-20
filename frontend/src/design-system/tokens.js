/**
 * LOCATIUM design tokens — single source of truth for presentation layer.
 * Spec: ui_enhance.md Section 2.
 * Do not introduce colors/type/spacing outside this file.
 */

export const colors = {
  surface: {
    base: '#FFFFFF',
    raised: '#FFFFFF',
    sunken: '#F5F6F7',
    overlay: 'rgba(20, 22, 26, 0.4)',
  },
  border: {
    default: '#E5E7EA',
    subtle: '#EEF0F2',
    strong: '#D1D5DB',
  },
  text: {
    primary: '#14161A',
    secondary: '#6B7280',
    tertiary: '#9CA3AF',
    inverse: '#FFFFFF',
    disabled: '#C4C8CD',
  },
  accent: {
    default: '#2563EB',
    hover: '#1D4ED8',
    subtle: '#EFF4FF',
    text: '#1D4ED8',
  },
  semantic: {
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    successSubtle: '#F0FDF4',
    warningSubtle: '#FFFBEB',
    dangerSubtle: '#FEF2F2',
  },
  dataCategorical: [
    '#2563EB',
    '#059669',
    '#D97706',
    '#DC2626',
    '#7C3AED',
    '#0891B2',
    '#DB2777',
    '#65A30D',
  ],
  dataSequential: {
    low: '#EFF4FF',
    mid: '#93B4F5',
    high: '#2563EB',
  },
};

export const typography = {
  fontFamily: {
    ui: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    mono: `'IBM Plex Mono', ui-monospace, monospace`,
  },
  scale: {
    caption: { size: '11px', lineHeight: '16px', weight: 500, letterSpacing: '0.02em' },
    small: { size: '12px', lineHeight: '16px', weight: 400 },
    body: { size: '13px', lineHeight: '20px', weight: 400 },
    bodyMed: { size: '13px', lineHeight: '20px', weight: 500 },
    subtitle: { size: '14px', lineHeight: '20px', weight: 600 },
    title: { size: '16px', lineHeight: '24px', weight: 600 },
    pageTitle: { size: '20px', lineHeight: '28px', weight: 600 },
    stat: { size: '24px', lineHeight: '32px', weight: 600 },
  },
};

/** Spacing scale in px — map to Tailwind steps 0 / 0.5 / 1 / 2 / 3 / 4 / 5 / 6 / 8 / 10 / 12 / 16 */
export const spacing = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64];

export const radius = {
  sm: '6px',
  md: '10px',
  lg: '14px',
  full: '9999px',
};

export const shadow = {
  none: 'none',
  xs: '0 1px 2px rgba(16, 24, 40, 0.05)',
  sm: '0 2px 8px rgba(16, 24, 40, 0.08)',
  md: '0 8px 24px rgba(16, 24, 40, 0.12)',
  focusRing: '0 0 0 3px rgba(37, 99, 235, 0.35)',
};

export const motion = {
  fast: '120ms',
  base: '180ms',
  slow: '260ms',
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

export const zIndex = {
  map: 0,
  mapControls: 10,
  floatingPanel: 20,
  toolbar: 30,
  dropdown: 40,
  modal: 50,
  toast: 60,
};

/** Layout constants used by primitives (add here before using in components) */
export const layout = {
  panelWidth: 340,
  iconButton: 32,
  toolbarHeight: 52,
  iconInline: 14,
  iconButtonGlyph: 16,
  iconEmpty: 20,
  tooltipDelayMs: 300,
  markerScaleInMs: 200,
};

export const tokens = {
  colors,
  typography,
  spacing,
  radius,
  shadow,
  motion,
  zIndex,
  layout,
};

export default tokens;
