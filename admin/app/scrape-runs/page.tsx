import Link from 'next/link';

import { createSupabaseServerClient } from '@/lib/supabase/server';

// Until `npx supabase gen types typescript --linked` runs against migration
// 0025, the generated types lack `scrape_runs.categories_writes` and the
// typed PostgREST select on the new column collapses the row to a
// SelectQueryError. Hand-rolled row type for both list + detail pages.
type ScrapeRunListRow = {
  id: string;
  vendor: string;
  mode: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  rows_received: number | null;
  locations_upserted: number | null;
  products_upserted: number | null;
  prices_inserted: number | null;
  availability_writes: number | null;
  categories_writes: number | null;
  errors: unknown;
  fatal_error: string | null;
};

const STATUS_TONE: Record<string, string> = {
  running: 'bg-accent/10 text-accent',
  success: 'bg-success/10 text-success',
  partial: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  failed: 'bg-danger/10 text-danger',
};

const STATUS_LABEL: Record<string, string> = {
  running: 'Running',
  success: 'Success',
  partial: 'Partial',
  failed: 'Failed',
};

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '—';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  const ms = end - start;
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export default async function ScrapeRunsPage() {
  const supabase = await createSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // REASON: `scrape_runs.categories_writes` (migration 0025) hasn't landed in
  // mobile/types/database.ts until `gen types --linked` runs. Cast the typed
  // .from() call so the unknown column doesn't poison the row type. Same
  // pattern as the existing `store_locations` casts in Session 19.
  const { data, error } = await (supabase.from('scrape_runs') as any)
    .select(
      `id, vendor, mode, status, started_at, ended_at, rows_received,
       locations_upserted, products_upserted, prices_inserted,
       availability_writes, categories_writes, errors, fatal_error`,
    )
    .order('started_at', { ascending: false })
    .limit(100) as { data: ScrapeRunListRow[] | null; error: { message: string } | null };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Scrape runs</h1>
        <span className="text-sm text-muted">
          Last {data?.length ?? 0} runs · audit-only (writes by ingest-scrape)
        </span>
      </div>

      {error ? (
        <div className="bg-surface border border-border rounded-lg p-6">
          <p className="text-danger">Failed to load: {error.message}</p>
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-10 text-center">
          <p className="text-text font-medium">No scrape runs yet.</p>
          <p className="text-sm text-muted mt-1">
            Once the runner POSTs its first payload to{' '}
            <span className="font-mono">ingest-scrape</span>, runs land here.
          </p>
        </div>
      ) : (
        <ul className="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
          {(data ?? []).map((row) => {
            const tone = STATUS_TONE[row.status] ?? 'bg-border text-muted';
            const label = STATUS_LABEL[row.status] ?? row.status;
            const errorCount = Array.isArray(row.errors)
              ? row.errors.length
              : 0;
            return (
              <li key={row.id} className="hover:bg-bg">
                <Link
                  href={`/scrape-runs/${row.id}`}
                  className="block px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-block text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${tone}`}
                    >
                      {label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-medium uppercase">
                          {row.vendor}
                        </span>
                        <span className="text-xs text-muted">{row.mode}</span>
                        <span className="text-xs text-muted">
                          {new Date(row.started_at).toLocaleString()}
                        </span>
                        <span className="text-[11px] font-mono text-muted">
                          {formatDuration(row.started_at, row.ended_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-1 truncate">
                        {row.locations_upserted} locations ·{' '}
                        {row.products_upserted} products ·{' '}
                        {row.prices_inserted} prices ·{' '}
                        {row.availability_writes} availability ·{' '}
                        {row.categories_writes ?? 0} categories
                        {errorCount > 0 ? ` · ${errorCount} row error${errorCount === 1 ? '' : 's'}` : ''}
                        {row.fatal_error ? ` · ${row.fatal_error.slice(0, 80)}` : ''}
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
