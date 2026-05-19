-- F11 Phase 2 — Fix merge_products() conflicts with the ingest-flag unique index.
--
-- Symptom: when triage-duplicates calls merge_products(loser=A, winner=B),
-- it intermittently raises:
--   duplicate key value violates unique constraint "flagged_items_ingest_unique"
--
-- Cause: the partial unique index from 0026 enforces uniqueness on
-- (flagged_product_id, candidate_product_id, reason) for EVERY ingest
-- row, regardless of resolution state. The matcher routinely flags
-- "A vs X" and "B vs X" as separate potential_duplicate rows (trigram
-- similarity clusters). When A merges into B, the existing
-- update flagged_items set flagged_product_id = B where flagged_product_id = A
-- repoints (A, X, 'potential_duplicate') → (B, X, 'potential_duplicate'),
-- which collides with the existing (B, X, 'potential_duplicate') row.
--
-- Fix has two parts:
--
-- 1. Tighten the partial index to only enforce uniqueness on UNRESOLVED
--    rows. Two resolved rows with the same triple is fine — they're
--    historical audit, not the live queue. The dedupe intent of 0026 was
--    "no duplicate pending flags," not "no duplicate flags ever."
--
-- 2. Update merge_products() to identify post-merge-redundant unresolved
--    flags and mark them resolved (with a system note) BEFORE the
--    repoint. Two unresolved flags that would point at the same product
--    triple after the merge: only one can survive as live queue, the
--    other becomes 'merged' with a marker so admin spot-checks can find
--    them.

-- =============================================================================
-- 1. Refine the partial unique index
-- =============================================================================

drop index if exists public.flagged_items_ingest_unique;

create unique index flagged_items_ingest_unique
  on public.flagged_items (flagged_product_id, candidate_product_id, reason)
  where receipt_item_id is null and resolved_at is null;

comment on index public.flagged_items_ingest_unique is
  'One unresolved queue entry per (flagged_product, candidate, reason) for ingest-origin rows. Resolved rows are exempt — historical audit can repeat the same triple.';

-- =============================================================================
-- 2. merge_products: pre-resolve redundant unresolved flags
--
-- Before the existing repoint UPDATEs (unchanged), scan for unresolved
-- potential_duplicate rows that — after merge — would collide with another
-- unresolved row, and mark them 'merged' with a system note. This lets
-- admin filter `notes ILIKE '%redundant after merge%'` to spot-audit which
-- flags were collapsed by transitive merges (vs. the LLM's own decision).
-- =============================================================================

create or replace function public.merge_products(
  p_loser_id uuid,
  p_winner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loser products%rowtype;
  v_winner products%rowtype;
begin
  if p_loser_id = p_winner_id then
    raise exception 'merge_products: loser and winner are the same product';
  end if;

  select * into v_loser from public.products where id = p_loser_id;
  if not found then raise exception 'merge_products: loser product % not found', p_loser_id; end if;
  select * into v_winner from public.products where id = p_winner_id;
  if not found then raise exception 'merge_products: winner product % not found', p_winner_id; end if;

  -- Pre-resolve flags whose post-merge state would duplicate another
  -- unresolved flag. Two cases:
  --   (a) Flag's flagged side will be repointed to winner; another flag
  --       already has (winner, this.candidate) unresolved → collision.
  --   (b) Flag's candidate side will be repointed to winner; another flag
  --       already has (this.flagged, winner) unresolved → collision.
  -- We resolve the would-be duplicate (mark 'merged' with note). The
  -- surviving flag stays in the queue.
  update public.flagged_items as f
    set resolved_at = now(),
        resolution = 'merged',
        notes = coalesce(f.notes, '') ||
          ' [auto-resolved by merge_products: redundant after merge of ' ||
          p_loser_id::text || ' into ' || p_winner_id::text || ']'
  where f.reason = 'potential_duplicate'
    and f.resolved_at is null
    and f.receipt_item_id is null
    and (
      (f.flagged_product_id = p_loser_id and exists (
        select 1 from public.flagged_items f2
        where f2.flagged_product_id = p_winner_id
          and f2.candidate_product_id = f.candidate_product_id
          and f2.reason = 'potential_duplicate'
          and f2.resolved_at is null
          and f2.receipt_item_id is null
          and f2.id <> f.id
      ))
      or
      (f.candidate_product_id = p_loser_id and exists (
        select 1 from public.flagged_items f2
        where f2.candidate_product_id = p_winner_id
          and f2.flagged_product_id = f.flagged_product_id
          and f2.reason = 'potential_duplicate'
          and f2.resolved_at is null
          and f2.receipt_item_id is null
          and f2.id <> f.id
      ))
    );

  -- prices: append-only history, no unique constraint to dodge. Just
  -- repoint product_id. Sale columns / receipt_item_id / store_location_id
  -- come along untouched.
  update public.prices set product_id = p_winner_id where product_id = p_loser_id;

  -- product_aliases: unique (product_id, alias). Move loser's aliases to
  -- winner where the winner doesn't already have them. Drop the rest.
  insert into public.product_aliases (product_id, alias, source, created_at)
  select p_winner_id, alias, source, created_at
  from public.product_aliases
  where product_id = p_loser_id
  on conflict (product_id, alias) do nothing;
  delete from public.product_aliases where product_id = p_loser_id;

  -- product_store_availability: unique (product_id, store_id,
  -- store_location_id) NULLS NOT DISTINCT. Loser's rows merge in where
  -- winner has no entry for that (store, location); duplicates drop.
  insert into public.product_store_availability (
    product_id, store_id, store_location_id, is_available, updated_at, updated_by
  )
  select p_winner_id, store_id, store_location_id, is_available, updated_at, updated_by
  from public.product_store_availability
  where product_id = p_loser_id
  on conflict (product_id, store_id, store_location_id) do nothing;
  delete from public.product_store_availability where product_id = p_loser_id;

  -- product_store_categories: unique (product_id, store_id, vendor_path).
  -- Same pattern.
  insert into public.product_store_categories (
    product_id, store_id, vendor_path, vendor_path_root, source, first_seen_at, last_seen_at
  )
  select p_winner_id, store_id, vendor_path, vendor_path_root, source, first_seen_at, last_seen_at
  from public.product_store_categories
  where product_id = p_loser_id
  on conflict (product_id, store_id, vendor_path) do nothing;
  delete from public.product_store_categories where product_id = p_loser_id;

  -- receipt_items.matched_product_id: ON DELETE SET NULL FK. Repoint
  -- explicitly so the audit trail follows the merge instead of getting
  -- nulled out.
  update public.receipt_items
    set matched_product_id = p_winner_id
    where matched_product_id = p_loser_id;

  -- flagged_items: both FKs to products are ON DELETE SET NULL so audit
  -- rows survive the merge. Repoint subjects (flagged_product_id) and
  -- candidates (candidate_product_id) at the winner. The pre-resolution
  -- step above ensures these UPDATEs don't violate
  -- flagged_items_ingest_unique (which now only enforces on unresolved
  -- rows; the rows we just resolved are exempt).
  update public.flagged_items
    set flagged_product_id = p_winner_id
    where flagged_product_id = p_loser_id;
  update public.flagged_items
    set candidate_product_id = p_winner_id
    where candidate_product_id = p_loser_id;

  -- Finally, drop the loser. Anything still referencing it cascades or
  -- gets nulled per the existing FK rules; we explicitly handled the
  -- columns that should follow rather than vanish.
  delete from public.products where id = p_loser_id;
end;
$$;

revoke all on function public.merge_products(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_products(uuid, uuid) to service_role;
