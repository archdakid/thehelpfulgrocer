-- Per-store availability (in-stock / out-of-stock) for a product.
--
-- Why a separate table instead of a column on `prices`: stock state
-- changes independently of price. A product can be in stock at $X today
-- and out of stock tomorrow at the same price — we don't want a fresh
-- prices row every time stock flips, and we don't want stale price
-- observations to imply availability. The two concerns are split.
--
-- Default semantics: ABSENCE OF A ROW MEANS "AVAILABLE."
-- - The mobile compare-sheet currently shows every row in current_prices;
--   with this table empty on day 1, behavior is unchanged.
-- - Out-of-stock requires an explicit row with is_available=false.
-- - An explicit row with is_available=true is also allowed (e.g. the
--   admin marked it back in stock); both forms render as available.
-- This keeps the table small (only deviations from the default) and
-- lets the mobile app stay backward-compatible while the column gets
-- adopted.

create table public.product_store_availability (
  product_id uuid not null references public.products(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  is_available boolean not null default true,
  updated_at timestamptz not null default now(),
  -- Nullable so system writes (future scrape jobs writing via
  -- service_role) can leave it null. Admin writes record the admin's
  -- user_id; SET NULL on auth.users delete keeps the row but unlinks.
  updated_by uuid references auth.users(id) on delete set null,
  primary key (product_id, store_id)
);

create index product_store_availability_store_idx
  on public.product_store_availability (store_id);

-- Keep updated_at honest. The Edge Function passes updated_at via the
-- service-role write, but a trigger guards against any future direct
-- writes that forget.
create or replace function public.set_product_store_availability_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger product_store_availability_set_updated_at
  before update on public.product_store_availability
  for each row execute function public.set_product_store_availability_updated_at();

-- =============================================================================
-- RLS — public read, admin-only write (via Edge Function service_role).
-- Per CLAUDE.md rule #17 every table has RLS; default deny + explicit allow.
-- =============================================================================

alter table public.product_store_availability enable row level security;

create policy "Anyone can read availability"
  on public.product_store_availability
  for select
  to anon, authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policies for non-service-role users. The
-- manage-price Edge Function performs writes with the service role,
-- which bypasses RLS.
