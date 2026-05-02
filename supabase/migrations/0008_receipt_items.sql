-- Receipts Phase 2 (OCR via Gemini Edge Function): adds parsed metadata to
-- receipts and introduces receipt_items for the line items that fall out of
-- OCR. Per the CLAUDE.md gotcha "always store raw text alongside parsed
-- data", we keep both `ocr_text` (the model's verbatim response) on the
-- receipt and `raw_text` (the line as it appeared) on every item, so we
-- can re-match against an updated product catalog later without re-running
-- OCR.
--
-- Money is stored in minor units (cents) to match the existing prices
-- table. `parsed_store_name` is the raw string the model extracted; the
-- Edge Function is responsible for fuzzy-matching it to a stores row and
-- setting receipts.store_id when the match is confident.

-- =============================================================================
-- receipts: extend with OCR-result columns
-- =============================================================================

alter table public.receipts
  add column ocr_text text,
  add column processed_at timestamptz,
  add column process_error text,
  add column parsed_store_name text,
  add column total_amount_minor_units int,
  add column currency text,
  add column receipt_date date;

-- Block clients from setting these directly. status was already gated to the
-- service role in 0006; the OCR result columns follow the same rule — only
-- the Edge Function (running with service_role) writes them.
revoke update on public.receipts from authenticated;
grant update (store_id, captured_at, notes)
  on public.receipts to authenticated;

-- =============================================================================
-- receipt_items: line items extracted from each receipt
-- =============================================================================

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  -- Preserves the order the items appeared on the printed receipt. Used to
  -- render in the same sequence the user saw at the till; not the same as
  -- created_at, which is meaningless when 30 items insert in the same ms.
  position int not null,
  raw_text text not null,
  quantity numeric(10, 3) not null default 1,
  -- May be null when the receipt only printed line totals (common for
  -- bagged produce sold by weight where the unit price is implied).
  unit_price_minor_units int,
  line_total_minor_units int not null,
  -- Phase 3 will populate these via the matcher. Phase 2 always inserts null.
  matched_product_id uuid references public.products(id) on delete set null,
  match_confidence numeric(3, 2),
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id, position)
);

create index receipt_items_receipt_idx on public.receipt_items (receipt_id, position);
create index receipt_items_matched_product_idx
  on public.receipt_items (matched_product_id)
  where matched_product_id is not null;

create trigger receipt_items_set_updated_at
  before update on public.receipt_items
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.receipt_items enable row level security;

-- Read access piggybacks on receipt ownership: a user sees the line items of
-- their own receipts and only those. The exists() subquery is fine here —
-- the index on receipts(id) is the primary key, so the lookup is O(1).
create policy "Users read items of their own receipts"
  on public.receipt_items for select
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id
        and r.user_id = auth.uid()
    )
  );

-- =============================================================================
-- Grants
-- =============================================================================
-- No anon access; receipts are user-scoped. No insert/update/delete for
-- authenticated either — only the service-role Edge Function writes here.
revoke all on public.receipt_items from anon, authenticated;
grant select on public.receipt_items to authenticated;
