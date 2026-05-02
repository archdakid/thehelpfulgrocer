-- Initial schema: stores, products, prices.
-- Deferred to later sessions: profiles, flagged_items, receipts, receipt_items,
-- product_aliases, product_image_candidates, circulars. They land when needed.

-- =============================================================================
-- stores
-- Admin-curated list of supported retail stores. Per docs/DECISIONS.md, users
-- cannot add stores — quality control matters more than coverage.
-- =============================================================================
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null default 'TT',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, region)
);

create index stores_active_idx on public.stores (is_active) where is_active;

-- =============================================================================
-- products
-- The product catalog. UPC is unique when present (loose produce/bakery items
-- have no barcode). Open Food Facts is the seed source per DECISIONS.md.
-- =============================================================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  upc text unique,
  name text not null,
  brand text,
  image_url text,
  created_at timestamptz not null default now()
);

create index products_name_idx on public.products using gin (to_tsvector('english', name));

-- =============================================================================
-- prices
-- Append-only per docs/DECISIONS.md (2026-04-30 — Postgres prices table is
-- append-only). Every price observation is a new row. The current_prices
-- view below gives the latest per (product, store).
-- =============================================================================
create table public.prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  amount_minor_units integer not null check (amount_minor_units >= 0),
  currency text not null default 'TTD',
  source text not null check (source in ('admin', 'circular', 'receipt', 'manual')),
  observed_at timestamptz not null default now()
);

create index prices_lookup_idx on public.prices (product_id, store_id, observed_at desc);

create or replace view public.current_prices as
  select distinct on (product_id, store_id)
    id,
    product_id,
    store_id,
    amount_minor_units,
    currency,
    source,
    observed_at
  from public.prices
  order by product_id, store_id, observed_at desc;
