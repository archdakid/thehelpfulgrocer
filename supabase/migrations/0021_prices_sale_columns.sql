-- F11 Phase 1 — Sale / promo data on price observations.
--
-- A "sale" is a property of a SNAPSHOT IN TIME, not of a product — the same
-- bottle of ketchup can be on sale Tuesday and back to regular Wednesday.
-- The append-only `prices` table is already shaped that way (one row per
-- observation), so sale data belongs here, not on `products` and not in a
-- side table.
--
-- Source coverage at time of writing:
--   - PriceSmart: exposes `original_price_without_saving`, `saving_amount`,
--     `saving_expiration_date`, and a free-text `promo_label` per club.
--     Will populate all four columns when the scraper sees a non-zero saving.
--   - SuperPharm: API returns current price only — no sale signal. Columns
--     stay null for SP rows. (Inferring a sale from price-history dips is
--     possible later as a view; no schema cost.)
--   - Receipts: receipts don't carry sale state. Columns stay null.
--   - Circulars: future work. Circular prices ARE the sale price; we'll
--     populate `sale_ends_at` from the circular's `observed_week + 7d` and
--     `promo_label` from the parsed banner copy.
--
-- "Is this on sale?" is derived, not stored:
--     regular_amount_minor_units IS NOT NULL
--     AND regular_amount_minor_units > amount_minor_units
-- That keeps a single source of truth and avoids a second column going stale.

alter table public.prices
  -- The "was" price the sale is discounting from. Null when unknown.
  add column regular_amount_minor_units integer
    check (regular_amount_minor_units is null or regular_amount_minor_units >= 0),
  -- When the sale lapses. Null when unknown or open-ended.
  add column sale_ends_at timestamptz,
  -- Vendor-supplied promo copy ("Buy 1 Get 1", "Member's Selection Sale",
  -- "Free Delivery"). Free-text, vendor language preserved. Doubles as the
  -- slot for future paid-placement / marketing labels.
  add column promo_label text;

comment on column public.prices.regular_amount_minor_units is
  'The pre-sale price this observation discounts from. NULL = no sale or unknown.';
comment on column public.prices.sale_ends_at is
  'When the sale lapses. NULL = unknown / open-ended.';
comment on column public.prices.promo_label is
  'Vendor-supplied promo text. Free-form; preserved verbatim from source.';

-- Refresh `current_prices` so mobile reads pick up the new columns. The view
-- is a thin SELECT, so a CREATE OR REPLACE is enough — no consumers break.
create or replace view public.current_prices as
  select distinct on (product_id, store_id)
    id,
    product_id,
    store_id,
    amount_minor_units,
    currency,
    source,
    observed_at,
    regular_amount_minor_units,
    sale_ends_at,
    promo_label
  from public.prices
  order by product_id, store_id, observed_at desc;
