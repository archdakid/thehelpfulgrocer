/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'rgb(var(--color-brand-primary) / <alpha-value>)',
          'primary-fg': 'rgb(var(--color-brand-primary-fg) / <alpha-value>)',
          accent: 'rgb(var(--color-brand-accent) / <alpha-value>)',
        },
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        scrim: 'rgb(var(--color-scrim) / <alpha-value>)',
        primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
        secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
        tertiary: 'rgb(var(--color-text-tertiary) / <alpha-value>)',
        inverse: 'rgb(var(--color-text-inverse) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        info: 'rgb(var(--color-info) / <alpha-value>)',
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          strong: 'rgb(var(--color-border-strong) / <alpha-value>)',
          focus: 'rgb(var(--color-brand-primary) / <alpha-value>)',
        },
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl: '24px',
        full: '9999px',
      },
      fontSize: {
        display: ['32px', { lineHeight: '38px', fontWeight: '600' }],
        h1: ['24px', { lineHeight: '30px', fontWeight: '600' }],
        h2: ['20px', { lineHeight: '26px', fontWeight: '600' }],
        h3: ['17px', { lineHeight: '22px', fontWeight: '600' }],
        body: ['16px', { lineHeight: '22px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '400' }],
        mono: ['14px', { lineHeight: '20px', fontWeight: '500' }],
      },
    },
  },
  plugins: [],
};
