-- F11 Phase 2 — Cross-store pack-variant equivalence.
--
-- Companion to 0026's identity matcher. The matcher handles "same physical
-- item across stores" (Massy "Pepsi 2L" ↔ SuperPharm "Pepsi Cola 2 L").
-- Pack variants — Massy single can vs PriceSmart case-of-24 of the same can —
-- are intentionally NOT merged: each pack size is its own products row with
-- its own `units_per_pack` (per DECISIONS.md 2026-05-05). They're linked by
-- this table instead, so the compare-sheet can render
-- "in stock at PriceSmart, $4.58/can in case of 24" alongside Massy's single.
--
-- Per DECISIONS.md 2026-05-09, the LLM triage in `triage-duplicates` picks
-- among four outcomes for every flagged potential_duplicate pair:
--   - same_product → merge_products() (existing path from 0026)
--   - pack_variant → insert here (new path)
--   - different    → resolve flag with 'rejected'
--   - uncertain    → leave the flag for admin
--
-- Edges are directional: `(product_id, equivalent_product_id, scale_factor)`
-- means "one unit of product_id contains scale_factor units of
-- equivalent_product_id" — i.e. product_id is the bigger pack, scale_factor
-- is how many of equivalent_product_id are in it. So per-unit price for the
-- bigger pack = `prices.amount / scale_factor`.
--
-- Convention enforced by check constraint: scale_factor > 1, which means we
-- always store the larger-pack → smaller-pack direction. Reads at compare
-- time UNION the inverse. Single source of truth, no risk of asymmetric
-- data drifting apart.

-- =============================================================================
-- product_equivalents
-- =============================================================================

create table public.product_equivalents (
  id uuid primary key default gen_random_uuid(),
  -- Larger-pack side. Pricing for THIS product divided by scale_factor gives
  -- the per-equivalent-unit price.
  product_id uuid not null references public.products(id) on delete cascade,
  -- Smaller-unit side (single can, single bottle, etc.).
  equivalent_product_id uuid not null references public.products(id) on delete cascade,
  -- How many `equivalent_product_id` units make up one `product_id`.
  -- E.g. case-of-24 (product_id) of single cans (equivalent_product_id) → 24.
  -- numeric(10, 3) so non-integer ratios are allowed (rare but real:
  -- "1 kg bag" ↔ "100 g pack" → 10).
  scale_factor numeric(10, 3) not null check (scale_factor > 1),
  -- Where this row came from. Mirrors the convention on product_aliases.source.
  source text not null check (source in ('admin', 'triage_llm')),
  -- LLM rationale or admin note. The triage function dumps a short
  -- explanation here so admin spot-checks have context without re-running
  -- the model.
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Same-product self-edges are nonsensical.
  check (product_id <> equivalent_product_id),
  -- One edge per ordered pair. Application convention: writers pick the
  -- direction such that scale_factor > 1 (already enforced above).
  unique (product_id, equivalent_product_id)
);

-- Compare-sheet hot path: "given a product, find its variants." Both
-- direction lookups are indexable.
create index product_equivalents_product_idx
  on public.product_equivalents (product_id);
create index product_equivalents_equivalent_idx
  on public.product_equivalents (equivalent_product_id);

create trigger product_equivalents_set_updated_at
  before update on public.product_equivalents
  for each row execute function public.set_updated_at();

comment on table public.product_equivalents is
  'Cross-pack-size equivalence edges. Directional: product_id is the larger pack, equivalent_product_id is the unit; scale_factor is the multiplier between them.';
comment on column public.product_equivalents.scale_factor is
  'Units of equivalent_product_id per one product_id. Per-unit price for product_id = price / scale_factor.';
comment on column public.product_equivalents.source is
  'admin = manual curation; triage_llm = inserted by triage-duplicates Edge Function.';

-- =============================================================================
-- RLS — public read (compare-sheet uses it), service-role write
-- =============================================================================

alter table public.product_equivalents enable row level security;

create policy "Anyone reads product equivalents"
  on public.product_equivalents for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policies for anon/authenticated. The triage Edge
-- Function and admin Edge Functions both run as service_role, which bypasses
-- RLS. Default deny stays in force for everyone else.

revoke all on public.product_equivalents from anon, authenticated;
grant select on public.product_equivalents to anon, authenticated;
-- service_role grants land via the default-privileges rule from migration 0012.

-- =============================================================================
-- Extend flagged_items.resolution to admit 'pack_variant'
--
-- The triage function records its decision here when it inserts a
-- product_equivalents row: instead of merging the two products, it links
-- them as pack variants and resolves the flag with this new value. Admin
-- can later filter the queue by resolution to spot-check LLM decisions.
-- =============================================================================

alter table public.flagged_items
  drop constraint flagged_items_resolution_check;

-- The `resolution text check (...)` was an inline column constraint in 0010,
-- so dropping it by default name works in Postgres. Re-add as a named
-- constraint going forward.
alter table public.flagged_items
  add constraint flagged_items_resolution_check
  check (resolution in (
    'confirmed',
    'corrected',
    'rejected',
    'merged',
    'pack_variant'
  ));

comment on column public.flagged_items.resolution is
  'Resolution outcome. pack_variant is set when triage links the pair via product_equivalents instead of merging.';
