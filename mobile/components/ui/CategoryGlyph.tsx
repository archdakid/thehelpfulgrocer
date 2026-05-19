import Svg, { Circle, Path } from 'react-native-svg';

import { categoryColors, type CategoryId } from '@/constants/categories';

type CategoryGlyphProps = {
  category: CategoryId;
  size?: number;
  color?: string;
};

// Abstract glyphs ported from design/categories.jsx — single-stroke, no fills,
// 1.8px stroke. The category color is used as the stroke; surrounding tile
// supplies the bg.
export default function CategoryGlyph({ category, size = 22, color }: CategoryGlyphProps) {
  const stroke = color ?? categoryColors[category].fg;
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (category) {
    case 'produce':
      return (
        <Svg {...props}>
          <Path d="M12 6c0-2 1.5-3.5 3.5-3.5C15.5 4.5 14 6 12 6z" />
          <Path d="M7 10c-2 1.5-3 4.5-2 7.5s4 4.5 7 4 5-3 4.5-6.5S12 9 7 10z" />
        </Svg>
      );
    case 'dairy':
      return (
        <Svg {...props}>
          <Path d="M8 3h8v3l1.5 3v11a1 1 0 0 1-1 1H7.5a1 1 0 0 1-1-1V9L8 6V3z" />
          <Path d="M8 3v3h8V3" />
        </Svg>
      );
    case 'meat':
      return (
        <Svg {...props}>
          <Path d="M5 13c-1-3 1-6 4-7s7 0 8.5 3-.5 7-3.5 8.5-7 0-9-4.5z" />
          <Circle cx="9" cy="11" r="1.2" fill={stroke} stroke="none" />
        </Svg>
      );
    case 'bakery':
      return (
        <Svg {...props}>
          <Path d="M5 14c-1-3 0-6 3-7s7 0 8 3-1 6-4 7-6 0-7-3z" />
          <Path d="M9 9c1 1 2 2 2 4M13 8c1 1 2 3 1 5" />
        </Svg>
      );
    case 'pantry':
      return (
        <Svg {...props}>
          <Path d="M9 4h6l1 6v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8l1-6z" />
          <Path d="M9 11h6" />
        </Svg>
      );
    case 'frozen':
      return (
        <Svg {...props}>
          <Path d="M12 3v18M3 12h18M5 5l14 14M19 5L5 19" />
        </Svg>
      );
    case 'beverage':
      return (
        <Svg {...props}>
          <Path d="M7 7h10l-1 12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2L7 7z" />
          <Path d="M9 4h6v3H9z" />
        </Svg>
      );
    case 'snacks':
      return (
        <Svg {...props}>
          <Circle cx="12" cy="12" r="8" />
          <Circle cx="9" cy="10" r="0.9" fill={stroke} stroke="none" />
          <Circle cx="14" cy="9" r="0.9" fill={stroke} stroke="none" />
          <Circle cx="15" cy="14" r="0.9" fill={stroke} stroke="none" />
          <Circle cx="10" cy="15" r="0.9" fill={stroke} stroke="none" />
        </Svg>
      );
    case 'household':
      // Spray bottle: bottle body + trigger neck.
      return (
        <Svg {...props}>
          <Path d="M9 10h6v9a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-9z" />
          <Path d="M9 10V7h4l1 3" />
          <Path d="M14 7l3-1.5v3.5" />
        </Svg>
      );
    case 'personal_care':
      // Tube/bottle with a flat cap and a fill-line.
      return (
        <Svg {...props}>
          <Path d="M10 4h4v2l1 1.5V19a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V7.5L10 6V4z" />
          <Path d="M10 11.5h4" />
        </Svg>
      );
    case 'pharmacy':
      // Capsule: rounded rectangle split down the middle.
      return (
        <Svg {...props}>
          <Path d="M5.5 12a3.5 3.5 0 0 1 3.5-3.5h6a3.5 3.5 0 0 1 0 7H9a3.5 3.5 0 0 1-3.5-3.5z" />
          <Path d="M12 8.5v7" />
        </Svg>
      );
    case 'baby':
      // Bottle with nipple, neck, and contents line.
      return (
        <Svg {...props}>
          <Path d="M11 3.5h2v2c1 0 1.5 1 1.5 1.5v2h-5V7c0-.5.5-1.5 1.5-1.5v-2z" />
          <Path d="M9.5 9h5v9a2.5 2.5 0 0 1-2.5 2.5A2.5 2.5 0 0 1 9.5 18V9z" />
          <Path d="M9.5 13h5" />
        </Svg>
      );
  }
}
