-- Add a free-text `category` column to products. Nullable for now — products
-- ingested via OFF won't always carry a category, and we shouldn't reject the
-- row on that basis. The mobile app falls back to a default category when
-- this is null or unrecognized.
--
-- Constrained to the eight known categories so typos can't sneak into the
-- catalog. New categories require both a migration here and an addition to
-- mobile/constants/categories.ts.

alter table public.products
  add column category text check (
    category is null or category in (
      'produce', 'dairy', 'meat', 'bakery',
      'pantry', 'frozen', 'beverage', 'snacks'
    )
  );

create index products_category_idx on public.products (category);

-- Backfill the ten seeded products. Migrations run exactly once, so this is
-- the reliable place to set categories on existing rows. The seed file also
-- sets categories for fresh databases; that block uses an upsert so the two
-- paths agree.
update public.products set category = 'snacks'   where upc = '7622210449283';
update public.products set category = 'beverage' where upc = '012000161155';
update public.products set category = 'snacks'   where upc = '028400157810';
update public.products set category = 'pantry'   where upc = '041196910759';
update public.products set category = 'pantry'   where upc = '024000162216';
update public.products set category = 'pantry'   where upc = '051000012517';
update public.products set category = 'beverage' where upc = '054500001234';
update public.products set category = 'beverage' where upc = '086600000174';
update public.products set category = 'pantry'   where upc = 'INTERNAL-RICE-1KG';
update public.products set category = 'pantry'   where upc = 'INTERNAL-FLOUR-2KG';
