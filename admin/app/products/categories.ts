// Mirrors migration 0004's CHECK constraint on products.category and the
// allow-list inside the manage-product / resolve-flagged-item Edge
// Functions. Lives in its own module because Next.js server-action files
// (`'use server'`) can only export async functions — re-exporting a
// constant from there breaks at the client boundary (the import resolves
// to a non-iterable proxy).
export const PRODUCT_CATEGORIES = [
  'produce',
  'dairy',
  'meat',
  'bakery',
  'pantry',
  'frozen',
  'beverage',
  'snacks',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
