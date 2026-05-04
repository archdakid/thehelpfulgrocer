-- F8 Phase 2 — Stores CRUD groundwork.
--
-- Phase 1 left `stores` exactly as 0001 created it: anon/authenticated can
-- SELECT only `is_active = true` rows, no write policies anywhere. Writes
-- happen entirely through the new `manage-store` Edge Function with the
-- service role, mirroring the pattern locked in for `resolve-flagged-item`
-- (DECISIONS.md 2026-05-02 — admin writes via Edge Function, not loosened
-- RLS). This migration prepares the table for that flow:
--
--   1. Audit columns (`created_by`, `updated_at`) plus a trigger so the
--      function doesn't have to remember to set `updated_at` on every
--      write. `created_by` is nullable since the seed rows pre-date the
--      column.
--   2. An admin-bypass SELECT policy so the admin app can list inactive
--      stores. The existing "anyone reads active" policy stays — the two
--      OR together when both apply.
--
-- service_role table grants are already in place from 0012; this migration
-- doesn't need to re-grant them.

alter table public.stores
  add column created_by uuid references public.profiles(id) on delete set null,
  add column updated_at timestamptz not null default now();

-- Generic timestamp updater. Reusable for future tables that want the
-- same semantics; named `set_updated_at` so the relationship to the
-- column is obvious in pg_trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

-- Admin SELECT policy. The existing "Anyone can read active stores"
-- policy stays untouched; PostgREST OR's policies on the same operation
-- so admins still get active rows via the public path *and* see inactive
-- rows via this one.
create policy "Admins read all stores"
  on public.stores for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
