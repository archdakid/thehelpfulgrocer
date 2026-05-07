-- F11 Phase 1 — Product enrichment for scraper ingest.
--
-- Scraped products carry richer metadata than the receipt pipeline ever sees:
-- en-TT descriptions, unit-of-measure, pack-size, and a "sold by weight" flag
-- (PriceSmart sells some items at $X/lb, where the displayed price is already
-- per-UOM and "1 unit" is meaningless). The compare-sheet's killer feature —
-- "where is this cheapest right now" — is meaningfully better when we can
-- normalize $/100ml or $/100g across SKUs of different sizes, and when we
-- can render PriceSmart's case packs as "$X for case of 24 = $Y per unit".
--
-- All columns are nullable. Existing products and the receipt-driven write
-- paths stay correct without touching them. The scraper ingest function
-- populates them; admins can edit via the existing /products/[id] form.
--
-- A formal `product_equivalents` table (linking "case of 24" to "single can")
-- is deliberately deferred. With `units_per_pack` + the per-UOM columns the
-- compare-sheet can render the same comparison at display time without
-- introducing a second source of truth.

alter table public.products
  add column description text,
  add column unit_size numeric(10, 3) check (unit_size is null or unit_size > 0),
  add column unit_of_measure text check (
    unit_of_measure is null
    or unit_of_measure in ('each', 'g', 'kg', 'ml', 'L', 'oz', 'lb')
  ),
  -- True for items priced per-UOM at the register (PS produce, deli, bakery
  -- by weight). When true, the `prices.amount_minor_units` for this product
  -- means "per unit_of_measure", not "per item". UI must render accordingly
  -- (e.g. "TT$30 / lb" not "TT$30").
  add column is_sold_by_weight boolean not null default false,
  -- >1 means a case/multipack. Drives the compare-sheet's per-unit breakdown
  -- ("case of 24 = $Y each"). Null and 1 are equivalent; the explicit 1
  -- is allowed so admins can mark a SKU as confirmed-single after review.
  add column units_per_pack integer check (units_per_pack is null or units_per_pack >= 1);

-- Description gets a trigram index so the existing match_receipt_text RPC
-- can optionally widen its match candidates to descriptions, not just names.
-- Cheap to add now while the table is small.
create index products_description_trgm_idx
  on public.products using gin (lower(description) gin_trgm_ops)
  where description is not null;

comment on column public.products.unit_size is
  'Numeric size of one unit in unit_of_measure (e.g. 500 for "500ml"). Null = unknown.';
comment on column public.products.unit_of_measure is
  'Normalized UOM. NULL when unknown — UI falls back to displaying the raw name.';
comment on column public.products.is_sold_by_weight is
  'Price is per unit_of_measure (e.g. $/lb), not per item. Affects price display.';
comment on column public.products.units_per_pack is
  'Items in one purchasable pack. >1 means case/multipack; render per-unit breakdown.';
