-- Receipts Phase 3 (expanded) — admin queue + price contribution provenance.
--
-- After matching, the Edge Function contributes prices and auto-creates
-- products. Both actions need an audit trail:
--   * `prices.receipt_item_id` — every receipt-sourced price links back to
--     the line item that produced it. Set null on item delete so historical
--     prices survive a receipt deletion (append-only invariant from
--     DECISIONS.md 2026-04-30).
--   * `flagged_items` — the admin work queue. Three reasons today:
--       'unmatched'              → no product matched, didn't meet auto-
--                                  create metrics. Admin picks a product or
--                                  curates a new one.
--       'low_confidence'         → matched but trigram score < 0.50. Admin
--                                  confirms or corrects; on confirm the
--                                  price contribution backfills.
--       'auto_created_product'   → we created a `products` row from an
--                                  unmatched item that passed the metric
--                                  gate. Admin verifies the product is
--                                  real / not a duplicate / has correct
--                                  metadata, then resolves.
--
-- Auto-created products plus their flagged_items rows live on regardless of
-- resolution — confirmed entries become permanent catalog rows; rejected
-- ones get cleaned up by an admin-side cascade (delete the product, the
-- flagged_item cascades via FK).

-- =============================================================================
-- prices: link contributions back to the receipt item that produced them
-- =============================================================================

alter table public.prices
  add column receipt_item_id uuid
    references public.receipt_items(id) on delete set null;

create index prices_receipt_item_idx
  on public.prices (receipt_item_id)
  where receipt_item_id is not null;

-- =============================================================================
-- flagged_items: the admin review queue
-- =============================================================================

create table public.flagged_items (
  id uuid primary key default gen_random_uuid(),
  receipt_item_id uuid not null references public.receipt_items(id) on delete cascade,
  reason text not null check (reason in ('unmatched', 'low_confidence', 'auto_created_product')),
  -- Set when reason = 'auto_created_product'. On delete-set-null so a
  -- rejected product can be removed by admin without losing the audit row.
  auto_created_product_id uuid references public.products(id) on delete set null,
  notes text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  -- 'confirmed': admin agrees with the system's call (match, auto-create, etc.)
  -- 'corrected': admin replaced the match with a different product
  -- 'rejected':  admin marked the item as bogus / not a product
  -- 'merged':    admin merged the auto-created product into an existing one
  resolution text check (resolution in ('confirmed', 'corrected', 'rejected', 'merged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One queue entry per (item, reason). Re-running OCR clears items first
  -- (cascade), so this is enforced naturally.
  unique (receipt_item_id, reason)
);

create index flagged_items_unresolved_idx
  on public.flagged_items (created_at desc)
  where resolved_at is null;

create trigger flagged_items_set_updated_at
  before update on public.flagged_items
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — flagged_items is an admin-only surface
-- =============================================================================

alter table public.flagged_items enable row level security;

-- Admin reads everything. The exists() lookup hits the profiles PK.
create policy "Admins read flagged items"
  on public.flagged_items for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

create policy "Admins update flagged items"
  on public.flagged_items for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- =============================================================================
-- Grants — everyone except service_role is locked out of writes
-- =============================================================================

revoke all on public.flagged_items from anon, authenticated;
grant select on public.flagged_items to authenticated;
-- Admins resolve queue items; the policies above narrow this to admin rows.
grant update (notes, resolved_at, resolved_by, resolution)
  on public.flagged_items to authenticated;
