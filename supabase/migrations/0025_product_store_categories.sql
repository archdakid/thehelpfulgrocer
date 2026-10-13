-- F11 Phase 2 — Per-store vendor categories.
--
-- Today `products.category` is a single 8-bucket global enum ('produce',
-- 'dairy', 'meat', 'bakery', 'pantry', 'frozen', 'beverage', 'snacks').
-- That's the right shape for the cross-store Browse grid users see today.
-- It's the wrong shape for what scrapers actually return:
--
--   - Massy publishes a ~1000-node tree where one product can sit in
--     multiple categories at once (e.g. "Beverages › Soft Drinks › Cola"
--     AND "On Sale › This Week").
--   - PriceSmart has its own warehouse-club taxonomy.
--   - SuperPharm has a third.
--
-- Flattening all of that into eight buckets throws away most of the value.
-- This migration adds a join table that preserves each retailer's native
-- taxonomy verbatim; the global `products.category` stays as the cross-
-- store / search-canonical dimension and is left untouched.
--
-- The Browse "By store" toggle reads from this table to render per-retailer
-- top-level tiles and drill-downs. Receipts and admin manual entry don't
-- write here — only the scraper ingest pipeline (and admin curation, if
-- ever needed). Absence of rows for a (product, store) means "we haven't
-- seen this product at this store from a categorized source," which is
-- accurate.

create table public.product_store_categories (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,

  -- Full vendor path, joined verbatim by the runner with a single
  -- separator (' › '). Free-text by design — every retailer has a different
  -- taxonomy and we don't want a CHECK constraint that forces normalization.
  -- Example: "Beverages › Soft Drinks › Cola" or "Member's Selection › Bulk".
  vendor_path text not null
    check (length(vendor_path) between 1 and 500),

  -- The first segment of vendor_path. Drives the Browse "By store" tile grid
  -- and per-store category pills without forcing a substring/split_part on
  -- every read. Populated by the runner so it stays consistent with whatever
  -- separator convention vendor_path uses (separator changes don't require a
  -- migration / backfill).
  vendor_path_root text not null
    check (length(vendor_path_root) between 1 and 200),

  source text not null default 'scrape'
    check (source in ('scrape', 'admin')),

  -- Tracks first/last time we saw this (product, store, path) tuple so
  -- admins can spot stale assignments after a vendor reorganizes its
  -- taxonomy. last_seen_at is bumped on every re-scrape via upsert.
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  -- One row per distinct path within a (product, store). Massy products
  -- in N categories produce N rows; re-scrapes upsert by this key.
  unique (product_id, store_id, vendor_path)
);

-- Browse "By store" tile grid: distinct vendor_path_root by store, with
-- counts. The (store_id, vendor_path_root) index covers both the distinct
-- set and the per-tile count.
create index product_store_categories_store_root_idx
  on public.product_store_categories (store_id, vendor_path_root);

-- Drill-down "all products at this store under this root" reads. The
-- composite index on (store_id, vendor_path) supports both prefix matches
-- (when we eventually allow drilling deeper than root) and equality reads.
create index product_store_categories_store_path_idx
  on public.product_store_categories (store_id, vendor_path);

-- Reverse direction: "what categories is this product in across all stores"
-- — used by the per-product admin view and any future "see at other stores"
-- callout on product detail.
create index product_store_categories_product_idx
  on public.product_store_categories (product_id);

comment on column public.product_store_categories.vendor_path is
  'Full vendor taxonomy path joined with " › ". Verbatim from source — admins do not curate.';
comment on column public.product_store_categories.vendor_path_root is
  'First segment of vendor_path. Drives the Browse "By store" tile grid.';
comment on column public.product_store_categories.last_seen_at is
  'Bumped on every re-scrape upsert so admins can spot stale assignments after vendor taxonomy changes.';

-- =============================================================================
-- RLS — public read (mobile Browse needs anon access, same as products /
-- stores), service-role-only writes via ingest-scrape. No admin write policy
-- yet — admins curate via an Edge Function if the need ever arises (per
-- DECISIONS.md 2026-05-02 admin-writes-via-Edge-Function pattern).
-- =============================================================================

alter table public.product_store_categories enable row level security;

create policy "Anyone read product_store_categories"
  on public.product_store_categories for select
  to anon, authenticated
  using (true);

-- =============================================================================
-- Surface the categorization writes in the scrape_runs audit row so the admin
-- UI can show "did the categories pipeline work this run?" alongside the
-- existing prices/availability counters.
-- =============================================================================

alter table public.scrape_runs
  add column categories_writes integer not null default 0;

comment on column public.scrape_runs.categories_writes is
  'Number of (product, store, vendor_path) rows upserted into product_store_categories.';
