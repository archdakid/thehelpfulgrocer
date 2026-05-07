-- F11 Phase 2 — Scraper run audit table + 'scrape' source value.
--
-- The runner POSTs each scrape's normalized payload to the `ingest-scrape`
-- Edge Function; that function records a row here so admins can see "what
-- was the last run, did it succeed, how much did it ingest" inside the
-- existing admin app — no separate dashboard, no separate ops surface.
--
-- One row per run. A run starts as 'running'; ingest-scrape flips it to
-- 'success', 'partial' (per-row failures only), or 'failed' (fatal) when
-- it returns. A row left as 'running' for >1h is a crash/timeout — the UI
-- can surface those as broken so they're not silently swept under.

create table public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  -- Soft enum. Adding a new vendor doesn't require a migration; the runner
  -- posts a string and the admin UI shows it. A check constraint here would
  -- just turn each new vendor into a schema bump for no real safety gain.
  vendor text not null,
  -- 'full' (catalog walk) or 'delta' (price/availability only). Free-text
  -- by design — runners may add modes (e.g. 'images-only') without a migration.
  mode text not null,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  rows_received integer not null default 0,
  locations_upserted integer not null default 0,
  products_upserted integer not null default 0,
  prices_inserted integer not null default 0,
  availability_writes integer not null default 0,
  -- Per-row failures: jsonb so the runner gets structured detail back without
  -- having to parse text. Capped at 200 entries by ingest-scrape so a runaway
  -- run can't write a 100MB jsonb.
  errors jsonb not null default '[]'::jsonb,
  -- Set when status='failed' (network, auth, programming error). Per-row
  -- failures land in `errors` instead and leave status='partial'.
  fatal_error text,
  triggered_by uuid references auth.users(id) on delete set null,
  payload_size_bytes integer
);

create index scrape_runs_started_idx on public.scrape_runs (started_at desc);
create index scrape_runs_vendor_idx on public.scrape_runs (vendor, started_at desc);

-- =============================================================================
-- RLS — admin-only read. ingest-scrape writes via service-role.
-- =============================================================================

alter table public.scrape_runs enable row level security;

create policy "Admins read scrape runs"
  on public.scrape_runs for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- =============================================================================
-- Extend source enums to include 'scrape'.
-- prices.source and product_aliases.source were both bounded by check
-- constraints to a fixed set; extending them in-place is safer than dropping
-- and recreating (existing rows survive untouched, no data migration needed).
-- =============================================================================

alter table public.prices
  drop constraint if exists prices_source_check;
alter table public.prices
  add constraint prices_source_check
  check (source in ('admin', 'circular', 'receipt', 'manual', 'scrape'));

alter table public.product_aliases
  drop constraint if exists product_aliases_source_check;
alter table public.product_aliases
  add constraint product_aliases_source_check
  check (source in ('admin', 'receipt', 'manual', 'scrape'));
