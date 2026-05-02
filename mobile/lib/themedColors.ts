import { useColorScheme } from 'react-native';

import { colors } from '@/constants/colors';

// Resolves the current color scheme into concrete RGB values from
// constants/colors.ts. Use this when a literal color prop is required —
// most commonly Lucide icons, animated style values, or anything that can't
// take a NativeWind className. CSS-variable-backed Tailwind classes
// (text-primary, bg-canvas, etc.) handle dark mode automatically; reach for
// this hook only when you can't.

type Scheme = 'light' | 'dark';

export function useThemedColors() {
  const scheme: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return {
    text: {
      primary: colors.text.primary[scheme],
      secondary: colors.text.secondary[scheme],
      tertiary: colors.text.tertiary[scheme],
      inverse: colors.text.inverse[scheme],
    },
    brand: {
      primary: colors.brand.primary[scheme],
      primaryFg: colors.brand.primaryFg[scheme],
      accent: colors.brand.accent[scheme],
    },
    bg: {
      canvas: colors.bg.canvas[scheme],
      surface: colors.bg.surface[scheme],
      muted: colors.bg.muted[scheme],
    },
    semantic: {
      success: colors.semantic.success[scheme],
      warning: colors.semantic.warning[scheme],
      danger: colors.semantic.danger[scheme],
      info: colors.semantic.info[scheme],
    },
  };
}
