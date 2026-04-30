export const colors = {
  brand: {
    primary: { light: '#0F6E56', dark: '#5DCAA5' },
    primaryFg: { light: '#FFFFFF', dark: '#04342C' },
    accent: { light: '#EF9F27', dark: '#FAC775' },
  },
  bg: {
    canvas: { light: '#FAFAF7', dark: '#0F0F0E' },
    surface: { light: '#FFFFFF', dark: '#1A1A18' },
    muted: { light: '#F1EFE8', dark: '#2C2C2A' },
    scrim: { light: 'rgba(0,0,0,0.5)', dark: 'rgba(0,0,0,0.7)' },
  },
  text: {
    primary: { light: '#1A1A18', dark: '#F5F5F0' },
    secondary: { light: '#5F5E5A', dark: '#B4B2A9' },
    tertiary: { light: '#888780', dark: '#888780' },
    inverse: { light: '#FFFFFF', dark: '#0F0F0E' },
  },
  semantic: {
    success: { light: '#0F6E56', dark: '#5DCAA5' },
    warning: { light: '#BA7517', dark: '#EF9F27' },
    danger: { light: '#A32D2D', dark: '#E24B4A' },
    info: { light: '#185FA5', dark: '#85B7EB' },
  },
  border: {
    default: { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.10)' },
    strong: { light: 'rgba(0,0,0,0.16)', dark: 'rgba(255,255,255,0.20)' },
  },
} as const;
