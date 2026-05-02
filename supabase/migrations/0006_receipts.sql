-- Receipts: Phase 1 schema. Each row tracks one receipt image uploaded by a
-- signed-in user. Phase 1 does NOT include receipt_items — that lands when
-- the OCR Edge Function is wired up. Until then `status` cycles through
-- 'uploaded' → ('processing' → 'processed' | 'failed') under server-side
-- jobs, never the client.
--
-- Image bytes live in storage bucket 'receipts/' (created in 0007); the
-- `image_path` column holds the object key relative to that bucket. Per
-- DECISIONS.md (2026-04-30 — receipts as user-attributed price source),
-- raw OCR text will be retained alongside parsed data so we can re-match
-- products later — that's a column added in the OCR-phase migration.

create type public.receipt_status as enum ('uploaded', 'processing', 'processed', 'failed');

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  image_path text not null,
  status public.receipt_status not null default 'uploaded',
  notes text,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The list view is "my receipts, newest first", so an index on
-- (user_id, created_at desc) keeps it cheap as the table grows.
create index receipts_user_idx on public.receipts (user_id, created_at desc);

create trigger receipts_set_updated_at
  before update on public.receipts
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.receipts enable row level security;

create policy "Users can read their own receipts"
  on public.receipts for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert their own receipts"
  on public.receipts for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their own receipts"
  on public.receipts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- Grants
-- =============================================================================
-- Block anon entirely; receipts are inherently user-scoped.
revoke select on public.receipts from anon;

-- Column-level grants gate which fields a client can touch. status is
-- intentionally excluded — only the server-side OCR job (running with the
-- service role) is allowed to advance status. The user's metadata lives
-- in store_id / notes / captured_at; image_path is set once at insert and
-- treated as immutable thereafter.
grant insert (user_id, store_id, image_path, captured_at, notes)
  on public.receipts to authenticated;
grant update (store_id, captured_at, notes)
  on public.receipts to authenticated;
