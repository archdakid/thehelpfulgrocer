-- F11 Phase 2 — Optimize backfill_potential_duplicates to fit pooler timeout.
--
-- The plpgsql loop in 0026 calls match_existing_product per row in a tight
-- FOR loop. PL/pgSQL function-call overhead plus 23k iterations pushes it
-- past Supabase's pooler 60s statement timeout. Drop the loop, use a single
-- set-based query with LATERAL JOIN: Postgres can plan the trigram-index
-- lookups in one shot and the work parallelizes.
--
-- Also adds a paginated batched variant for catalogs large enough that even
-- the optimized version blows the 60s ceiling. The runner can call it in
-- a loop with the cursor returned by each call.

drop function if exists public.backfill_potential_duplicates(numeric);

-- =============================================================================
-- backfill_potential_duplicates(min_score)
-- One-shot set-based version. Single SQL statement, INSERT...SELECT with
-- LATERAL match per product. ON CONFLICT DO NOTHING via the partial unique
-- index so re-runs are idempotent.
-- =============================================================================

create or replace function public.backfill_potential_duplicates(
  p_min_score numeric default 0.5
)
returns table (scanned bigint, flagged bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanned bigint;
  v_flagged bigint;
begin
  -- product_pool: every product not already involved in an unresolved
  -- potential_duplicate row (either side). matches: best LATERAL hit per
  -- product clearing the threshold + brand-or-size filter.
  with product_pool as (
    select id, name, brand, unit_size, unit_of_measure
    from public.products p
    where not exists (
      select 1 from public.flagged_items f
      where f.reason = 'potential_duplicate'
        and f.resolved_at is null
        and (f.flagged_product_id = p.id or f.candidate_product_id = p.id)
    )
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
    (select count(*) from inserted)
  into v_scanned, v_flagged;

  return query select v_scanned, v_flagged;
end;
$$;

-- =============================================================================
-- backfill_potential_duplicates_batch(min_score, after_id, batch_size)
-- Paginated variant for catalogs too big for the one-shot. Caller threads
-- `last_id` from each call's return back into `p_after_id` until
-- `scanned < p_batch_size`.
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
    (select max(id) from product_pool)
  into v_scanned, v_flagged, v_last;

  return query select v_scanned, v_flagged, v_last;
end;
$$;

revoke all on function public.backfill_potential_duplicates(numeric) from public, anon, authenticated;
grant execute on function public.backfill_potential_duplicates(numeric) to service_role;

revoke all on function public.backfill_potential_duplicates_batch(numeric, uuid, int) from public, anon, authenticated;
grant execute on function public.backfill_potential_duplicates_batch(numeric, uuid, int) to service_role;
