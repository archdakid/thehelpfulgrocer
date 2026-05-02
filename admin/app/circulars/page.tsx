import Link from 'next/link';

import { createSupabaseServerClient } from '@/lib/supabase/server';

const STATUS_TONE: Record<string, string> = {
  uploaded: 'bg-border text-muted',
  processing: 'bg-accent/10 text-accent',
  processed: 'bg-success/10 text-success',
  failed: 'bg-danger/10 text-danger',
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Queued',
  processing: 'Parsing',
  processed: 'Ready',
  failed: 'Failed',
};

export default async function CircularsListPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('circulars')
    .select(
      `
        id, observed_week, parse_status, processed_at, created_at, process_error,
        store:stores ( id, name, region )
      `,
    )
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Circulars</h1>
        <Link
          href="/circulars/new"
          className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          Upload circular
        </Link>
      </div>

      {error ? (
        <div className="bg-surface border border-border rounded-lg p-6">
          <p className="text-danger">Failed to load: {error.message}</p>
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-10 text-center">
          <p className="text-text font-medium">No circulars uploaded yet.</p>
          <p className="text-sm text-muted mt-1">
            Upload your first weekly circular to seed the price catalog.
          </p>
        </div>
      ) : (
        <ul className="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
          {(data ?? []).map((row) => {
            const tone = STATUS_TONE[row.parse_status] ?? 'bg-border text-muted';
            const label = STATUS_LABEL[row.parse_status] ?? row.parse_status;
            return (
              <li key={row.id} className="hover:bg-bg">
                <Link href={`/circulars/${row.id}`} className="block px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-block text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${tone}`}
                    >
                      {label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {row.store?.name ?? 'Unknown store'}
                      </p>
                      <p className="text-xs text-muted mt-0.5 truncate">
                        Week of {row.observed_week} · uploaded{' '}
                        {new Date(row.created_at).toLocaleString()}
                        {row.process_error
                          ? ` · ${row.process_error.slice(0, 80)}`
                          : ''}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
