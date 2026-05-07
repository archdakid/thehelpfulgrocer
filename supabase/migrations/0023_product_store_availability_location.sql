-- F11 Phase 2 — Per-location availability writes.
--
-- 0017 keyed availability by (product_id, store_id) — fine when one chain
-- meant one location. With store_locations now in play (0019), scraped
-- data needs to record per-branch stock. We extend the natural key to
-- include store_location_id, treating NULL as a real value (NULLS NOT
-- DISTINCT — Postgres 15+).
--
-- Row semantics:
--   - store_location_id IS NULL → applies to the whole chain
--   - store_location_id IS NOT NULL → applies to that branch only
--
-- Default-when-absent semantics from 0017 are preserved: no row at any
-- specificity = available. The compare-sheet's existing read path stays
-- backward-compatible.
--
-- Existing manage-price Edge Function callers that upsert with onConflict
-- = 'product_id,store_id' need to be updated to target the new natural
-- key (the new column will be null in their writes, which the NULLS NOT
-- DISTINCT unique handles correctly).

-- Synthetic id PK so the natural key can include a nullable column
-- (PRIMARY KEY can't accept NULL).
alter table public.product_store_availability
  drop constraint product_store_availability_pkey,
  add column id uuid not null default gen_random_uuid(),
  add column store_location_id uuid references public.store_locations(id) on delete cascade;

alter table public.product_store_availability
  add primary key (id);

-- One row per (product, store, location). NULLS NOT DISTINCT means there's
-- only one chain-wide row per (product, store) too, instead of accidentally
-- accruing duplicates as Postgres treats NULLs as distinct under default
-- unique semantics.
create unique index product_store_availability_natural_uk
  on public.product_store_availability (product_id, store_id, store_location_id)
  nulls not distinct;

create index product_store_availability_location_idx
  on public.product_store_availability (store_location_id)
  where store_location_id is not null;

comment on column public.product_store_availability.store_location_id is
  'Branch this availability flag applies to. NULL = chain-wide (applies to all branches absent a more specific row).';
