-- Phase 1 admin-queue verification snapshot. Run before/after each resolve
-- action to diff what the Edge Function actually changed.

select 'seed_prices' as snap, count(*) as n
  from public.prices p
  join public.receipt_items ri on ri.id = p.receipt_item_id
  join public.receipts r       on r.id = ri.receipt_id
  where r.notes = 'SEED:admin-phase1'
union all
select 'aliases_heinz', count(*)
  from public.product_aliases
  where product_id = (select id from public.products where name = 'Heinz Tomato Ketchup 397g')
union all
select 'aliases_pepsi', count(*)
  from public.product_aliases
  where product_id = (select id from public.products where name = 'Pepsi Cola 2L')
union all
select 'seed_products_remaining', count(*)
  from public.products where name like 'SEED:%'
union all
select 'unresolved_flags', count(*)
  from public.flagged_items fi
  join public.receipt_items ri on ri.id = fi.receipt_item_id
  join public.receipts r       on r.id = ri.receipt_id
  where r.notes = 'SEED:admin-phase1' and fi.resolved_at is null
union all
select 'resolved_flags', count(*)
  from public.flagged_items fi
  join public.receipt_items ri on ri.id = fi.receipt_item_id
  join public.receipts r       on r.id = ri.receipt_id
  where r.notes = 'SEED:admin-phase1' and fi.resolved_at is not null
order by snap;
