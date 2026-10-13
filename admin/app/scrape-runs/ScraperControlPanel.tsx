'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { ScraperJobStatus } from '../api/scrapers/route';

export type VendorSummary = {
  vendor: 'superpharm' | 'massy' | 'pricesmart';
  displayName: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: string | null;
  totalRunsShown: number;
  recentProductsUpserted: number;
  recentPricesInserted: number;
};

type Props = {
  vendors: VendorSummary[];
};

function getFreshness(iso: string | null): {
  label: string;
  tone: string;
  ageText: string;
} {
  if (!iso) {
    return {
      label: 'Never run',
      tone: 'bg-danger/10 text-danger',
      ageText: 'No runs recorded',
    };
  }
  const ms = Date.now() - new Date(iso).getTime();
  const hours = ms / (1000 * 60 * 60);
  const days = Math.floor(hours / 24);

  const ageText =
    hours < 1
      ? `${Math.max(1, Math.round(hours * 60))}m ago`
      : hours < 48
        ? `${Math.round(hours)}h ago`
        : `${days}d ago`;

  if (hours <= 24) {
    return {
      label: 'Fresh (<24h)',
      tone: 'bg-success/10 text-success',
      ageText,
    };
  }
  if (days <= 7) {
    return {
      label: 'Stale (>24h)',
      tone: 'bg-warn/10 text-warn',
      ageText,
    };
  }
  return {
    label: `Outdated (${days}d)`,
    tone: 'bg-danger/10 text-danger',
    ageText,
  };
}

export default function ScraperControlPanel({ vendors }: Props) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ScraperJobStatus[]>([]);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasRunningJob = jobs.some((j) => j.status === 'running');

  useEffect(() => {
    let active = true;
    const fetchJobs = async () => {
      try {
        const res = await fetch('/api/scrapers', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { jobs?: ScraperJobStatus[] };
        if (active && json.jobs) {
          setJobs(json.jobs);
        }
      } catch {
        // ignore network hiccup
      }
    };
    void fetchJobs();

    const interval = setInterval(() => {
      void fetchJobs();
      if (hasRunningJob) {
        router.refresh();
      }
    }, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [hasRunningJob, router]);

  const triggerJob = async (
    vendor: 'superpharm' | 'massy' | 'pricesmart' | 'all',
    mode: 'full' | 'ingest-only' | 'backfill',
  ) => {
    const key = `${vendor}:${mode}`;
    setTriggering(key);
    setError(null);
    try {
      const res = await fetch('/api/scrapers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor, mode }),
      });
      const json = (await res.json()) as {
        error?: string;
        jobs?: ScraperJobStatus[];
      };
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status})`);
        return;
      }
      if (json.jobs) setJobs(json.jobs);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTriggering(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
            Vendor Freshness &amp; Scraper Control Center
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Trigger live scrapes, re-ingest cached JSON dumps, or run cross-store
            duplicate matching directly from the admin panel.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void triggerJob('all', 'ingest-only')}
            disabled={triggering !== null || hasRunningJob}
            className="bg-surface text-text border border-border rounded px-3 py-1.5 text-xs font-medium hover:bg-bg disabled:opacity-50"
          >
            Ingest All Cached JSON
          </button>
          <button
            type="button"
            onClick={() => void triggerJob('all', 'full')}
            disabled={triggering !== null || hasRunningJob}
            className="bg-accent text-white rounded px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            Scrape &amp; Ingest All Vendors
          </button>
          <button
            type="button"
            onClick={() => void triggerJob('all', 'backfill')}
            disabled={triggering !== null || hasRunningJob}
            className="bg-surface text-accent border border-accent/40 rounded px-3 py-1.5 text-xs font-medium hover:bg-accent/5 disabled:opacity-50"
          >
            Backfill Duplicate Matches
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-surface border border-danger/40 rounded-lg p-3 text-xs text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {vendors.map((v) => {
          const freshness = getFreshness(v.lastSuccessAt ?? v.lastRunAt);
          const isVendorRunning = jobs.some(
            (j) =>
              j.status === 'running' &&
              (j.vendor === v.vendor || j.vendor === 'all'),
          );

          return (
            <div
              key={v.vendor}
              className="bg-surface border border-border rounded-lg p-4 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-text">
                    {v.displayName}
                  </h3>
                  <span
                    className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${freshness.tone}`}
                  >
                    {freshness.label}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-y-1 text-xs">
                  <dt className="text-muted">Last activity</dt>
                  <dd className="text-right font-mono">{freshness.ageText}</dd>
                  <dt className="text-muted">Last timestamp</dt>
                  <dd className="text-right text-muted truncate">
                    {v.lastRunAt
                      ? new Date(v.lastRunAt).toLocaleDateString()
                      : '—'}
                  </dd>
                  <dt className="text-muted">Products (recent)</dt>
                  <dd className="text-right font-mono">
                    {v.recentProductsUpserted.toLocaleString()}
                  </dd>
                  <dt className="text-muted">Prices (recent)</dt>
                  <dd className="text-right font-mono">
                    {v.recentPricesInserted.toLocaleString()}
                  </dd>
                </dl>
              </div>

              <div className="pt-2 border-t border-border flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => void triggerJob(v.vendor, 'full')}
                  disabled={triggering !== null || isVendorRunning}
                  className="flex-1 bg-accent text-white rounded px-2.5 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {isVendorRunning ? 'Running…' : 'Full Scrape + Ingest'}
                </button>
                <button
                  type="button"
                  onClick={() => void triggerJob(v.vendor, 'ingest-only')}
                  disabled={triggering !== null || isVendorRunning}
                  className="bg-bg text-text border border-border rounded px-2.5 py-1.5 text-xs font-medium hover:bg-surface disabled:opacity-50"
                  title="Ingest existing JSON dump on disk without re-scraping the retailer website"
                >
                  Ingest Cached
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {jobs.length > 0 ? (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
              Recent Background Jobs ({jobs.length})
            </h3>
            {hasRunningJob ? (
              <span className="text-xs text-accent font-mono animate-pulse">
                ● Live polling every 3s…
              </span>
            ) : null}
          </div>
          <div className="space-y-2">
            {jobs.slice(0, 3).map((job) => (
              <div
                key={job.id}
                className="bg-bg border border-border rounded p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className={`uppercase font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                        job.status === 'running'
                          ? 'bg-accent/10 text-accent'
                          : job.status === 'completed'
                            ? 'bg-success/10 text-success'
                            : 'bg-danger/10 text-danger'
                      }`}
                    >
                      {job.status}
                    </span>
                    <span className="font-semibold uppercase">
                      {job.vendor}
                    </span>
                    <span className="text-muted font-mono">mode={job.mode}</span>
                    {job.pid ? (
                      <span className="text-muted font-mono">PID {job.pid}</span>
                    ) : null}
                  </div>
                  <span className="text-muted">
                    Started {new Date(job.startedAt).toLocaleTimeString()}
                    {job.endedAt
                      ? ` · Ended ${new Date(job.endedAt).toLocaleTimeString()}`
                      : ''}
                  </span>
                </div>
                {job.logTail.length > 0 ? (
                  <pre className="text-[11px] font-mono bg-surface border border-border rounded p-2.5 max-h-48 overflow-y-auto whitespace-pre-wrap text-muted">
                    {job.logTail.join('\n')}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
