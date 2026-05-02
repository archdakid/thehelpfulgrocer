-- Phase 1 admin queue test teardown. Removes everything the seed (and the
-- admin actions performed against it) inserted, including the receipt-
-- sourced prices and aliases that landed on real catalog rows when the
-- admin chose `correct` / `confirm` / `merge` targets.

begin;

-- 1) Prices contributed during testing. Identified via receipt_item_id
--    pointing at the seed receipt's items.
delete from public.prices
  where receipt_item_id in (
    select ri.id
    from public.receipt_items ri
    join public.receipts r on r.id = ri.receipt_id
    where r.notes = 'SEED:admin-phase1'
  );

-- 2) Aliases inserted by resolve actions. Match by alias text (the seed's
--    raw_text values) — narrower than a product join because the merge
--    flow can target any product.
delete from public.product_aliases
  where alias in (
    'MYSTERY BRAND XYZ',
    'HZ KTCHP 397g',
    'GUINNESS STOUT 330ML',
    'PEPSI 2L BTL',
    'JUNK NOT REAL ITEM'
  );

-- 3) Receipt + items + flagged_items (cascades on receipt delete).
delete from public.receipts where notes = 'SEED:admin-phase1';

-- 4) SEED:* products that survived (auto-created products that admin
--    confirmed instead of rejecting/merging).
delete from public.products where name like 'SEED:%';

commit;

-- Verify clean state.
select 'remaining_seed_receipts' as snap, count(*) as n
  from public.receipts where notes = 'SEED:admin-phase1'
union all
select 'remaining_seed_products', count(*)
  from public.products where name like 'SEED:%'
union all
select 'remaining_seed_aliases', count(*)
  from public.product_aliases
  where alias in ('MYSTERY BRAND XYZ','HZ KTCHP 397g','GUINNESS STOUT 330ML','PEPSI 2L BTL','JUNK NOT REAL ITEM')
union all
select 'remaining_seed_prices', count(*)
  from public.prices
  where receipt_item_id is not null
    and receipt_item_id not in (select id from public.receipt_items);
