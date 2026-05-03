import Link from 'next/link';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import NewProductForm from './NewProductForm';

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ProductsPage({ searchParams }: Props) {
  const { q: qRaw } = await searchParams;
  const q = (qRaw ?? '').trim();

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('products')
    .select('id, name, brand, upc, image_url, category')
    .order('name', { ascending: true })
    .limit(100);

  if (q.length > 0) {
    // ilike on name OR brand. PostgREST `or()` joins both clauses; we
    // escape the % wildcards in the user input to prevent runaway
    // patterns (a literal % in the query would otherwise match anything).
    const escaped = q.replace(/[%_]/g, '\\$&');
    query = query.or(`name.ilike.%${escaped}%,brand.ilike.%${escaped}%`);
  }

  const { data, error } = await query;

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6">
        <p className="text-danger">Failed to load products: {error.message}</p>
      </div>
    );
  }

  const rows = data ?? [];
  const withImage = rows.filter((r) => r.image_url).length;

  // Headcount of products eligible for the image queue (no image, not
  // skipped, has a UPC). One extra round-trip but cheap thanks to the
  // partial index from migration 0018.
  const { count: imageQueueCount } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .is('image_url', null)
    .eq('image_skipped', false)
    .not('upc', 'is', null);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Products</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/products/images"
            className="text-sm border border-border rounded px-2 py-1 hover:bg-bg"
          >
            Image queue
            {imageQueueCount && imageQueueCount > 0 ? (
              <span className="ml-1.5 text-xs text-muted">{imageQueueCount}</span>
            ) : null}
          </Link>
          <span className="text-sm text-muted">
            {rows.length} shown{q ? ` for "${q}"` : ''} · {withImage} with admin image
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <form className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name or brand…"
            className="flex-1 border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            className="bg-text text-bg rounded px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Search
          </button>
          {q ? (
            <Link
              href="/products"
              className="text-sm text-muted hover:text-text px-3 py-2"
            >
              Clear
            </Link>
          ) : null}
        </form>
        <NewProductForm />
      </div>

      {rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-10 text-center">
          <p className="text-text font-medium">
            {q ? 'No products match.' : 'No products yet.'}
          </p>
          {!q ? (
            <p className="text-sm text-muted mt-1">
              The catalog is empty. Products land here as they're added (seed,
              auto-create from receipts, or admin actions).
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
          {rows.map((p) => (
            <li key={p.id} className="hover:bg-bg">
              <Link href={`/products/${p.id}`} className="flex items-center gap-3 px-3 py-2.5">
                <div className="w-10 h-10 rounded bg-bg border border-border overflow-hidden shrink-0 flex items-center justify-center">
                  {p.image_url ? (
                    // Plain <img> — Tailwind/Next image wrapper would require
                    // domain config for Supabase storage, and the catalog
                    // bucket is small so the optimization isn't worth it
                    // here. eslint-disable-next-line @next/next/no-img-element
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-muted uppercase">none</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted truncate">
                    {p.brand ?? '—'}
                    {p.upc ? ` · ${p.upc}` : ''}
                    {p.category ? ` · ${p.category}` : ''}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rows.length === 100 ? (
        <p className="text-xs text-muted text-center">
          Showing first 100 — refine the search to narrow down.
        </p>
      ) : null}
    </div>
  );
}
