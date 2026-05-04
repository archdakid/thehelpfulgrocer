/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Match the mobile design system's neutrals so the admin doesn't
        // feel like a separate product. These are HSL approximations of the
        // mobile light theme.
        bg: '#fafaf9',
        surface: '#ffffff',
        border: '#e7e5e4',
        muted: '#78716c',
        text: '#1c1917',
        accent: '#0f766e',
        warn: '#b45309',
        danger: '#b91c1c',
        success: '#15803d',
      },
    },
  },
  plugins: [],
};
