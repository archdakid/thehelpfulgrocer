-- Expand the products.category check constraint with non-grocery buckets.
--
-- The original 8 categories (0004) cover groceries proper but leave a wide
-- swath of the catalog uncategorized — SuperPharm and Massy carry a
-- significant amount of household cleaning, personal care, OTC pharmacy,
-- and baby/infant supplies that today fall to either NULL or get crammed
-- into 'pantry'. With the multi-store filter (mobile-side) consolidating
-- categories under Cheapest mode, these need first-class buckets so the
-- Browse grid and the post-tap product list make sense across vendors.
--
-- Mobile mirror: mobile/constants/categories.ts must be updated alongside
-- this migration. Edge Function mirrors: supabase/functions/manage-product
-- and supabase/functions/resolve-flagged-item both carry a CATEGORIES Set
-- that gates admin edits — both updated in the same change.

alter table public.products
  drop constraint products_category_check;

alter table public.products
  add constraint products_category_check
  check (
    category is null or category in (
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
      'baby'
    )
  );
