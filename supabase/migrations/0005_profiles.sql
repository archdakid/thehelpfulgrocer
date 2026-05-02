-- Profiles: one row per auth user, holding app-side fields (display_name)
-- and the admin flag that gates admin-panel access.
--
-- Population is automatic — the trigger on auth.users insert below creates
-- a profile row at sign-up time, so the app never has to handle an
-- "authed but no profile" state beyond the brief PGRST116 window during the
-- first read after sign-up.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-touch updated_at on every UPDATE so the app can rely on it for
-- last-write-wins / cache busting without setting it manually.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Sign-up hook: create a profiles row whenever a new auth.users row appears.
-- security definer is required because the calling role (the supabase auth
-- service) doesn't have direct write access to public.profiles. The empty
-- search_path is the recommended hardening for definer functions.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.profiles enable row level security;

-- A signed-in user can read only their own row. anon has no policy and is
-- therefore denied; admin lookups happen server-side via the service role.
create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- A signed-in user can update only their own row. Column-level grants below
-- prevent self-elevation: is_admin isn't in the granted column set, so an
-- UPDATE that touches it is rejected by the privilege layer before RLS even
-- runs.
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- =============================================================================
-- Grants
-- =============================================================================
-- 0003 set ALTER DEFAULT PRIVILEGES so SELECT lands on new public tables for
-- both anon and authenticated. We immediately revoke from anon here because
-- profiles must never be readable while signed out, even if a future RLS
-- policy regression were to leak rows.
revoke select on public.profiles from anon;

-- Authenticated users can update display_name only. is_admin and the
-- timestamps are intentionally excluded — admin elevation is a SQL-only
-- operation and the timestamps maintain themselves.
grant update (display_name) on public.profiles to authenticated;
