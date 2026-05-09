-- F11 Phase 2 — Cross-vendor product identity matching.
--
-- Caribbean retailers don't expose UPCs (DECISIONS.md 2026-05-09), so the
-- existing UPC-then-vendor-alias tier in `ingest-scrape` always fell through
-- to "insert new product". Result: Massy's "Pepsi Cola 2 L" and SuperPharm's
-- "Pepsi 2L" land as separate `products` rows, breaking the cross-store
-- comparison the app's killer feature depends on.
--
-- This migration adds the trigram-based matching tier:
--
--   1. New RPC `match_existing_product(name, brand, unit_size, uom, exclude)`
--      returns the top 5 candidates ranked by similarity over
--      `lower(brand || ' ' || name)`, plus boolean flags for `same_brand`
--      and `same_size`. The Edge Function applies the auto-link / flag
--      / insert-new decision policy on top.
--
--   2. `flagged_items` is extended to admit ingest-origin rows: receipt_item
--      becomes nullable, a new `flagged_product_id` (the new product the
--      matcher is unsure about) and `candidate_product_id` (the existing
--      product it might be a duplicate of) are added, and the reason enum
--      gains `'potential_duplicate'`.
--
-- The 0.85 / 0.70-with-brand-and-size thresholds were calibrated against
-- real cross-vendor name pairs in the SP/Massy/PS dumps; see the
-- accompanying DECISIONS entry. Pack-variant pairs (PS "Pepsi Cola 24 Units
-- / 500 mL" vs Massy "Pepsi 500 Ml") are intentionally NOT handled here —
-- the matcher flags them at medium confidence so admin can either reject
-- them or, post product_equivalents, link them as pack variants instead of
-- merging.

-- =============================================================================
-- Trigram index on combined brand + name. The 0009 index on lower(name) was
-- adequate for receipt OCR text but loses the brand signal which is the
-- single strongest cross-vendor identity discriminator (e.g. "Heinz 397g"
-- vs "Hunt's 397g" share a name structure but are different products).
-- =============================================================================

create index if not exists products_brand_name_trgm_idx
  on public.products
  using gin (lower(coalesce(brand, '') || ' ' || name) gin_trgm_ops);

-- =============================================================================
-- match_existing_product(name, brand, unit_size, uom, exclude_id)
--
-- Returns top 5 candidates ranked by trigram similarity, with flags the
-- caller uses to drive the auto-link policy:
--   - similarity:   trigram score in [0, 1] over lower(brand || ' ' || name)
--   - same_brand:   true when both products have brand AND lowercase equal
--                   (also true when caller passes null brand — caller has
--                   no brand info to discriminate by)
--   - same_size:    true when both have unit_size + unit_of_measure AND
--                   they agree (also true when caller passes null size —
--                   skips the size constraint when not supplied)
--
-- 0.30 floor is pg_trgm's default `%` operator threshold; below that the
-- index doesn't even consider the strings similar. The Edge Function uses
-- 0.50 as its lowest gate for queueing.
-- =============================================================================

create or replace function public.match_existing_product(
  p_name text,
  p_brand text default null,
  p_unit_size numeric default null,
  p_unit_of_measure text default null,
  p_exclude_id uuid default null
)
returns table (
  product_id uuid,
  candidate_name text,
  candidate_brand text,
  similarity numeric,
  same_brand boolean,
  same_size boolean
)
language sql
stable
as $$
  with q as (
    select
      lower(trim(coalesce(p_brand, '') || ' ' || p_name)) as needle,
      lower(nullif(trim(coalesce(p_brand, '')), '')) as brand_lower,
      p_unit_size as size_in,
      lower(nullif(trim(coalesce(p_unit_of_measure, '')), '')) as uom_in
  )
  select
    p.id as product_id,
    p.name as candidate_name,
    p.brand as candidate_brand,
    round(
      similarity(
        lower(coalesce(p.brand, '') || ' ' || p.name),
        q.needle
      )::numeric,
      3
    ) as similarity,
    -- "Same brand" if either the caller has no brand info, or the candidate's
    -- brand matches case-insensitively. Both-null is permissive (we can't
    -- prove they differ).
    (
      q.brand_lower is null
      or lower(p.brand) = q.brand_lower
    ) as same_brand,
    -- "Same size" if either the caller has no size info, or the candidate's
    -- size matches exactly. Strict on size: "Heinz 397g" ≠ "Heinz 500g".
    (
      q.size_in is null or q.uom_in is null
      or (p.unit_size = q.size_in and lower(p.unit_of_measure) = q.uom_in)
    ) as same_size
  from public.products p, q
  where (p_exclude_id is null or p.id <> p_exclude_id)
    and q.needle <> ''
    and lower(coalesce(p.brand, '') || ' ' || p.name) % q.needle
  order by similarity(
    lower(coalesce(p.brand, '') || ' ' || p.name),
    q.needle
  ) desc
  limit 5;
$$;

grant execute on function public.match_existing_product(text, text, numeric, text, uuid)
  to anon, authenticated, service_role;

-- =============================================================================
-- flagged_items: admit ingest-origin rows
--
-- Existing receipt-origin schema:
--   - receipt_item_id NOT NULL, cascade
--   - reason in ('unmatched', 'low_confidence', 'auto_created_product')
--   - auto_created_product_id (the system-created product to verify)
--   - unique (receipt_item_id, reason)
--
-- Ingest-origin rows have no receipt context. They reference:
--   - flagged_product_id: the just-inserted product needing review
--   - candidate_product_id: the existing product the matcher thinks it
--     might be a duplicate of
-- =============================================================================

alter table public.flagged_items
  alter column receipt_item_id drop not null;

alter table public.flagged_items
  drop constraint flagged_items_reason_check;
alter table public.flagged_items
  add constraint flagged_items_reason_check
  check (reason in (
    'unmatched',
    'low_confidence',
    'auto_created_product',
    'potential_duplicate'
  ));

-- ON DELETE SET NULL on flagged_product_id (not cascade): when a merge
-- removes the flagged product, the audit row should survive — repoint at
-- the winner via the merge function rather than losing the audit trail.
alter table public.flagged_items
  add column flagged_product_id uuid references public.products(id) on delete set null,
  add column candidate_product_id uuid references public.products(id) on delete set null,
  -- Captured score (0.500 to 0.999) at the time the row was filed. Useful
  -- for sorting the admin queue ("show me the highest-confidence dupes
  -- first") and for tuning the auto-link threshold over time.
  add column match_score numeric(4, 3);

-- One queue entry per (flagged_product, candidate, reason) for ingest-origin
-- rows. Partial — receipt-origin rows still rely on the existing
-- (receipt_item_id, reason) unique constraint.
create unique index flagged_items_ingest_unique
  on public.flagged_items (flagged_product_id, candidate_product_id, reason)
  where receipt_item_id is null;

create index flagged_items_flagged_product_idx
  on public.flagged_items (flagged_product_id)
  where flagged_product_id is not null;

create index flagged_items_candidate_idx
  on public.flagged_items (candidate_product_id)
  where candidate_product_id is not null;

-- Admin dashboard "show me the highest-confidence dupes first" view.
create index flagged_items_potential_dup_score_idx
  on public.flagged_items (match_score desc, created_at desc)
  where reason = 'potential_duplicate' and resolved_at is null;

-- Constraint enforcement: receipt-origin rows must have receipt_item_id;
-- ingest-origin rows must have flagged_product_id (and shouldn't have a
-- receipt_item). Belt-and-suspenders against bad inserts since the column
-- nullability alone allows hybrid rows that don't make sense.
alter table public.flagged_items
  add constraint flagged_items_origin_check
  check (
    (receipt_item_id is not null and flagged_product_id is null)
    or (receipt_item_id is null and flagged_product_id is not null)
  );

comment on column public.flagged_items.flagged_product_id is
  'For ingest-origin rows: the just-inserted product the matcher is unsure about. Cascades on delete.';
comment on column public.flagged_items.candidate_product_id is
  'For potential_duplicate rows: the existing product the matcher thinks `flagged_product_id` may be a duplicate of.';
comment on column public.flagged_items.match_score is
  'Trigram similarity (0.500–0.999) captured at flag time. Used for queue prioritization and threshold tuning.';

-- =============================================================================
-- merge_products(loser_id, winner_id)
--
-- Atomically merges `loser_id` into `winner_id`: every prices row,
-- product_alias, product_store_availability row, and product_store_category
-- row that referenced the loser is moved onto the winner (with conflict-do-
-- nothing semantics for the three uniquely-keyed tables), then the loser
-- product is deleted. Single transaction — partial-failure leaves the
-- catalog in a coherent state.
--
-- Used by the resolve-flagged-item Edge Function for the merge_duplicate
-- action. Service-role only (no GRANT to anon/authenticated). DEFINER so
-- it can write to tables the calling user wouldn't normally have access to,
-- though in practice the only callers run with service-role anyway.
-- =============================================================================

create or replace function public.merge_products(
  p_loser_id uuid,
  p_winner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loser products%rowtype;
  v_winner products%rowtype;
begin
  if p_loser_id = p_winner_id then
    raise exception 'merge_products: loser and winner are the same product';
  end if;

  select * into v_loser from public.products where id = p_loser_id;
  if not found then raise exception 'merge_products: loser product % not found', p_loser_id; end if;
  select * into v_winner from public.products where id = p_winner_id;
  if not found then raise exception 'merge_products: winner product % not found', p_winner_id; end if;

  -- prices: append-only history, no unique constraint to dodge. Just
  -- repoint product_id. Sale columns / receipt_item_id / store_location_id
  -- come along untouched.
  update public.prices set product_id = p_winner_id where product_id = p_loser_id;

  -- product_aliases: unique (product_id, alias). Move loser's aliases to
  -- winner where the winner doesn't already have them. Drop the rest.
  insert into public.product_aliases (product_id, alias, source, created_at)
  select p_winner_id, alias, source, created_at
  from public.product_aliases
  where product_id = p_loser_id
  on conflict (product_id, alias) do nothing;
  delete from public.product_aliases where product_id = p_loser_id;

  -- product_store_availability: unique (product_id, store_id,
  -- store_location_id) NULLS NOT DISTINCT. Loser's rows merge in where
  -- winner has no entry for that (store, location); duplicates drop.
  insert into public.product_store_availability (
    product_id, store_id, store_location_id, is_available, updated_at, updated_by
  )
  select p_winner_id, store_id, store_location_id, is_available, updated_at, updated_by
  from public.product_store_availability
  where product_id = p_loser_id
  on conflict (product_id, store_id, store_location_id) do nothing;
  delete from public.product_store_availability where product_id = p_loser_id;

  -- product_store_categories: unique (product_id, store_id, vendor_path).
  -- Same pattern.
  insert into public.product_store_categories (
    product_id, store_id, vendor_path, vendor_path_root, source, first_seen_at, last_seen_at
  )
  select p_winner_id, store_id, vendor_path, vendor_path_root, source, first_seen_at, last_seen_at
  from public.product_store_categories
  where product_id = p_loser_id
  on conflict (product_id, store_id, vendor_path) do nothing;
  delete from public.product_store_categories where product_id = p_loser_id;

  -- receipt_items.matched_product_id: ON DELETE SET NULL FK. Repoint
  -- explicitly so the audit trail follows the merge instead of getting
  -- nulled out.
  update public.receipt_items
    set matched_product_id = p_winner_id
    where matched_product_id = p_loser_id;

  -- flagged_items: both FKs to products are ON DELETE SET NULL so audit
  -- rows survive the merge. Repoint subjects (flagged_product_id) and
  -- candidates (candidate_product_id) at the winner instead of letting
  -- them get nulled. This lets a future "show me the merge history of
  -- product X" query trace the lineage.
  update public.flagged_items
    set flagged_product_id = p_winner_id
    where flagged_product_id = p_loser_id;
  update public.flagged_items
    set candidate_product_id = p_winner_id
    where candidate_product_id = p_loser_id;

  -- Finally, drop the loser. Anything still referencing it cascades or
  -- gets nulled per the existing FK rules; we explicitly handled the
  -- columns that should follow rather than vanish.
  delete from public.products where id = p_loser_id;
end;
$$;

revoke all on function public.merge_products(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_products(uuid, uuid) to service_role;
