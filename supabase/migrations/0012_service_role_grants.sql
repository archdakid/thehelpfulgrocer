-- Restore service_role data-modification grants on public tables.
--
-- Discovered while wiring up the F8 Phase-1 admin queue: every Edge Function
-- call to `resolve-flagged-item` failed with "permission denied for table
-- flagged_items" even though the function authenticates with the
-- service_role key. RLS bypass on its own doesn't satisfy table-level GRANT
-- checks, and on this project the default privileges in `public` were never
-- configured to include service_role for SELECT/INSERT/UPDATE/DELETE — so
-- every table created since session 1 is missing those grants.
--
-- This migration grants the missing privileges on the tables Edge Functions
-- read or write today, and also resets default privileges so any table we
-- add later gets the grants automatically.

grant select, insert, update, delete on table
  public.stores,
  public.products,
  public.product_aliases,
  public.prices,
  public.profiles,
  public.receipts,
  public.receipt_items,
  public.flagged_items
to service_role;

-- Future-proof: anything new in public.* gets the same grants. Without this
-- the next migration that creates a table will reproduce this bug.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

-- Sequences too — service_role inserts that rely on default values backed
-- by sequences (we don't have any today, but a SERIAL column added later
-- would silently fail without USAGE).
alter default privileges in schema public
  grant usage, select on sequences to service_role;
