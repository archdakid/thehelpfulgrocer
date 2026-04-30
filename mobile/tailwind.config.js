/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand
        'brand-primary': {
          DEFAULT: '#0F6E56',
          dark: '#5DCAA5',
          fg: '#FFFFFF',
          'fg-dark': '#04342C',
        },
        'brand-accent': {
          DEFAULT: '#EF9F27',
          dark: '#FAC775',
        },
        // Surfaces
        'bg-canvas': {
          DEFAULT: '#FAFAF7',
          dark: '#0F0F0E',
        },
        'bg-surface': {
          DEFAULT: '#FFFFFF',
          dark: '#1A1A18',
        },
        'bg-muted': {
          DEFAULT: '#F1EFE8',
          dark: '#2C2C2A',
        },
        // Text
        'text-primary': {
          DEFAULT: '#1A1A18',
          dark: '#F5F5F0',
        },
        'text-secondary': {
          DEFAULT: '#5F5E5A',
          dark: '#B4B2A9',
        },
        'text-tertiary': {
          DEFAULT: '#888780',
          dark: '#888780',
        },
        'text-inverse': {
          DEFAULT: '#FFFFFF',
          dark: '#0F0F0E',
        },
        // Semantic
        success: {
          DEFAULT: '#0F6E56',
          dark: '#5DCAA5',
        },
        warning: {
          DEFAULT: '#BA7517',
          dark: '#EF9F27',
        },
        danger: {
          DEFAULT: '#A32D2D',
          dark: '#E24B4A',
        },
        info: {
          DEFAULT: '#185FA5',
          dark: '#85B7EB',
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
