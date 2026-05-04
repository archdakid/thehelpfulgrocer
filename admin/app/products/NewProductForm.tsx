'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createProduct } from './actions';
import { PRODUCT_CATEGORIES, type ProductCategory } from './categories';

export default function NewProductForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [upc, setUpc] = useState('');
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setName('');
    setBrand('');
    setUpc('');
    setCategory('');
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createProduct({
        name,
        brand: brand || undefined,
        upc: upc || undefined,
        category: category || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reset();
      // Navigate straight to the new product so the admin can upload an
      // image and double-check fields. /products list also revalidates.
      router.push(`/products/${res.product.id}`);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90"
      >
        + New product
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-surface border border-border rounded-lg p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
          New product
        </h2>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={isPending}
          className="text-xs text-muted hover:text-text disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm sm:col-span-2">
          <span className="text-muted">Name *</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
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
            placeholder="Leave blank for no-barcode items"
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
          disabled={isPending || name.trim().length === 0}
          className="bg-accent text-white rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  );
}
