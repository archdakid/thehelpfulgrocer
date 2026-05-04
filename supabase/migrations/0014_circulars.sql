-- F8 Phase 2 — Circular ingest pipeline.
--
-- Admins upload weekly grocery circulars (image scans / PDFs); a Claude
-- vision pass extracts candidate products + prices; admin reviews each
-- candidate and accepts (contributes a price, optionally creates a
-- product) or rejects. The flow mirrors the receipts pipeline but is
-- admin-internal: the mobile app never sees these tables, all rows are
-- admin-only readable.
--
-- Path convention (storage): circulars/{circular_id}.{ext}
-- Single bucket, no per-user folders since only admins write here.

-- =============================================================================
-- circulars — one row per uploaded source image / PDF
-- =============================================================================

create table public.circulars (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  image_path text not null,
  observed_week date not null,
  -- 'uploaded'   row created, file is in storage, parser hasn't started
  -- 'processing' parser is running
  -- 'processed'  parser finished, items live in circular_items
  -- 'failed'     parser hit an error; process_error has the detail
  parse_status text not null default 'uploaded'
    check (parse_status in ('uploaded', 'processing', 'processed', 'failed')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  -- Verbatim model output for debugging / re-matching against an evolved
  -- catalog without re-spending the API call. Same logic as the
  -- "always store raw text alongside parsed data" rule from CLAUDE.md.
  parsed jsonb,
  process_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index circulars_status_idx
  on public.circulars (parse_status, created_at desc);

create trigger circulars_set_updated_at
  before update on public.circulars
  for each row execute function public.set_updated_at();

-- =============================================================================
-- circular_items — one row per candidate (name, price) extracted from a
-- circular. Admin reviews each one. On accept, contributes a `prices` row
-- (and optionally creates a `products` row).
-- =============================================================================

create table public.circular_items (
  id uuid primary key default gen_random_uuid(),
  circular_id uuid not null references public.circulars(id) on delete cascade,
  position integer not null,
  -- Parsed fields, edited by admin during review.
  raw_name text not null,
  brand text,
  size text,
  amount_minor_units integer not null check (amount_minor_units >= 0),
  -- Pre-match: Edge Function runs match_receipt_text() at parse time so
  -- the admin sees suggestions inline. confidence is null for items the
  -- matcher couldn't reach (no candidate above the 0.30 floor).
  matched_product_id uuid references public.products(id) on delete set null,
  match_confidence numeric(4,3),
  -- Review state. 'pending' is the default — accept/reject is a
  -- one-way transition (idempotent in the resolve function).
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  -- On accept, the contributed price + (if newly created) the product.
  -- Both ON DELETE SET NULL: deleting the price doesn't kill the audit
  -- row, deleting the product is the admin's escape hatch for cleanup.
  contributed_price_id uuid references public.prices(id) on delete set null,
  contributed_product_id uuid references public.products(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (circular_id, position)
);

create index circular_items_status_idx
  on public.circular_items (circular_id, status, position);

-- =============================================================================
-- RLS — admin-only on both tables
-- =============================================================================

alter table public.circulars enable row level security;
alter table public.circular_items enable row level security;

create policy "Admins read circulars"
  on public.circulars for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

create policy "Admins read circular items"
  on public.circular_items for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- Writes go entirely through the parse-circular and resolve-circular-item
-- Edge Functions running with service_role. The default privileges from
-- 0012 grant SELECT/INSERT/UPDATE/DELETE to service_role automatically.
-- No write policy here — defense in depth.

-- =============================================================================
-- Grants — lock out anon/authenticated writes; SELECT is policy-gated above.
-- =============================================================================

revoke all on public.circulars from anon, authenticated;
grant select on public.circulars to authenticated;

revoke all on public.circular_items from anon, authenticated;
grant select on public.circular_items to authenticated;

-- =============================================================================
-- Storage bucket — admin upload, admin read.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('circulars', 'circulars', false)
on conflict (id) do nothing;

create policy "Admins upload circulars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'circulars'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

create policy "Admins read circulars"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'circulars'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

create policy "Admins delete circulars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'circulars'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
