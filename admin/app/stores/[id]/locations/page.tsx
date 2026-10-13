import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import LocationRow from './LocationRow';
import NewLocationForm from './NewLocationForm';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function StoreLocationsPage({ params }: PageProps) {
  const { id: storeId } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: store, error: storeErr }, { data: locations, error: locErr }] =
    await Promise.all([
      supabase
        .from('stores')
        .select('id, name, region, is_active')
        .eq('id', storeId)
        .maybeSingle(),
      supabase
        .from('store_locations')
        .select(
          'id, store_id, name, external_id, region, is_active, lat, lng, created_at, updated_at',
        )
        .eq('store_id', storeId)
        .order('is_active', { ascending: false })
        .order('name', { ascending: true }),
    ]);

  if (storeErr) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6">
        <p className="text-danger">Failed to load store: {storeErr.message}</p>
      </div>
    );
  }
  if (!store) notFound();

  const rows = locations ?? [];
  const active = rows.filter((r) => r.is_active);
  const inactive = rows.filter((r) => !r.is_active);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Link
          href="/stores"
          className="text-sm text-accent hover:underline"
        >
          ← Stores
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{store.name} · Locations</h1>
          <span className="text-sm text-muted">
            {active.length} active · {inactive.length} inactive
          </span>
        </div>
      </div>

      <NewLocationForm storeId={store.id} />

      {locErr ? (
        <div className="bg-surface border border-danger/40 rounded-lg p-4">
          <p className="text-sm text-danger">Failed to load locations: {locErr.message}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-10 text-center">
          <p className="text-text font-medium">No locations yet.</p>
          <p className="text-sm text-muted mt-1">
            Add the first one above. Scraper runs will also auto-create
            locations on (store, external_id).
          </p>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
              Active
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-muted">No active locations.</p>
            ) : (
              <ul className="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
                {active.map((loc) => (
                  <LocationRow key={loc.id} location={loc} />
                ))}
              </ul>
            )}
          </section>

          {inactive.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
                Inactive
              </h2>
              <ul className="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
                {inactive.map((loc) => (
                  <LocationRow key={loc.id} location={loc} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
