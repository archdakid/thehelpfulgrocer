-- Receipts insert had a column-grant gap.
--
-- Migration 0006 column-level INSERT grant on `receipts` is
--   (user_id, store_id, image_path, captured_at, notes)
-- but the client provides `id` too — DECISIONS.md 2026-05-01 ("client-
-- generated receipt UUID; storage upload before row insert") commits to
-- the client minting the id so the storage object can be uploaded with
-- that id baked into its path before the row insert. Without `id` in the
-- grant, Postgres rejects the insert with a table-level "permission
-- denied" before RLS even runs — masquerading as an RLS issue.
--
-- The id column is a uuid PK with a default. Granting INSERT on it has
-- no security impact: the unique constraint prevents collisions, and
-- RLS's `user_id = auth.uid()` check still scopes ownership.

grant insert (id, user_id, store_id, image_path, captured_at, notes)
  on public.receipts to authenticated;
