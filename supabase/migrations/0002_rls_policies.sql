-- RLS policies — default deny, explicit allow.
-- Per CLAUDE.md critical rule #17: no table without RLS.
--
-- Anonymous and authenticated users can read public catalog data (stores,
-- products, prices). Writes are admin-only and route through Edge Functions
-- using the service_role key — never client-side. Write policies will land
-- when those Edge Functions do.

alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.prices enable row level security;

-- stores: anon + authenticated may read only active rows. Inactive stores
-- exist for history but are hidden from the client.
create policy "Anyone can read active stores"
  on public.stores
  for select
  to anon, authenticated
  using (is_active);

-- products: anyone may read all rows. There's no soft-delete / inactive concept.
create policy "Anyone can read products"
  on public.products
  for select
  to anon, authenticated
  using (true);

-- prices: anyone may read all rows. Per DECISIONS.md the table is append-only;
-- old observations stay, the view layer hides them.
create policy "Anyone can read prices"
  on public.prices
  for select
  to anon, authenticated
  using (true);
