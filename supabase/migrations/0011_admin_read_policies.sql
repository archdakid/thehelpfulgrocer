-- Admin panel Phase 1 (F8) — read policies for the queue UI.
--
-- The Phase 3 receipt pipeline routes everything-needing-attention to
-- `flagged_items`, which is admin-RLS'd. But to render a queue row the
-- admin UI also needs to read the underlying `receipt_items`, the parent
-- `receipts` row (for the image and the receipt-level context), and the
-- private storage object. Until now those were all owner-only.
--
-- All three policies key off `profiles.is_admin = true` for the calling
-- user. Writes stay locked to service role — the admin app does its
-- mutations through the `resolve-flagged-item` Edge Function so we don't
-- have to scatter admin write policies across four tables.

-- =============================================================================
-- receipts: admins read everything
-- =============================================================================

create policy "Admins read all receipts"
  on public.receipts for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- =============================================================================
-- receipt_items: admins read everything
-- =============================================================================

create policy "Admins read all receipt items"
  on public.receipt_items for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- =============================================================================
-- storage.objects: admins read every receipt image
-- The owner-scoped policy from 0007 stays as-is; this is an additional
-- SELECT path. PostgREST OR's policies on the same operation, so authed
-- users still get their own files via the existing rule.
-- =============================================================================

create policy "Admins read all receipt images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
