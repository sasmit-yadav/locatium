import {
  colors,
  typography,
  radius,
  shadow,
  motion,
  zIndex,
  layout,
} from './src/design-system/tokens.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy palettes kept until later phases migrate screens onto ds.* tokens.
        nf: {
          black: '#0b0b0b',
          panel: '#141414',
          card: '#1a1a1a',
          muted: '#808080',
          red: '#E50914',
          'red-hover': '#f6121d',
        },
        kp: {
          teal: '#00d4c5',
          cyan: '#26d0ce',
          glow: 'rgba(0, 212, 197, 0.15)',
        },
        loc: {
          bg: '#0B1020',
          panel: '#111827',
          card: '#1A2333',
          border: '#263244',
          text: '#F8FAFC',
          muted: '#94A3B8',
          accent: '#00D4FF',
          success: '#00E676',
          warning: '#FFC107',
          danger: '#FF5252',
          gold: '#FFD700',
          water: '#00BFFF',
          forest: '#00C853',
          transport: '#FF6D00',
        },
        // Design system (ui_enhance.md) — prefer these for all new UI
        ds: {
          surface: {
            base: colors.surface.base,
            raised: colors.surface.raised,
            sunken: colors.surface.sunken,
            overlay: colors.surface.overlay,
          },
          border: {
            DEFAULT: colors.border.default,
            subtle: colors.border.subtle,
            strong: colors.border.strong,
          },
          text: {
            primary: colors.text.primary,
            secondary: colors.text.secondary,
            tertiary: colors.text.tertiary,
            inverse: colors.text.inverse,
            disabled: colors.text.disabled,
          },
          accent: {
            DEFAULT: colors.accent.default,
            hover: colors.accent.hover,
            subtle: colors.accent.subtle,
            text: colors.accent.text,
          },
          success: {
            DEFAULT: colors.semantic.success,
            subtle: colors.semantic.successSubtle,
          },
          warning: {
            DEFAULT: colors.semantic.warning,
            subtle: colors.semantic.warningSubtle,
          },
          danger: {
            DEFAULT: colors.semantic.danger,
            subtle: colors.semantic.dangerSubtle,
          },
          data: {
            0: colors.dataCategorical[0],
            1: colors.dataCategorical[1],
            2: colors.dataCategorical[2],
            3: colors.dataCategorical[3],
            4: colors.dataCategorical[4],
            5: colors.dataCategorical[5],
            6: colors.dataCategorical[6],
            7: colors.dataCategorical[7],
            low: colors.dataSequential.low,
            mid: colors.dataSequential.mid,
            high: colors.dataSequential.high,
          },
        },
      },
      fontFamily: {
        display: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        ui: typography.fontFamily.ui.split(',').map((s) => s.trim().replace(/^'|'$/g, '')),
        mono: typography.fontFamily.mono.split(',').map((s) => s.trim().replace(/^'|'$/g, '')),
      },
      fontSize: {
        'ds-caption': [
          typography.scale.caption.size,
          {
            lineHeight: typography.scale.caption.lineHeight,
            fontWeight: String(typography.scale.caption.weight),
            letterSpacing: typography.scale.caption.letterSpacing,
          },
        ],
        'ds-small': [
          typography.scale.small.size,
          {
            lineHeight: typography.scale.small.lineHeight,
            fontWeight: String(typography.scale.small.weight),
          },
        ],
        'ds-body': [
          typography.scale.body.size,
          {
            lineHeight: typography.scale.body.lineHeight,
            fontWeight: String(typography.scale.body.weight),
          },
        ],
        'ds-body-med': [
          typography.scale.bodyMed.size,
          {
            lineHeight: typography.scale.bodyMed.lineHeight,
            fontWeight: String(typography.scale.bodyMed.weight),
          },
        ],
        'ds-subtitle': [
          typography.scale.subtitle.size,
          {
            lineHeight: typography.scale.subtitle.lineHeight,
            fontWeight: String(typography.scale.subtitle.weight),
          },
        ],
        'ds-title': [
          typography.scale.title.size,
          {
            lineHeight: typography.scale.title.lineHeight,
            fontWeight: String(typography.scale.title.weight),
          },
        ],
        'ds-page-title': [
          typography.scale.pageTitle.size,
          {
            lineHeight: typography.scale.pageTitle.lineHeight,
            fontWeight: String(typography.scale.pageTitle.weight),
          },
        ],
        'ds-stat': [
          typography.scale.stat.size,
          {
            lineHeight: typography.scale.stat.lineHeight,
            fontWeight: String(typography.scale.stat.weight),
          },
        ],
      },
      borderRadius: {
        'ds-sm': radius.sm,
        'ds-md': radius.md,
        'ds-lg': radius.lg,
        'ds-full': radius.full,
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)',
        dock: '0 12px 40px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08)',
        loc: '0 22px 80px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)',
        glow: '0 0 28px rgba(0,212,255,0.22)',
        'glow-strong': '0 0 40px rgba(0,212,255,0.35)',
        'inner-light': 'inset 0 1px 0 rgba(255,255,255,0.06)',
        'inner-light-strong': 'inset 0 1px 0 rgba(255,255,255,0.15)',
        'ds-xs': shadow.xs,
        'ds-sm': shadow.sm,
        'ds-md': shadow.md,
        'ds-focus': shadow.focusRing,
      },
      transitionDuration: {
        'ds-fast': motion.fast,
        'ds-base': motion.base,
        'ds-slow': motion.slow,
      },
      transitionTimingFunction: {
        ds: motion.easing,
      },
      zIndex: {
        'ds-map': String(zIndex.map),
        'ds-map-controls': String(zIndex.mapControls),
        'ds-floating-panel': String(zIndex.floatingPanel),
        'ds-toolbar': String(zIndex.toolbar),
        'ds-dropdown': String(zIndex.dropdown),
        'ds-modal': String(zIndex.modal),
        'ds-toast': String(zIndex.toast),
      },
      width: {
        'ds-panel': `${layout.panelWidth}px`,
        'ds-icon-btn': `${layout.iconButton}px`,
      },
      height: {
        'ds-icon-btn': `${layout.iconButton}px`,
        'ds-toolbar': `${layout.toolbarHeight}px`,
      },
      spacing: {
        'ds-0': '0px',
        'ds-0.5': '2px',
        'ds-1': '4px',
        'ds-2': '8px',
        'ds-3': '12px',
        'ds-4': '16px',
        'ds-5': '20px',
        'ds-6': '24px',
        'ds-8': '32px',
        'ds-10': '40px',
        'ds-12': '48px',
        'ds-16': '64px',
      },
    },
  },
  plugins: [],
};
