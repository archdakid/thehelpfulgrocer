-- Grant table-level SELECT to anon and authenticated.
--
-- RLS policies (in 0002) gate WHICH rows a role can read. This file gates
-- WHETHER a role can issue a SELECT at all — without it, Postgres returns
-- 42501 "permission denied for table" before RLS is ever evaluated.
--
-- Supabase normally auto-applies these via default-privilege triggers, but on
-- raw migrations the trigger sometimes runs after the table is created,
-- leaving the role without privileges until the next ALTER DEFAULT PRIVILEGES
-- run. Making the grants explicit here is idempotent and avoids the foot-gun.

grant usage on schema public to anon, authenticated;

grant select on public.stores to anon, authenticated;
grant select on public.products to anon, authenticated;
grant select on public.prices to anon, authenticated;
grant select on public.current_prices to anon, authenticated;

-- Future tables in public will inherit SELECT for these roles automatically,
-- so we don't trip over this same error again next session.
alter default privileges in schema public grant select on tables to anon, authenticated;
