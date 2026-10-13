'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { resolveFlaggedItem } from './actions';

type Props = {
  flaggedItemId: string;
  flaggedProductId: string | null;
  flaggedProductName: string | null;
  candidateProductId: string | null;
  candidateProductName: string | null;
  resolved: boolean;
  resolution?: string | null;
  initialNotes?: string | null;
};

export default function PotentialDuplicateActions({
  flaggedItemId,
  flaggedProductId,
  flaggedProductName,
  candidateProductId,
  candidateProductName,
  resolved,
  resolution,
  initialNotes,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPackForm, setShowPackForm] = useState(false);
  const [largerIs, setLargerIs] = useState<'flagged' | 'candidate'>('flagged');
  const [scaleFactorStr, setScaleFactorStr] = useState('2');
  const [notes, setNotes] = useState('');

  if (resolved) {
    return (
      <section className="bg-surface border border-border rounded-lg p-4 space-y-2">
        <p className="text-sm text-muted">
          This row is already resolved{resolution ? ` as "${resolution}"` : ''}.
        </p>
        {initialNotes ? (
          <p className="text-xs font-mono text-text bg-bg border border-border rounded p-2.5 whitespace-pre-wrap">
            {initialNotes}
          </p>
        ) : null}
      </section>
    );
  }

  // Both merge and pack_variant need both products to exist.
  const canLinkOrMerge =
    flaggedProductId !== null &&
    candidateProductId !== null &&
    flaggedProductId !== candidateProductId;

  const submitSimple = (action: 'merge_duplicate' | 'reject') => {
    setError(null);
    startTransition(async () => {
      const res = await resolveFlaggedItem({
        flaggedItemId,
        action,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push('/queue');
    });
  };

  const submitPackVariant = (e: React.FormEvent) => {
    e.preventDefault();
    const scaleFactor = Number(scaleFactorStr);
    if (!Number.isFinite(scaleFactor) || scaleFactor <= 1) {
      setError('Scale factor must be a number greater than 1 (e.g. 2, 6, 12).');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await resolveFlaggedItem({
        flaggedItemId,
        action: 'pack_variant',
        packVariant: { largerIs, scaleFactor },
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push('/queue');
    });
  };

  return (
    <section className="bg-surface border border-border rounded-lg p-4 space-y-4">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
        Resolve
      </h2>
      <p className="text-sm text-text">
        {canLinkOrMerge
          ? `Merge moves all prices, aliases, availability, and vendor categories from this row's product into "${candidateProductName ?? 'the candidate'}", then deletes the duplicate. Or link them as a pack/size variant so both products remain in the catalog with scaled cross-store price comparison.`
          : 'Cannot merge or link — either side of the duplicate pair is missing. Reject to clear the flag.'}
      </p>

      <label className="block text-sm">
        <span className="text-xs text-muted">Optional resolution notes</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isPending}
          placeholder="Why merged / linked / rejected (optional)"
          className="mt-1 w-full border border-border rounded px-3 py-1.5 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => submitSimple('merge_duplicate')}
          disabled={isPending || !canLinkOrMerge}
          className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Working…' : 'Merge into candidate'}
        </button>
        <button
          type="button"
          onClick={() => setShowPackForm((v) => !v)}
          disabled={isPending || !canLinkOrMerge}
          className="bg-surface text-text border border-border rounded px-3 py-1.5 text-sm font-medium hover:bg-bg disabled:opacity-50"
        >
          {showPackForm ? 'Hide pack variant form' : 'Link as pack variant…'}
        </button>
        <button
          type="button"
          onClick={() => submitSimple('reject')}
          disabled={isPending}
          className="bg-surface text-danger border border-danger/40 rounded px-3 py-1.5 text-sm font-medium hover:bg-danger/5 disabled:opacity-50"
        >
          Not a duplicate
        </button>
      </div>

      {showPackForm && canLinkOrMerge ? (
        <form
          onSubmit={submitPackVariant}
          className="border-t border-border pt-4 space-y-3"
        >
          <p className="text-xs text-muted">
            Writes a <span className="font-mono">product_equivalents</span> row:{' '}
            <span className="font-mono">
              1 × larger = scale_factor × smaller
            </span>
            . Both products remain in the catalog.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-muted text-xs">Which product is the larger pack/size?</span>
              <select
                value={largerIs}
                onChange={(e) =>
                  setLargerIs(e.target.value as 'flagged' | 'candidate')
                }
                disabled={isPending}
                className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="flagged">
                  Flagged: {flaggedProductName ?? 'New product'}
                </option>
                <option value="candidate">
                  Candidate: {candidateProductName ?? 'Existing product'}
                </option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted text-xs">
                Scale factor (how many of the smaller equal 1 of the larger)
              </span>
              <input
                type="number"
                step="any"
                min="1.001"
                value={scaleFactorStr}
                onChange={(e) => setScaleFactorStr(e.target.value)}
                disabled={isPending}
                placeholder="e.g. 2, 2.5, 6, 12"
                className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Saving pack variant…' : 'Confirm pack variant link'}
          </button>
        </form>
      ) : null}
    </section>
  );
}
