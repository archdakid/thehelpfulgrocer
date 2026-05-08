import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/server';

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

type RowError = {
  kind: string;
  detail: string;
  rowIndex?: number;
};

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatBytes(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '— (still running)';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export default async function ScrapeRunDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: run, error } = await supabase
    .from('scrape_runs')
    .select(
      `id, vendor, mode, status, started_at, ended_at, rows_received,
       locations_upserted, products_upserted, prices_inserted,
       availability_writes, errors, fatal_error, payload_size_bytes,
       triggered_by`,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6">
        <p className="text-danger">Failed to load: {error.message}</p>
      </div>
    );
  }
  if (!run) notFound();

  const tone = STATUS_TONE[run.status] ?? 'bg-border text-muted';
  const label = STATUS_LABEL[run.status] ?? run.status;
  const errors: RowError[] = Array.isArray(run.errors)
    ? (run.errors as RowError[])
    : [];

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Link href="/scrape-runs" className="text-sm text-accent hover:underline">
          ← Scrape runs
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold uppercase">{run.vendor}</h1>
            <span className="text-sm text-muted">{run.mode}</span>
          </div>
          <span
            className={`inline-block text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${tone}`}
          >
            {label}
          </span>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Field label="Started">
          {new Date(run.started_at).toLocaleString()}
        </Field>
        <Field label="Duration">
          {formatDuration(run.started_at, run.ended_at)}
        </Field>
        <Field label="Rows received">
          <Mono>{run.rows_received}</Mono>
        </Field>
        <Field label="Payload size">
          <Mono>{formatBytes(run.payload_size_bytes)}</Mono>
        </Field>
        <Field label="Locations upserted">
          <Mono>{run.locations_upserted}</Mono>
        </Field>
        <Field label="Products upserted">
          <Mono>{run.products_upserted}</Mono>
        </Field>
        <Field label="Prices inserted">
          <Mono>{run.prices_inserted}</Mono>
        </Field>
        <Field label="Availability writes">
          <Mono>{run.availability_writes}</Mono>
        </Field>
      </div>

      {run.fatal_error ? (
        <div className="bg-danger/10 border border-danger/40 rounded-lg p-4">
          <p className="text-xs font-semibold text-danger uppercase tracking-wider mb-1">
            Fatal error
          </p>
          <pre className="text-xs whitespace-pre-wrap font-mono text-text">
            {run.fatal_error}
          </pre>
        </div>
      ) : null}

      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
            Row errors
          </h2>
          <span className="text-xs text-muted">{errors.length}</span>
        </div>
        {errors.length === 0 ? (
          <p className="text-sm text-muted">No row-level errors.</p>
        ) : (
          <ul className="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
            {errors.map((err, idx) => (
              <li key={idx} className="px-4 py-2 text-sm">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-muted">
                    {err.kind}
                  </span>
                  {typeof err.rowIndex === 'number' ? (
                    <span className="text-[11px] font-mono text-muted">
                      row #{err.rowIndex}
                    </span>
                  ) : null}
                </div>
                <p className="text-text break-words">{err.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between sm:justify-start sm:gap-2">
      <span className="text-muted">{label}</span>
      <span className="text-text">{children}</span>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono">{children}</span>;
}
