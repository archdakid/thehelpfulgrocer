-- Suppress products from the admin image-candidate queue once an admin
-- has decided no good candidate exists. Without this, every visit to
-- the queue would re-surface the same products we already triaged.
--
-- We use a boolean rather than a tri-state enum because the queue only
-- cares about two states: "needs review" vs "leave alone." If someone
-- later uploads or imports an image, image_url becomes non-null and
-- the queue's filter (`image_url is null and image_skipped = false`)
-- already excludes it — no need to flip image_skipped back.

alter table public.products
  add column image_skipped boolean not null default false;

-- The queue query is `image_url is null and image_skipped = false`,
-- which is highly selective once the catalog grows. A partial index on
-- the unskipped, image-less rows keeps it cheap.
create index products_needs_image_idx
  on public.products (created_at desc)
  where image_url is null and image_skipped = false;
