'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { formatMoney, reasonLabel, reasonTone } from '@/lib/format';
import { resolveFlaggedItemsBulk } from './actions';

// Mirrors the embed shape from page.tsx. Kept loose because the
// PostgREST types come back as nested unions and the row renderer
// only reads a handful of fields — typing every level would add noise
// without catching real bugs (the server query is the source of truth).
export type QueueRow = {
  id: string;
  reason: 'unmatched' | 'low_confidence' | 'auto_created_product';
  auto_created_product: { id: string; name: string } | null;
  receipt_item: {
    id: string;
    raw_text: string;
    line_total_minor_units: number;
    match_confidence: number | null;
    matched_product: { id: string; name: string } | null;
    receipt: {
      id: string;
      currency: string | null;
      store: { id: string; name: string } | null;
    } | null;
  } | null;
};

type Props = {
  rows: QueueRow[];
};

export default function QueueList({ rows }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<Array<{ id: string; error: string }>>([]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const selectedCount = selectedIds.length;

  // "Verify selected" maps to `confirm`, which the Edge Function rejects
  // for `unmatched` (no matched_product to confirm). Disable the button
  // when any selected row is unmatched so the admin doesn't get a wall
  // of partial-failure errors.
  const hasUnmatchedSelected = useMemo(
    () => rows.some((r) => selected.has(r.id) && r.reason === 'unmatched'),
    [rows, selected],
  );

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const r of rows) next.delete(r.id);
        return next;
      }
      const next = new Set(prev);
      for (const r of rows) next.add(r.id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const submit = (action: 'confirm' | 'reject') => {
    setError(null);
    setPartialErrors([]);
    const ids = selectedIds;
    startTransition(async () => {
      const res = await resolveFlaggedItemsBulk(ids, action);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Keep failures selected so the admin can retry / open them
      // individually; drop successes.
      const failedIds = new Set(res.errors.map((e) => e.id));
      setSelected(failedIds);
      setPartialErrors(res.errors);
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-lg p-10 text-center">
        <p className="text-text font-medium">Queue is clear.</p>
        <p className="text-sm text-muted mt-1">
          Nothing matches this filter. Receipts that need review will land here as they
          come in.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
        <li className="px-4 py-2 bg-bg flex items-center gap-3 text-xs text-muted">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            aria-label="Select all visible"
            className="h-4 w-4 accent-accent cursor-pointer"
          />
          <span>{allVisibleSelected ? 'Deselect all' : 'Select all'}</span>
        </li>
        {rows.map((row) => {
          const item = row.receipt_item;
          const receipt = item?.receipt;
          const store = receipt?.store?.name ?? 'Unknown store';
          const matched =
            row.auto_created_product?.name ?? item?.matched_product?.name ?? null;
          const tone = reasonTone(row.reason);
          const isSelected = selected.has(row.id);

          return (
            <li key={row.id} className={`flex items-stretch ${isSelected ? 'bg-bg' : 'hover:bg-bg'}`}>
              <label className="flex items-center pl-4 pr-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(row.id)}
                  aria-label={`Select ${item?.raw_text ?? row.id}`}
                  className="h-4 w-4 accent-accent cursor-pointer"
                />
              </label>
              <Link href={`/queue/${row.id}`} className="flex-1 block px-2 py-3 min-w-0">
                <div className="flex items-start gap-3">
                  <span
                    className={`inline-block text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${tone}`}
                  >
                    {reasonLabel(row.reason)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item?.raw_text}</p>
                    <p className="text-xs text-muted mt-0.5 truncate">
                      {store}
                      {matched ? ` · matched: ${matched}` : ''}
                      {item?.match_confidence != null
                        ? ` · score ${item.match_confidence.toFixed(2)}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-sm tabular-nums text-text shrink-0 pr-4">
                    {formatMoney(item?.line_total_minor_units ?? 0, receipt?.currency ?? 'TTD')}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {partialErrors.length > 0 ? (
        <div className="mt-3 bg-surface border border-danger/30 rounded-lg p-3 text-sm">
          <p className="text-danger font-medium">
            {partialErrors.length} item{partialErrors.length === 1 ? '' : 's'} failed — still
            selected so you can retry or open them individually.
          </p>
          <ul className="mt-1 text-xs text-muted list-disc list-inside space-y-0.5">
            {partialErrors.slice(0, 5).map((e) => (
              <li key={e.id}>
                <span className="font-mono">{e.id.slice(0, 8)}</span> — {e.error}
              </li>
            ))}
            {partialErrors.length > 5 ? (
              <li>+ {partialErrors.length - 5} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {selectedCount > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border shadow-lg z-40">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">{selectedCount} selected</span>
            {error ? <span className="text-sm text-danger">{error}</span> : null}
            <div className="flex-1" />
            <button
              type="button"
              onClick={clearSelection}
              disabled={isPending}
              className="text-sm text-muted hover:text-text disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => submit('reject')}
              disabled={isPending}
              className="bg-surface text-danger border border-danger/40 rounded px-3 py-1.5 text-sm font-medium hover:bg-danger/5 disabled:opacity-50"
            >
              Reject selected
            </button>
            <button
              type="button"
              onClick={() => submit('confirm')}
              disabled={isPending || hasUnmatchedSelected}
              title={
                hasUnmatchedSelected
                  ? 'Unmatched items can\'t be verified — open them to pick a product or use Reject'
                  : undefined
              }
              className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              Verify selected
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
