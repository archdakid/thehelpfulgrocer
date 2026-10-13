-- F11 Phase 2 — Close the symmetric-flag hole in merge_products().
--
-- Migration 0030 pre-resolved redundant flags where the post-merge
-- (flagged, candidate) tuple would duplicate ANOTHER unresolved flag's
-- existing tuple. Specifically it handled:
--   - (E, X) ↔ (F, X)  : both → (F, X) after merge of E into F
--   - (X, E) ↔ (X, F)  : both → (X, F) after merge of E into F
--
-- It missed the SYMMETRIC case:
--   - (E, F) ↔ (F, E)  : both → (F, F) after merge of E into F
--
-- This shows up whenever the matcher tier flagged a pair in both
-- directions across separate runs (P "Pepsi 2L" → flagged against M's
-- entry, then later M → flagged against P's). The unique index on
-- unresolved (flagged, candidate, reason) didn't prevent the pair from
-- being filed both ways since (E, F) and (F, E) are different tuples.
--
-- This migration extends merge_products() to also pre-resolve any
-- (loser, winner) and (winner, loser) flags before the repoint UPDATEs.
-- All such flags would end up at (winner, winner) post-merge, which is
-- a meaningless self-reference; resolving them as 'merged' is the
-- correct outcome anyway.

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

  -- Pre-resolve flags whose post-merge tuple would collide with another
  -- unresolved flag's existing tuple. Three cases (the third was missed
  -- in 0030 — see this migration's header):
  --
  --   (a) flagged=loser, candidate=X  with another (winner, X) unresolved
  --       → both become (winner, X) after merge.
  --   (b) candidate=loser, flagged=X  with another (X, winner) unresolved
  --       → both become (X, winner) after merge.
  --   (c) flagged∈{loser,winner} AND candidate∈{loser,winner}, i.e.
  --       (loser, winner) or (winner, loser)
  --       → both become (winner, winner) after merge. The processing
  --       flag is one of these; any symmetric partner is the other.
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
      -- Case (a)
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
      -- Case (b)
      (f.candidate_product_id = p_loser_id and exists (
        select 1 from public.flagged_items f2
        where f2.candidate_product_id = p_winner_id
          and f2.flagged_product_id = f.flagged_product_id
          and f2.reason = 'potential_duplicate'
          and f2.resolved_at is null
          and f2.receipt_item_id is null
          and f2.id <> f.id
      ))
      or
      -- Case (c) — symmetric or self. Any flag whose two endpoints are
      -- exactly {loser, winner} would become (winner, winner) after
      -- repoints; if more than one such flag exists they collide on the
      -- unique index. Resolving them all is correct: a (winner, winner)
      -- flag has no semantic meaning post-merge anyway.
      (
        (f.flagged_product_id = p_loser_id and f.candidate_product_id = p_winner_id)
        or (f.flagged_product_id = p_winner_id and f.candidate_product_id = p_loser_id)
      )
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
  -- flagged_items_ingest_unique (which only enforces on unresolved rows
  -- as of 0030; rows pre-resolved above are exempt).
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
