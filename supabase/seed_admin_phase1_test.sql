-- Phase 1 admin queue test seed. Not a migration; ad-hoc seed for verifying
-- the resolve-flagged-item Edge Function and the admin UI's resolve flows.
--
-- Idempotent: re-running deletes prior seed data first via the
-- `notes='SEED:admin-phase1'` tag on receipts and the `SEED:` name prefix on
-- auto-created products. Cascades clean up receipt_items, prices, and
-- flagged_items.

do $$
declare
  v_admin_id   uuid;
  v_store_id   uuid;
  v_heinz_id   uuid;
  v_pepsi_id   uuid;
  v_receipt_id uuid;
  v_item1_id   uuid;
  v_item2_id   uuid;
  v_item3_id   uuid;
  v_item4_id   uuid;
  v_item5_id   uuid;
  v_auto_p1    uuid;
  v_auto_p2    uuid;
  v_auto_p3    uuid;
  v_observed   timestamptz := now() - interval '1 day';
begin
  select id into v_admin_id from public.profiles where is_admin order by id limit 1;
  select id into v_store_id from public.stores where name = 'Massy Stores' limit 1;
  select id into v_heinz_id from public.products where name = 'Heinz Tomato Ketchup 397g' limit 1;
  select id into v_pepsi_id from public.products where name = 'Pepsi Cola 2L' limit 1;

  if v_admin_id is null or v_store_id is null or v_heinz_id is null or v_pepsi_id is null then
    raise exception 'Missing prerequisites (admin=%, store=%, heinz=%, pepsi=%)',
      v_admin_id, v_store_id, v_heinz_id, v_pepsi_id;
  end if;

  delete from public.products where name like 'SEED:%';
  delete from public.receipts where notes = 'SEED:admin-phase1';

  insert into public.receipts (user_id, store_id, image_path, status, currency, captured_at, notes, processed_at)
  values (v_admin_id, v_store_id, 'seed/phase1.jpg', 'processed', 'TTD', v_observed, 'SEED:admin-phase1', now())
  returning id into v_receipt_id;

  -- 1) UNMATCHED — admin should `correct` to Heinz Ketchup (or `reject`).
  insert into public.receipt_items
    (receipt_id, position, raw_text, quantity, unit_price_minor_units, line_total_minor_units, needs_review)
  values
    (v_receipt_id, 1, 'MYSTERY BRAND XYZ', 1, 1500, 1500, true)
  returning id into v_item1_id;
  insert into public.flagged_items (receipt_item_id, reason)
  values (v_item1_id, 'unmatched');

  -- 2) LOW_CONFIDENCE — matched to Heinz at 0.40, no price contributed yet.
  --    Admin `confirm` should backfill a prices row + add an alias.
  insert into public.receipt_items
    (receipt_id, position, raw_text, quantity, unit_price_minor_units, line_total_minor_units,
     matched_product_id, match_confidence, needs_review)
  values
    (v_receipt_id, 2, 'HZ KTCHP 397g', 1, 2299, 2299, v_heinz_id, 0.40, true)
  returning id into v_item2_id;
  insert into public.flagged_items (receipt_item_id, reason)
  values (v_item2_id, 'low_confidence');

  -- 3) AUTO_CREATED_PRODUCT (confirm path) — "Guinness Stout 330ml" is a
  --    plausible new catalog row. Confirming should leave product + price intact.
  insert into public.products (name, brand)
  values ('SEED:Guinness Stout 330ml', 'Guinness')
  returning id into v_auto_p1;
  insert into public.receipt_items
    (receipt_id, position, raw_text, quantity, unit_price_minor_units, line_total_minor_units,
     matched_product_id, match_confidence, needs_review)
  values
    (v_receipt_id, 3, 'GUINNESS STOUT 330ML', 1, 1899, 1899, v_auto_p1, 1.00, false)
  returning id into v_item3_id;
  insert into public.prices (product_id, store_id, amount_minor_units, currency, source, observed_at, receipt_item_id)
  values (v_auto_p1, v_store_id, 1899, 'TTD', 'receipt', v_observed, v_item3_id);
  insert into public.flagged_items (receipt_item_id, reason, auto_created_product_id)
  values (v_item3_id, 'auto_created_product', v_auto_p1);

  -- 4) AUTO_CREATED_PRODUCT (merge path) — duplicate of existing Pepsi Cola 2L.
  --    Admin `merge` → target = real Pepsi product. Price row should reattach,
  --    auto product should be deleted, alias added on the target.
  insert into public.products (name, brand)
  values ('SEED:Pepsi 2L Bottle', 'PepsiCo')
  returning id into v_auto_p2;
  insert into public.receipt_items
    (receipt_id, position, raw_text, quantity, unit_price_minor_units, line_total_minor_units,
     matched_product_id, match_confidence, needs_review)
  values
    (v_receipt_id, 4, 'PEPSI 2L BTL', 1, 1799, 1799, v_auto_p2, 1.00, false)
  returning id into v_item4_id;
  insert into public.prices (product_id, store_id, amount_minor_units, currency, source, observed_at, receipt_item_id)
  values (v_auto_p2, v_store_id, 1799, 'TTD', 'receipt', v_observed, v_item4_id);
  insert into public.flagged_items (receipt_item_id, reason, auto_created_product_id)
  values (v_item4_id, 'auto_created_product', v_auto_p2);

  -- 5) AUTO_CREATED_PRODUCT (reject path) — bogus item. Admin `reject` should
  --    delete the product, cascading the contributed price row away.
  insert into public.products (name, brand)
  values ('SEED:Junk Not Real', 'Unknown')
  returning id into v_auto_p3;
  insert into public.receipt_items
    (receipt_id, position, raw_text, quantity, unit_price_minor_units, line_total_minor_units,
     matched_product_id, match_confidence, needs_review)
  values
    (v_receipt_id, 5, 'JUNK NOT REAL ITEM', 1, 999, 999, v_auto_p3, 1.00, false)
  returning id into v_item5_id;
  insert into public.prices (product_id, store_id, amount_minor_units, currency, source, observed_at, receipt_item_id)
  values (v_auto_p3, v_store_id, 999, 'TTD', 'receipt', v_observed, v_item5_id);
  insert into public.flagged_items (receipt_item_id, reason, auto_created_product_id)
  values (v_item5_id, 'auto_created_product', v_auto_p3);

  raise notice 'Seeded receipt % with 5 flagged_items at store %', v_receipt_id, v_store_id;
end $$;

-- Verification summary.
select
  fi.reason,
  fi.resolution,
  ri.position,
  ri.raw_text,
  p.name as matched_product,
  ap.name as auto_created_product
from public.flagged_items fi
join public.receipt_items ri on ri.id = fi.receipt_item_id
join public.receipts r       on r.id = ri.receipt_id
left join public.products p  on p.id = ri.matched_product_id
left join public.products ap on ap.id = fi.auto_created_product_id
where r.notes = 'SEED:admin-phase1'
order by ri.position;
