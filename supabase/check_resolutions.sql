select
  ri.position,
  ri.raw_text,
  fi.reason,
  fi.resolution,
  p.name as final_matched_product,
  ri.matched_product_id is not null as has_match,
  exists (
    select 1 from public.prices pr where pr.receipt_item_id = ri.id
  ) as has_receipt_price
from public.flagged_items fi
join public.receipt_items ri on ri.id = fi.receipt_item_id
join public.receipts r       on r.id = ri.receipt_id
left join public.products p  on p.id = ri.matched_product_id
where r.notes = 'SEED:admin-phase1'
order by ri.position;
