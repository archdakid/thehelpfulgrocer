'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  fetchImageCandidates,
  importImageFromUrl,
  skipProductImage,
  type ImageCandidate,
} from '../actions';

type Props = {
  productId: string;
  name: string;
  brand: string | null;
  upc: string | null;
  category: string | null;
};

// Per-row review widget. Three states:
//   - idle:       brand row + Fetch / Skip buttons
//   - candidates: thumbnails the admin can click to import
//   - imported:   row hides itself behind a "Imported ✓" message
//                 (server revalidate also drops it from the queue)
//
// Reasons map to user-facing copy: an empty candidate list isn't an
// error — OFF just doesn't have anything for that UPC.
const REASON_COPY: Record<string, string> = {
  no_upc: 'Product has no UPC; nothing to look up.',
  internal_upc: 'UPC is an internal placeholder; OFF has nothing for it.',
  off_not_found: 'OFF has no entry for this UPC.',
  off_no_product: 'OFF returned no product for this UPC.',
};

export default function ImageCandidateRow({
  productId,
  name,
  brand,
  upc,
  category,
}: Props) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<ImageCandidate[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importedUrl, setImportedUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onFetch = () => {
    setError(null);
    setReason(null);
    startTransition(async () => {
      const res = await fetchImageCandidates(productId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCandidates(res.candidates);
      setReason(res.reason ?? null);
    });
  };

  const onImport = (sourceUrl: string) => {
    setError(null);
    startTransition(async () => {
      const res = await importImageFromUrl({ productId, sourceUrl });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setImportedUrl(res.imageUrl);
      // Refresh so the row drops out of the queue on next render.
      router.refresh();
    });
  };

  const onSkip = () => {
    setError(null);
    startTransition(async () => {
      const res = await skipProductImage(productId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className="p-3 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded bg-bg border border-border flex items-center justify-center shrink-0">
          {importedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={importedUrl}
              alt=""
              className="w-full h-full object-contain rounded"
            />
          ) : (
            <span className="text-[10px] text-muted uppercase">none</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/products/${productId}`}
            className="text-sm font-medium hover:underline"
          >
            {name}
          </Link>
          <p className="text-xs text-muted truncate">
            {brand ?? '—'}
            {upc ? ` · ${upc}` : ''}
            {category ? ` · ${category}` : ''}
          </p>
        </div>

        {importedUrl ? (
          <span className="text-xs text-success font-medium">Imported ✓</span>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onFetch}
              disabled={isPending}
              className="border border-border rounded px-2 py-1 text-xs hover:bg-bg disabled:opacity-50"
            >
              {isPending && candidates === null ? 'Fetching…' : 'Fetch candidates'}
            </button>
            <button
              type="button"
              onClick={onSkip}
              disabled={isPending}
              className="border border-border rounded px-2 py-1 text-xs text-muted hover:bg-bg disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        )}
      </div>

      {candidates !== null && !importedUrl ? (
        candidates.length === 0 ? (
          <p className="text-xs text-muted ml-15">
            {reason ? REASON_COPY[reason] ?? `No candidates (${reason}).` : 'No candidates.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 ml-15">
            {candidates.map((c) => (
              <button
                key={c.url}
                type="button"
                onClick={() => onImport(c.url)}
                disabled={isPending}
                className="group border border-border rounded overflow-hidden bg-bg hover:border-accent transition-colors disabled:opacity-50"
                title={c.url}
              >
                <div className="aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.url}
                    alt={c.kind}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted px-1 py-0.5 border-t border-border group-hover:text-accent">
                  {c.kind}
                </div>
              </button>
            ))}
          </div>
        )
      ) : null}

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </li>
  );
}
