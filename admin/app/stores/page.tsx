import { createSupabaseServerClient } from '@/lib/supabase/server';
import NewStoreForm from './NewStoreForm';
import StoreRow from './StoreRow';

export default async function StoresPage() {
  const supabase = await createSupabaseServerClient();

  // Admins see active + inactive thanks to the policy added in 0013.
  // Sort: active first (so the working set is at the top), then by name.
  const { data, error } = await supabase
    .from('stores')
    .select('id, name, region, is_active, created_at, updated_at')
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6">
        <p className="text-danger">Failed to load stores: {error.message}</p>
      </div>
    );
  }

  const stores = data ?? [];
  const active = stores.filter((s) => s.is_active);
  const inactive = stores.filter((s) => !s.is_active);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Stores</h1>
        <span className="text-sm text-muted">
          {active.length} active · {inactive.length} inactive
        </span>
      </div>

      <NewStoreForm />

      {stores.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-10 text-center">
          <p className="text-text font-medium">No stores yet.</p>
          <p className="text-sm text-muted mt-1">Add the first one above.</p>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
              Active
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-muted">No active stores.</p>
            ) : (
              <ul className="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
                {active.map((store) => (
                  <StoreRow key={store.id} store={store} />
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
                {inactive.map((store) => (
                  <StoreRow key={store.id} store={store} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
