-- Storage bucket for receipt images. Private — every read goes through a
-- signed URL minted by the client (or the server-side OCR job). Owners
-- write into a folder keyed by their user id so the RLS-style policies on
-- storage.objects can scope access by foldername.
--
-- Path convention: {user_id}/{receipt_id}.{ext}
-- e.g. 9c2c8b1d-…/4ad8e3f2-….jpg

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- A signed-in user can upload into their own folder only. The first
-- foldername segment must equal their auth.uid().
create policy "Users upload to their own receipts folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Symmetric read policy. Signed URLs minted by the service role still
-- work (the OCR job and any future admin-side review tooling read with
-- service_role, which bypasses RLS).
create policy "Users read their own receipts"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
