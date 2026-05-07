-- F11 Phase 2 — Location-aware price observations.
--
-- 0019 introduced store_locations. This migration plumbs the location FK
-- through to `prices` so scraped per-branch prices can record WHICH branch
-- the observation came from. Receipts and admin manual entries continue
-- to write store-level rows (store_location_id null).
--
-- The `current_prices` view stays one-row-per-(product, store): mobile
-- renders a single row per chain on the compare-sheet today, and that
-- doesn't change here. The DISTINCT ON now picks the latest observation
-- across any location for that chain. A future per-location admin view
-- (`current_prices_by_location`) is left for when the UI needs it.

alter table public.prices
  -- Nullable: NULL means "store-level / chain-wide observation" (admin manual,
  -- receipt, circular). Non-null means "this branch specifically" (scrape).
  -- ON DELETE SET NULL: deleting a location preserves the price history as a
  -- chain-wide observation rather than vaporizing the data.
  add column store_location_id uuid references public.store_locations(id) on delete set null;

create index prices_product_store_location_idx
  on public.prices (product_id, store_id, store_location_id, observed_at desc);

comment on column public.prices.store_location_id is
  'Branch this observation came from. NULL = chain-wide (admin/receipt/circular).';

-- Refresh `current_prices` to surface store_location_id alongside the latest
-- observation. Existing consumers (mobile compare-sheet) read columns by name
-- and ignore the new field; future admin location-detail views can use it.
create or replace view public.current_prices as
  select distinct on (product_id, store_id)
    id,
    product_id,
    store_id,
    store_location_id,
    amount_minor_units,
    currency,
    source,
    observed_at,
    regular_amount_minor_units,
    sale_ends_at,
    promo_label
  from public.prices
  order by product_id, store_id, observed_at desc;
