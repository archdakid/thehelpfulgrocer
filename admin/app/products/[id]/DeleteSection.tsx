'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  deleteProduct,
  previewDeleteProduct,
  type DeleteCounts,
} from '../actions';

type Props = {
  productId: string;
  productName: string;
};

// Two-phase delete UI:
//   1. Click "Delete product" → fetch cascade counts (prices + aliases).
//   2. Show modal with the counts, name to type to confirm, and a
//      destructive Confirm button. On success, redirect to /products.
//
// We require typing the product name as the confirmation gesture so
// the destructive click can't be muscle-memoried through. Reasonable
// for an admin panel — this isn't a high-frequency action.
export default function DeleteSection({ productId, productName }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<'idle' | 'preview' | 'done'>('idle');
  const [counts, setCounts] = useState<DeleteCounts | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openPreview = () => {
    setError(null);
    setTyped('');
    startTransition(async () => {
      const res = await previewDeleteProduct(productId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCounts(res.counts);
      setStage('preview');
    });
  };

  const cancel = () => {
    setStage('idle');
    setCounts(null);
    setTyped('');
    setError(null);
  };

  const confirm = () => {
    if (typed.trim() !== productName) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteProduct(productId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStage('done');
      router.push('/products');
      router.refresh();
    });
  };

  const typedMatches = typed.trim() === productName;

  return (
    <>
      <div className="bg-surface border border-danger/40 rounded-lg p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-danger uppercase tracking-wider">
            Danger zone
          </h2>
          <p className="text-sm text-muted mt-1">
            Deleting a product also wipes every price observation and alias
            linked to it. Receipt items and circular items are kept but lose
            their match.
          </p>
        </div>
        <button
          type="button"
          onClick={openPreview}
          disabled={isPending || stage !== 'idle'}
          className="border border-danger text-danger rounded px-3 py-1.5 text-sm font-medium hover:bg-danger hover:text-white disabled:opacity-50 transition-colors"
        >
          {isPending && stage === 'idle' ? 'Checking…' : 'Delete product'}
        </button>
        {error && stage === 'idle' ? (
          <p className="text-sm text-danger">{error}</p>
        ) : null}
      </div>

      {stage === 'preview' && counts ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface border border-border rounded-lg p-5 max-w-md w-full space-y-4">
            <div>
              <h3 className="text-base font-semibold">Delete this product?</h3>
              <p className="text-sm text-muted mt-1">
                This will permanently delete{' '}
                <span className="text-text font-medium">{productName}</span>{' '}
                and the following linked rows:
              </p>
            </div>

            <ul className="text-sm space-y-1 bg-bg border border-border rounded p-3">
              <li className="flex justify-between">
                <span className="text-muted">Price observations</span>
                <span className="font-mono">{counts.prices}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted">Aliases</span>
                <span className="font-mono">{counts.aliases}</span>
              </li>
            </ul>

            <p className="text-xs text-muted">
              Receipt items and circular items that referenced this product
              keep their rows but lose the match.
            </p>

            <label className="block text-sm">
              <span className="text-muted">
                Type <span className="text-text font-mono">{productName}</span>{' '}
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

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancel}
                disabled={isPending}
                className="border border-border rounded px-3 py-1.5 text-sm hover:bg-bg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={isPending || !typedMatches}
                className="bg-danger text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {isPending ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
