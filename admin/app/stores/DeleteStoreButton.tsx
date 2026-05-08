'use client';

import { useState, useTransition } from 'react';

import {
  deleteStore,
  previewDeleteStore,
  type StoreDeleteCounts,
} from './actions';

type Props = {
  storeId: string;
  storeName: string;
  disabled?: boolean;
};

// Inline delete trigger for store rows. Mirrors products' DeleteSection
// shape (preview → modal with cascade counts → name-typed confirm) but
// embedded in the row instead of its own danger-zone card. Stores get
// hard-deleted rarely enough that a separate detail page isn't justified.
export default function DeleteStoreButton({ storeId, storeName, disabled }: Props) {
  const [stage, setStage] = useState<'idle' | 'preview'>('idle');
  const [counts, setCounts] = useState<StoreDeleteCounts | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openPreview = () => {
    setError(null);
    setTyped('');
    setBlocked(null);
    startTransition(async () => {
      const res = await previewDeleteStore(storeId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCounts(res.counts);
      setBlocked(res.blocked);
      setStage('preview');
    });
  };

  const cancel = () => {
    setStage('idle');
    setCounts(null);
    setBlocked(null);
    setTyped('');
    setError(null);
  };

  const confirm = () => {
    if (typed.trim() !== storeName) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteStore(storeId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      cancel();
    });
  };

  const typedMatches = typed.trim() === storeName;

  return (
    <>
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={openPreview}
        className="text-sm text-danger hover:underline disabled:opacity-50"
      >
        {isPending && stage === 'idle' ? 'Checking…' : 'Delete'}
      </button>
      {error && stage === 'idle' ? (
        <span className="text-xs text-danger">{error}</span>
      ) : null}

      {stage === 'preview' && counts ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface border border-border rounded-lg p-5 max-w-md w-full space-y-4">
            <div>
              <h3 className="text-base font-semibold">Delete this store?</h3>
              <p className="text-sm text-muted mt-1">
                Permanently deletes{' '}
                <span className="text-text font-medium">{storeName}</span>{' '}
                along with the cascading rows below.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Will be deleted
                </p>
                <ul className="text-sm space-y-1 bg-bg border border-border rounded p-3">
                  <li className="flex justify-between">
                    <span className="text-muted">Price observations</span>
                    <span className="font-mono">{counts.prices}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted">Availability rows</span>
                    <span className="font-mono">{counts.availability}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted">Branch locations</span>
                    <span className="font-mono">{counts.locations}</span>
                  </li>
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Will be unlinked
                </p>
                <ul className="text-sm space-y-1 bg-bg border border-border rounded p-3">
                  <li className="flex justify-between">
                    <span className="text-muted">Receipts (kept, store cleared)</span>
                    <span className="font-mono">{counts.receipts}</span>
                  </li>
                </ul>
              </div>

              {counts.circulars > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-danger uppercase tracking-wider mb-1">
                    Blocks delete
                  </p>
                  <ul className="text-sm space-y-1 bg-danger/10 border border-danger/40 rounded p-3">
                    <li className="flex justify-between">
                      <span className="text-text">Circulars referencing this store</span>
                      <span className="font-mono">{counts.circulars}</span>
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>

            {blocked ? (
              <p className="text-sm text-danger">{blocked}</p>
            ) : (
              <label className="block text-sm">
                <span className="text-muted">
                  Type <span className="text-text font-mono">{storeName}</span>{' '}
                  to confirm
                </span>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={isPending}
                  autoFocus
                  className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-danger"
                />
              </label>
            )}

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancel}
                disabled={isPending}
                className="border border-border rounded px-3 py-1.5 text-sm hover:bg-bg disabled:opacity-50"
              >
                {blocked ? 'Close' : 'Cancel'}
              </button>
              {!blocked ? (
                <button
                  type="button"
                  onClick={confirm}
                  disabled={isPending || !typedMatches}
                  className="bg-danger text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {isPending ? 'Deleting…' : 'Delete permanently'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
