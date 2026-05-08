-- F11 Phase 1 — Store locations (branches/clubs).
--
-- Today `stores` is one row per chain. That works while the only writers are
-- admin (one observed price per chain) and receipts (the user types in which
-- chain). It breaks for the scrape ingest pipeline: PriceSmart has 5 clubs
-- (Trinidad warehouse, Chaguanas, Port of Spain, Mausica, San Fernando) and
-- SuperPharm has 11 branches, each with its own per-product stock state and
-- (sometimes) different prices. Modelling those as 16 separate `stores` rows
-- collapses the chain identity that mobile already shows on the compare-sheet.
--
-- This migration adds `store_locations` as a child of `stores`. Existing
-- columns on `stores` are left alone — every screen that says "store" today
-- still works. Per-location pricing/availability arrives in 0022/0023; this
-- migration is intentionally just the table + a 1:1 backfill so nothing
-- downstream changes shape yet.

create table public.store_locations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  -- Vendor-supplied code so a re-scrape can match this row without a fuzzy
  -- search. PS uses numeric club ids ("8001"), SuperPharm uses short codes
  -- ("CUV"). Free-text by design — every retailer has a different convention.
  external_id text,
  region text not null default 'TT',
  is_active boolean not null default true,
  -- Nullable for now; populated when admins enter coordinates for the future
  -- "nearest store" geofence feature. Keeping numeric (not PostGIS) — we don't
  -- have the extension enabled and Haversine in app code is fine for ~16 rows.
  lat numeric(9, 6),
  lng numeric(9, 6),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Per-chain unique location name. (PS won't have two "Chaguanas" clubs.)
  unique (store_id, name),
  -- Per-chain unique upstream code, when supplied. Two locations cannot share
  -- the same external_id within one chain; nulls are allowed (admin-added
  -- locations don't have to map to a vendor code).
  unique (store_id, external_id)
);

create index store_locations_active_idx
  on public.store_locations (store_id, is_active)
  where is_active;

create trigger store_locations_set_updated_at
  before update on public.store_locations
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — same shape as `stores`: anon/authenticated read active rows, admins
-- read all rows, writes are service-role-only via a future `manage-location`
-- Edge Function (DECISIONS.md 2026-05-02 — admin writes via Edge Function,
-- not loosened RLS).
-- =============================================================================

alter table public.store_locations enable row level security;

create policy "Anyone can read active locations"
  on public.store_locations for select
  to anon, authenticated
  using (is_active);

create policy "Admins read all locations"
  on public.store_locations for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- =============================================================================
-- Backfill — one location per existing chain, named after the chain itself.
-- Admins can rename or split these later via the locations CRUD. PriceSmart's
-- 5 clubs and SuperPharm's 11 branches will be added through that flow when
-- the scraper goes live, not here (scraper data shouldn't ship inside a
-- schema migration — it's stale the moment it's written).
-- =============================================================================

insert into public.store_locations (store_id, name, region, is_active)
select id, name, region, is_active
from public.stores
on conflict (store_id, name) do nothing;
