/* global React */
// SmartShopper categories — color tints per DESIGN_SYSTEM
const CAT_COLORS = {
  produce:   { bg: '#E4EFE0', fg: '#3F6B33' },
  dairy:     { bg: '#E1ECF4', fg: '#2D5C82' },
  meat:      { bg: '#F2DEDB', fg: '#92352F' },
  bakery:    { bg: '#F6E5C9', fg: '#8A5A1E' },
  pantry:    { bg: '#EFD9CC', fg: '#8A4827' },
  frozen:    { bg: '#E2ECEF', fg: '#3D6975' },
  beverage:  { bg: '#E5DDEC', fg: '#5C447A' },
  snacks:    { bg: '#F6E5C9', fg: '#8A5A1E' },
};

// simple SVG glyph per category, kept abstract
const CatGlyph = ({ kind, color }) => {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (kind) {
    case 'produce':
      return (<svg {...p}><path d="M12 6c0-2 1.5-3.5 3.5-3.5C15.5 4.5 14 6 12 6z"/><path d="M7 10c-2 1.5-3 4.5-2 7.5s4 4.5 7 4 5-3 4.5-6.5S12 9 7 10z"/></svg>);
    case 'dairy':
      return (<svg {...p}><path d="M8 3h8v3l1.5 3v11a1 1 0 0 1-1 1H7.5a1 1 0 0 1-1-1V9L8 6V3z"/><path d="M8 3v3h8V3"/></svg>);
    case 'meat':
      return (<svg {...p}><path d="M5 13c-1-3 1-6 4-7s7 0 8.5 3-.5 7-3.5 8.5-7 0-9-4.5z"/><circle cx="9" cy="11" r="1.2" fill={color} stroke="none"/></svg>);
    case 'bakery':
      return (<svg {...p}><path d="M5 14c-1-3 0-6 3-7s7 0 8 3-1 6-4 7-6 0-7-3z"/><path d="M9 9c1 1 2 2 2 4M13 8c1 1 2 3 1 5"/></svg>);
    case 'pantry':
      return (<svg {...p}><path d="M9 4h6l1 6v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8l1-6z"/><path d="M9 11h6"/></svg>);
    case 'frozen':
      return (<svg {...p}><path d="M12 3v18M3 12h18M5 5l14 14M19 5L5 19"/></svg>);
    case 'beverage':
      return (<svg {...p}><path d="M7 7h10l-1 12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2L7 7z"/><path d="M9 4h6v3H9z"/></svg>);
    case 'snacks':
      return (<svg {...p}><circle cx="12" cy="12" r="8"/><circle cx="9" cy="10" r="0.9" fill={color} stroke="none"/><circle cx="14" cy="9" r="0.9" fill={color} stroke="none"/><circle cx="15" cy="14" r="0.9" fill={color} stroke="none"/><circle cx="10" cy="15" r="0.9" fill={color} stroke="none"/></svg>);
    default: return null;
  }
};

Object.assign(window, { CAT_COLORS, CatGlyph });
