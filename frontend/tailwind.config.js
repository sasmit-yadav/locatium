/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        display: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.45)',
        dock: '0 12px 40px rgba(0,0,0,0.65)',
      },
    },
  },
  plugins: [],
};
