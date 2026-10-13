import Link from 'next/link';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import ScraperControlPanel, {
  type VendorSummary,
} from './ScraperControlPanel';

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

const VENDOR_META: Array<{
  key: 'superpharm' | 'massy' | 'pricesmart';
  label: string;
}> = [
  { key: 'superpharm', label: 'SuperPharm' },
  { key: 'massy', label: 'Massy Stores' },
  { key: 'pricesmart', label: 'PriceSmart' },
];

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

type Props = {
  searchParams: Promise<{ vendor?: string }>;
};

export default async function ScrapeRunsPage({ searchParams }: Props) {
  const { vendor: vendorFilterRaw } = await searchParams;
  const vendorFilter = VENDOR_META.find((v) => v.key === vendorFilterRaw)?.key ?? 'all';

  const supabase = await createSupabaseServerClient();

  let listQuery = supabase
    .from('scrape_runs')
    .select(
      `id, vendor, mode, status, started_at, ended_at, rows_received,
       locations_upserted, products_upserted, prices_inserted,
       availability_writes, categories_writes, errors, fatal_error`,
    )
    .order('started_at', { ascending: false })
    .limit(100);

  if (vendorFilter !== 'all') {
    listQuery = listQuery.eq('vendor', vendorFilter);
  }

  // Fetch latest runs per vendor in parallel so the freshness cards are accurate
  // even when one vendor's 100 chunks push another vendor off the top-100 list.
  const [listRes, spRes, massyRes, psRes] = await Promise.all([
    listQuery,
    supabase
      .from('scrape_runs')
      .select('vendor, status, started_at, products_upserted, prices_inserted')
      .eq('vendor', 'superpharm')
      .order('started_at', { ascending: false })
      .limit(200),
    supabase
      .from('scrape_runs')
      .select('vendor, status, started_at, products_upserted, prices_inserted')
      .eq('vendor', 'massy')
      .order('started_at', { ascending: false })
      .limit(200),
    supabase
      .from('scrape_runs')
      .select('vendor, status, started_at, products_upserted, prices_inserted')
      .eq('vendor', 'pricesmart')
      .order('started_at', { ascending: false })
      .limit(200),
  ]);

  const { data, error } = listRes;

  const byVendorRows = {
    superpharm: spRes.data ?? [],
    massy: massyRes.data ?? [],
    pricesmart: psRes.data ?? [],
  };

  const vendorSummaries: VendorSummary[] = VENDOR_META.map(({ key, label }) => {
    const vRows = byVendorRows[key];
    const latest = vRows[0] ?? null;
    const latestSuccess =
      vRows.find((r) => r.status === 'success' || r.status === 'partial') ??
      null;
    // Sum counters across chunks belonging to the most recent batch (within 2h of latest run)
    const latestTime = latest ? new Date(latest.started_at).getTime() : 0;
    const recentSessionRows = latest
      ? vRows.filter(
          (r) => latestTime - new Date(r.started_at).getTime() <= 2 * 3600_000,
        )
      : [];

    return {
      vendor: key,
      displayName: label,
      lastRunAt: latest?.started_at ?? null,
      lastSuccessAt: latestSuccess?.started_at ?? null,
      lastStatus: latest?.status ?? null,
      totalRunsShown: vRows.length,
      recentProductsUpserted: recentSessionRows.reduce(
        (acc, r) => acc + (r.products_upserted ?? 0),
        0,
      ),
      recentPricesInserted: recentSessionRows.reduce(
        (acc, r) => acc + (r.prices_inserted ?? 0),
        0,
      ),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Scrape runs &amp; Control Center</h1>
        <span className="text-sm text-muted">
          Showing last {data?.length ?? 0} chunk runs
        </span>
      </div>

      <ScraperControlPanel vendors={vendorSummaries} />

      <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
        <nav className="flex gap-2 flex-wrap">
          {[
            { key: 'all', label: 'All vendors' },
            ...VENDOR_META,
          ].map((tab) => {
            const active = tab.key === vendorFilter;
            const href =
              tab.key === 'all'
                ? '/scrape-runs'
                : `/scrape-runs?vendor=${tab.key}`;
            return (
              <Link
                key={tab.key}
                href={href}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  active
                    ? 'bg-text text-bg border-text'
                    : 'bg-surface text-text border-border hover:bg-bg'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {error ? (
        <div className="bg-surface border border-border rounded-lg p-6">
          <p className="text-danger">Failed to load: {error.message}</p>
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-10 text-center">
          <p className="text-text font-medium">No scrape runs found.</p>
          <p className="text-sm text-muted mt-1">
            Use the control panel above to trigger a scrape or cached ingest.
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
