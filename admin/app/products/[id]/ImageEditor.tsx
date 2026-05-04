'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { setProductImage } from '../actions';

type Props = {
  productId: string;
  initialImageUrl: string | null;
  productName: string;
  upc: string | null;
};

const BUCKET = 'product-images';
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function inferExt(file: File): string {
  const fromType = file.type.split('/')[1];
  if (fromType && /^(jpeg|jpg|png|webp|gif)$/i.test(fromType)) {
    return fromType === 'jpeg' ? 'jpg' : fromType.toLowerCase();
  }
  const fromName = file.name.split('.').pop() ?? '';
  return /^(jpe?g|png|webp|gif)$/i.test(fromName) ? fromName.toLowerCase() : 'jpg';
}

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ImageEditor({
  productId,
  initialImageUrl,
  productName,
  upc,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // OFF preview link — admins can verify what users see in mobile when
  // products.image_url is null (the resolver falls back to OFF). We only
  // surface this when there's a UPC, since OFF lookups are upc-keyed.
  const offUrl = upc
    ? `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(upc)}.json?fields=image_url,product_name`
    : null;

  const upload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Pick an image first');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Image is ${(file.size / 1024 / 1024).toFixed(1)}MB; max 5MB. Resize first.`);
      return;
    }
    setError(null);

    startTransition(async () => {
      const path = `${productId}/${newUuid()}.${inferExt(file)}`;
      setProgress('Uploading…');
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        setProgress(null);
        return;
      }

      setProgress('Saving…');
      const res = await setProductImage(productId, path);
      if (!res.ok) {
        // Best-effort cleanup of the orphan we just uploaded.
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
        setError(res.error);
        setProgress(null);
        return;
      }

      // Cache-bust the preview by appending a stamp — Supabase public URLs
      // cache aggressively at the CDN, and replacing the image without a
      // fresh query string would leave the admin staring at the old one.
      setImageUrl(res.imageUrl ? `${res.imageUrl}?v=${Date.now()}` : null);
      setFile(null);
      setProgress(null);
      router.refresh();
    });
  };

  const clear = () => {
    if (!imageUrl) return;
    if (!confirm(`Clear the admin image for "${productName}"?`)) return;
    setError(null);
    startTransition(async () => {
      setProgress('Clearing…');
      const res = await setProductImage(productId, null);
      if (!res.ok) {
        setError(res.error);
        setProgress(null);
        return;
      }
      setImageUrl(null);
      setProgress(null);
      router.refresh();
    });
  };

  return (
    <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
        Product image
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
        <div className="w-40 h-40 rounded bg-bg border border-border overflow-hidden flex items-center justify-center">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={productName} className="w-full h-full object-contain" />
          ) : (
            <span className="text-xs text-muted">No admin image</span>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-muted">
            Mobile uses the priority order: Open Food Facts → this admin image →
            placeholder. Setting an image here overrides the placeholder for
            products OFF doesn't know about, but OFF still wins when present.
          </p>
          {offUrl ? (
            <p className="text-xs">
              <a
                href={offUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                Check OFF for {upc} →
              </a>
            </p>
          ) : (
            <p className="text-xs text-muted">No UPC on this product — OFF won't match.</p>
          )}
        </div>
      </div>

      <form onSubmit={upload} className="space-y-3 border-t border-border pt-4">
        <label className="block text-sm">
          <span className="text-muted">Replace with</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
            disabled={isPending}
            className="mt-1 w-full text-sm"
          />
          {file ? (
            <p className="text-xs text-muted mt-1">
              {file.name} · {(file.size / 1024).toFixed(0)}KB
            </p>
          ) : null}
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {progress ? <p className="text-sm text-muted">{progress}</p> : null}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="submit"
            disabled={isPending || !file}
            className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isPending && progress?.startsWith('Upload') ? 'Uploading…' : 'Upload'}
          </button>
          {imageUrl ? (
            <button
              type="button"
              onClick={clear}
              disabled={isPending}
              className="bg-surface text-danger border border-danger/40 rounded px-3 py-1.5 text-sm font-medium hover:bg-danger/5 disabled:opacity-50"
            >
              Clear current
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
