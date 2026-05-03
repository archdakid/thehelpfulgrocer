-- Storage bucket for admin-curated product images. Public read so the
-- mobile app can show them via expo-image without minting signed URLs
-- per render (catalog images aren't sensitive). Admin-only writes —
-- the existing image source priority (OFF → products.image_url →
-- placeholder) means anything in this bucket has been admin-vetted.
--
-- Path convention: {product_id}/{uuid}.{ext}
-- The product_id prefix lets us scope/clean per-product without a
-- separate index, and gives storage.foldername a stable first segment
-- to filter on if we ever need per-product RLS.

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Admin-only insert. The Edge Function `set-product-image` writes the
-- products.image_url with service_role; the upload itself flows through
-- the admin's own JWT, so we gate it here. Profile lookup uses the
-- same `is_admin` flag the rest of the admin panel checks.
create policy "Admins upload product images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- Admin-only delete so the Edge Function (or, in a worst case, an admin
-- with the storage UI) can clean up replaced/cleared images. Service
-- role bypasses RLS so the function itself isn't gated by this; the
-- policy exists so admins can also clean by hand if needed.
create policy "Admins delete product images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- Public read. Bucket is public=true above, but the explicit policy
-- documents intent and protects against the bucket flag being flipped
-- without revisiting policy.
create policy "Public read product images"
  on storage.objects for select
  to public
  using (bucket_id = 'product-images');
