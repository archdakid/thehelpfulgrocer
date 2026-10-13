'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { runTriageDuplicatesBatch } from './actions';

export default function TriageDuplicatesPanel() {
  const router = useRouter();
  const [batchSize, setBatchSize] = useState(10);
  const [minScoreStr, setMinScoreStr] = useState('');
  const [running, setRunning] = useState(false);
  const [looping, setLooping] = useState(false);
  const stopRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    batches: 0,
    processed: 0,
    merged: 0,
    pack_variants: 0,
    rejected: 0,
    uncertain: 0,
    errors: 0,
    remaining: null as number | null,
  });

  const parseMinScore = (): number | null => {
    const t = minScoreStr.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
  };

  const runSingleBatch = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await runTriageDuplicatesBatch({
        batchSize,
        minScore: parseMinScore(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const r = res.result;
      setStats((prev) => ({
        batches: prev.batches + 1,
        processed: prev.processed + (r.processed ?? 0),
        merged: prev.merged + (r.merged ?? 0),
        pack_variants: prev.pack_variants + (r.pack_variants ?? 0),
        rejected: prev.rejected + (r.rejected ?? 0),
        uncertain: prev.uncertain + (r.uncertain ?? 0),
        errors: prev.errors + (r.errors?.length ?? 0),
        remaining: r.remaining ?? null,
      }));
      router.refresh();
    } finally {
      setRunning(false);
    }
  };

  const startLoop = async () => {
    if (running) return;
    stopRef.current = false;
    setLooping(true);
    setRunning(true);
    setError(null);

    try {
      while (!stopRef.current) {
        const started = Date.now();
        const res = await runTriageDuplicatesBatch({
          batchSize,
          minScore: parseMinScore(),
        });
        if (!res.ok) {
          setError(res.error);
          break;
        }
        const r = res.result;
        setStats((prev) => ({
          batches: prev.batches + 1,
          processed: prev.processed + (r.processed ?? 0),
          merged: prev.merged + (r.merged ?? 0),
          pack_variants: prev.pack_variants + (r.pack_variants ?? 0),
          rejected: prev.rejected + (r.rejected ?? 0),
          uncertain: prev.uncertain + (r.uncertain ?? 0),
          errors: prev.errors + (r.errors?.length ?? 0),
          remaining: r.remaining ?? null,
        }));
        router.refresh();

        if ((r.remaining ?? 0) === 0 || (r.processed ?? 0) === 0) {
          break;
        }
        // Pace to respect NVIDIA NIM 40 RPM (1600ms wall-clock per batch)
        const elapsed = Date.now() - started;
        const wait = Math.max(200, 1600 - elapsed);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    } finally {
      setLooping(false);
      setRunning(false);
    }
  };

  const stopLoop = () => {
    stopRef.current = true;
  };

  return (
    <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-text">
            LLM Duplicate Triage (`triage-duplicates`)
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Classifies <span className="font-mono">potential_duplicate</span>{' '}
            pairs via NVIDIA NIM into <span className="font-mono">merged</span>,{' '}
            <span className="font-mono">pack_variant</span>,{' '}
            <span className="font-mono">rejected</span>, or leaves{' '}
            <span className="font-mono">uncertain</span> for manual review.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span>Batch</span>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              disabled={running}
              className="border border-border rounded px-2 py-1 bg-bg text-text text-xs font-mono"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span>Min score</span>
            <select
              value={minScoreStr}
              onChange={(e) => setMinScoreStr(e.target.value)}
              disabled={running}
              className="border border-border rounded px-2 py-1 bg-bg text-text text-xs font-mono"
            >
              <option value="">Any</option>
              <option value="0.85">≥ 0.85</option>
              <option value="0.75">≥ 0.75</option>
              <option value="0.65">≥ 0.65</option>
            </select>
          </label>

          {!looping ? (
            <>
              <button
                type="button"
                onClick={() => void runSingleBatch()}
                disabled={running}
                className="bg-surface text-text border border-border rounded px-3 py-1.5 text-xs font-medium hover:bg-bg disabled:opacity-50"
              >
                {running ? 'Running batch…' : 'Run 1 batch'}
              </button>
              <button
                type="button"
                onClick={() => void startLoop()}
                disabled={running}
                className="bg-accent text-white rounded px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                Auto-drain queue
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={stopLoop}
              className="bg-danger text-white rounded px-3 py-1.5 text-xs font-medium hover:opacity-90"
            >
              Stop auto-drain
            </button>
          )}
        </div>
      </div>

      {stats.batches > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono bg-bg border border-border rounded px-3 py-2">
          <span>batches: {stats.batches}</span>
          <span>processed: {stats.processed}</span>
          <span className="text-success">merged: {stats.merged}</span>
          <span className="text-accent">pack_variants: {stats.pack_variants}</span>
          <span className="text-muted">rejected: {stats.rejected}</span>
          <span className="text-warn">uncertain: {stats.uncertain}</span>
          {stats.errors > 0 ? (
            <span className="text-danger">errors: {stats.errors}</span>
          ) : null}
          {stats.remaining != null ? (
            <span className="ml-auto font-semibold text-text">
              remaining: {stats.remaining}
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </section>
  );
}
