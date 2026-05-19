// Twelve product categories with their tile colors. Eight grocery buckets
// match the original design/categories.jsx; four non-grocery buckets
// (household, personal_care, pharmacy, baby) were added in 0032 to cover
// the SuperPharm/Massy/PriceSmart catalogs that carry significant non-food
// inventory. Mirror in supabase/migrations/0032_expand_categories.sql and
// the CATEGORIES sets in manage-product / resolve-flagged-item.
//
// `bg` is the muted tinted backdrop (used for the 44x44 row tile and
// category header surfaces). `fg` is the foreground color used for text
// and the glyph.

export type CategoryId =
  | 'produce'
  | 'dairy'
  | 'meat'
  | 'bakery'
  | 'pantry'
  | 'frozen'
  | 'beverage'
  | 'snacks'
  | 'household'
  | 'personal_care'
  | 'pharmacy'
  | 'baby';

type CategoryColors = { bg: string; fg: string };

export const categoryColors: Record<CategoryId, CategoryColors> = {
  produce:       { bg: '#E4EFE0', fg: '#3F6B33' },
  dairy:         { bg: '#E1ECF4', fg: '#2D5C82' },
  meat:          { bg: '#F2DEDB', fg: '#92352F' },
  bakery:        { bg: '#F6E5C9', fg: '#8A5A1E' },
  pantry:        { bg: '#EFD9CC', fg: '#8A4827' },
  frozen:        { bg: '#E2ECEF', fg: '#3D6975' },
  beverage:      { bg: '#E5DDEC', fg: '#5C447A' },
  snacks:        { bg: '#F6E5C9', fg: '#8A5A1E' },
  household:     { bg: '#DCEFEC', fg: '#2D6B5C' },
  personal_care: { bg: '#F4DEE5', fg: '#8C3F58' },
  pharmacy:      { bg: '#DDEDE0', fg: '#2F6B47' },
  baby:          { bg: '#F4E4D0', fg: '#8E5F2A' },
};

const VALID_IDS: ReadonlySet<string> = new Set(Object.keys(categoryColors));

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && VALID_IDS.has(value);
}

// Fallback when a product has no category set or an unrecognized value.
export const DEFAULT_CATEGORY: CategoryId = 'pantry';

export const categoryNames: Record<CategoryId, string> = {
  produce:       'Produce',
  dairy:         'Dairy & eggs',
  meat:          'Meat & fish',
  bakery:        'Bakery',
  pantry:        'Pantry',
  frozen:        'Frozen',
  beverage:      'Beverages',
  snacks:        'Snacks',
  household:     'Household',
  personal_care: 'Personal care',
  pharmacy:      'Pharmacy',
  baby:          'Baby',
};

// Display order for the Browse tab grid. Groceries first (the historic 8),
// then non-grocery buckets — they're additive and shouldn't reshuffle the
// grocery rows users have already memorized.
export const CATEGORY_DISPLAY_ORDER: readonly CategoryId[] = [
  'produce',
  'dairy',
  'meat',
  'bakery',
  'pantry',
  'frozen',
  'beverage',
  'snacks',
  'household',
  'personal_care',
  'pharmacy',
  'baby',
];
