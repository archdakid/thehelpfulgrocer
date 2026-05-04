import Link from 'next/link';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import ImageCandidateRow from './ImageCandidateRow';

// Image candidate review queue: products lacking an admin image_url
// that haven't been explicitly skipped. Filtered to products with a
// real UPC, since OFF lookup needs one — products without a UPC
// (loose produce, bakery items) can only get an image via the manual
// upload on the detail page.
export default async function ProductImagesPage() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('products')
    .select('id, name, brand, upc, category')
    .is('image_url', null)
    .eq('image_skipped', false)
    .not('upc', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6">
        <p className="text-danger">Failed to load queue: {error.message}</p>
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/products" className="text-sm text-muted hover:text-text">
          ← Products
        </Link>
        <h1 className="text-xl font-semibold mt-1">Image candidate queue</h1>
        <p className="text-sm text-muted mt-1">
          Products without an admin image. Click <em>Fetch candidates</em> to
          pull options from Open Food Facts, then import the best one. Skip
          removes the product from this queue (it can still get an image
          via the manual upload on the detail page).
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-10 text-center">
          <p className="text-text font-medium">Queue empty.</p>
          <p className="text-sm text-muted mt-1">
            Every product with a UPC either has an image or has been skipped.
          </p>
        </div>
      ) : (
        <ul className="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
          {rows.map((p) => (
            <ImageCandidateRow
              key={p.id}
              productId={p.id}
              name={p.name}
              brand={p.brand}
              upc={p.upc}
              category={p.category}
            />
          ))}
        </ul>
      )}

      {rows.length === 100 ? (
        <p className="text-xs text-muted text-center">
          Showing newest 100 — process or skip rows to surface older ones.
        </p>
      ) : null}
    </div>
  );
}
