// Eight product categories with their tile colors per design/categories.jsx.
// `bg` is the muted tinted backdrop (used for the 44x44 row tile and category
// header surfaces). `fg` is the foreground color used for text and the glyph.

export type CategoryId =
  | 'produce'
  | 'dairy'
  | 'meat'
  | 'bakery'
  | 'pantry'
  | 'frozen'
  | 'beverage'
  | 'snacks';

type CategoryColors = { bg: string; fg: string };

export const categoryColors: Record<CategoryId, CategoryColors> = {
  produce:  { bg: '#E4EFE0', fg: '#3F6B33' },
  dairy:    { bg: '#E1ECF4', fg: '#2D5C82' },
  meat:     { bg: '#F2DEDB', fg: '#92352F' },
  bakery:   { bg: '#F6E5C9', fg: '#8A5A1E' },
  pantry:   { bg: '#EFD9CC', fg: '#8A4827' },
  frozen:   { bg: '#E2ECEF', fg: '#3D6975' },
  beverage: { bg: '#E5DDEC', fg: '#5C447A' },
  snacks:   { bg: '#F6E5C9', fg: '#8A5A1E' },
};

const VALID_IDS: ReadonlySet<string> = new Set(Object.keys(categoryColors));

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && VALID_IDS.has(value);
}

// Fallback when a product has no category set or an unrecognized value.
export const DEFAULT_CATEGORY: CategoryId = 'pantry';

export const categoryNames: Record<CategoryId, string> = {
  produce:  'Produce',
  dairy:    'Dairy & eggs',
  meat:     'Meat & fish',
  bakery:   'Bakery',
  pantry:   'Pantry',
  frozen:   'Frozen',
  beverage: 'Beverages',
  snacks:   'Snacks',
};

// Display order for the Browse tab grid. Matches design/browse-grid.jsx.
export const CATEGORY_DISPLAY_ORDER: readonly CategoryId[] = [
  'produce',
  'dairy',
  'meat',
  'bakery',
  'pantry',
  'frozen',
  'beverage',
  'snacks',
];
