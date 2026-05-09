-- F11 Phase 2 — Fix backfill_potential_duplicates_batch + admin-checked wrapper
--
-- Two issues with 0027:
--
-- 1. `max(id)` on a uuid column raises 42883 (no max(uuid) aggregate).
--    Postgres doesn't define max() on uuid because the type doesn't have
--    a guaranteed sort order (despite supporting comparison). Use the
--    deterministic `order by id desc limit 1` to grab the highest id.
--
-- 2. The function is SECURITY DEFINER service-role-only, so admins can
--    run it via SQL editor — but the SQL editor's web pooler has a 60s
--    ceiling that even the optimized set-based one-shot exceeds for ~23k
--    products. The runner-side approach calls the batched function in a
--    loop, but the runner authenticates as the scrape user (admin profile
--    flag) over an anon JWT — NOT service-role. Add a thin admin-checked
--    wrapper that authenticated users can call, gated by a profiles
--    is_admin check inside the function body.

-- =============================================================================
-- Fix 1: max(uuid) → order-by-id-desc-limit-1
-- =============================================================================

create or replace function public.backfill_potential_duplicates_batch(
  p_min_score numeric default 0.5,
  p_after_id uuid default null,
  p_batch_size int default 1000
)
returns table (scanned bigint, flagged bigint, last_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanned bigint;
  v_flagged bigint;
  v_last uuid;
begin
  with product_pool as (
    select id, name, brand, unit_size, unit_of_measure
    from public.products p
    where (p_after_id is null or p.id > p_after_id)
      and not exists (
        select 1 from public.flagged_items f
        where f.reason = 'potential_duplicate'
          and f.resolved_at is null
          and (f.flagged_product_id = p.id or f.candidate_product_id = p.id)
      )
    order by id
    limit p_batch_size
  ),
  matches as (
    select
      pp.id as flagged_id,
      m.product_id as candidate_id,
      m.similarity
    from product_pool pp
    cross join lateral (
      select *
      from public.match_existing_product(
        pp.name, pp.brand, pp.unit_size, pp.unit_of_measure, pp.id
      )
      where similarity >= p_min_score
        and (same_size or same_brand)
      order by similarity desc
      limit 1
    ) m
  ),
  inserted as (
    insert into public.flagged_items (
      receipt_item_id, flagged_product_id, candidate_product_id, reason, match_score
    )
    select null, flagged_id, candidate_id, 'potential_duplicate', similarity
    from matches
    on conflict (flagged_product_id, candidate_product_id, reason)
      where receipt_item_id is null
      do nothing
    returning 1
  )
  select
    (select count(*) from product_pool),
    (select count(*) from inserted),
    -- order-by-desc-limit-1 because uuid has no max() aggregate. The pool
    -- is at most p_batch_size rows, so the extra sort is cheap.
    (select id from product_pool order by id desc limit 1)
  into v_scanned, v_flagged, v_last;

  return query select v_scanned, v_flagged, v_last;
end;
$$;

revoke all on function public.backfill_potential_duplicates_batch(numeric, uuid, int)
  from public, anon, authenticated;
grant execute on function public.backfill_potential_duplicates_batch(numeric, uuid, int)
  to service_role;

-- =============================================================================
-- Fix 2: admin-checked wrapper for authenticated callers
--
-- The runner authenticates as the scrape user (admin profile flag) holding
-- an anon JWT. It can't call service-role functions directly. This wrapper
-- checks `profiles.is_admin = true` for the calling user, then delegates
-- to the service-role-only batch function. Service-role callers can keep
-- calling the underlying function directly for SQL-editor / psql use.
-- =============================================================================

create or replace function public.backfill_potential_duplicates_run(
  p_min_score numeric default 0.5,
  p_after_id uuid default null,
  p_batch_size int default 1000
)
returns table (scanned bigint, flagged bigint, last_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  -- auth.uid() works inside SECURITY DEFINER on Supabase: the JWT claim
  -- is set by GoTrue at the request boundary, not by the executing role.
  select is_admin into v_is_admin
  from public.profiles
  where id = auth.uid();

  if v_is_admin is not true then
    raise exception 'backfill_potential_duplicates_run: admin only';
  end if;

  return query
  select b.scanned, b.flagged, b.last_id
  from public.backfill_potential_duplicates_batch(p_min_score, p_after_id, p_batch_size) b;
end;
$$;

revoke all on function public.backfill_potential_duplicates_run(numeric, uuid, int)
  from public, anon;
grant execute on function public.backfill_potential_duplicates_run(numeric, uuid, int)
  to authenticated;
