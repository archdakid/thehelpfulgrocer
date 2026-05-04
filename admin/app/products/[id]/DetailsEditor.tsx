'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { updateProduct, type ProductFields } from '../actions';
import { PRODUCT_CATEGORIES, type ProductCategory } from '../categories';

type Props = {
  productId: string;
  initial: {
    name: string;
    brand: string | null;
    upc: string | null;
    category: string | null;
  };
};

// Coerces the column value (free-text on disk) to a typed category for
// the dropdown, falling back to '' for anything not in the canonical
// list. Lets older rows with stray values still render a valid select.
function asCategory(raw: string | null): ProductCategory | '' {
  if (!raw) return '';
  return PRODUCT_CATEGORIES.includes(raw as ProductCategory)
    ? (raw as ProductCategory)
    : '';
}

export default function DetailsEditor({ productId, initial }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [brand, setBrand] = useState(initial.brand ?? '');
  const [upc, setUpc] = useState(initial.upc ?? '');
  const [category, setCategory] = useState<ProductCategory | ''>(
    asCategory(initial.category),
  );
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Build the patch by diffing against initial values. Empty string on a
  // nullable field becomes null (explicit clear); same value as initial
  // means "skip." Sending only changed fields keeps the audit narrow.
  const buildPatch = (): ProductFields => {
    const patch: ProductFields = {};
    if (name.trim() !== initial.name) patch.name = name.trim();
    const brandTrimmed = brand.trim();
    const initialBrand = initial.brand ?? '';
    if (brandTrimmed !== initialBrand) {
      patch.brand = brandTrimmed === '' ? null : brandTrimmed;
    }
    const upcTrimmed = upc.trim();
    const initialUpc = initial.upc ?? '';
    if (upcTrimmed !== initialUpc) {
      patch.upc = upcTrimmed === '' ? null : upcTrimmed;
    }
    const initialCategory = asCategory(initial.category);
    if (category !== initialCategory) {
      patch.category = category === '' ? null : category;
    }
    return patch;
  };

  const dirty = Object.keys(buildPatch()).length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) return;
    if (patch.name !== undefined && patch.name.length === 0) {
      setError('Name cannot be empty');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateProduct(productId, patch);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedHint(true);
      // Brief flash, then clear. Server data refresh keeps initial
      // values stale until refresh — done below — so the dirty marker
      // wouldn't settle without router.refresh().
      setTimeout(() => setSavedHint(false), 1500);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={submit}
      className="bg-surface border border-border rounded-lg p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
          Details
        </h2>
        {savedHint ? <span className="text-xs text-success">Saved</span> : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm sm:col-span-2">
          <span className="text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            disabled={isPending}
            className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Brand</span>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            maxLength={100}
            disabled={isPending}
            placeholder="—"
            className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">UPC</span>
          <input
            value={upc}
            onChange={(e) => setUpc(e.target.value)}
            maxLength={64}
            disabled={isPending}
            placeholder="—"
            className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-muted">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ProductCategory | '')}
            disabled={isPending}
            className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">— uncategorized —</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending || !dirty}
          className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        {dirty ? (
          <span className="text-xs text-muted">Unsaved changes</span>
        ) : null}
      </div>
    </form>
  );
}
