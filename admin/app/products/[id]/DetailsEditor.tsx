'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  updateProduct,
  type ProductFields,
  type UnitOfMeasure,
} from '../actions';
import { PRODUCT_CATEGORIES, type ProductCategory } from '../categories';

const UOM_OPTIONS: readonly UnitOfMeasure[] = [
  'each',
  'g',
  'kg',
  'ml',
  'L',
  'oz',
  'lb',
] as const;

type Props = {
  productId: string;
  initial: {
    name: string;
    brand: string | null;
    upc: string | null;
    category: string | null;
    unit_size: number | null;
    unit_of_measure: string | null;
    units_per_pack: number | null;
    is_sold_by_weight: boolean;
    description: string | null;
  };
};

function asCategory(raw: string | null): ProductCategory | '' {
  if (!raw) return '';
  return PRODUCT_CATEGORIES.includes(raw as ProductCategory)
    ? (raw as ProductCategory)
    : '';
}

function asUom(raw: string | null): UnitOfMeasure | '' {
  if (!raw) return '';
  return UOM_OPTIONS.includes(raw as UnitOfMeasure)
    ? (raw as UnitOfMeasure)
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
  const [unitSize, setUnitSize] = useState(
    initial.unit_size != null ? String(initial.unit_size) : '',
  );
  const [unitOfMeasure, setUnitOfMeasure] = useState<UnitOfMeasure | ''>(
    asUom(initial.unit_of_measure),
  );
  const [unitsPerPack, setUnitsPerPack] = useState(
    initial.units_per_pack != null ? String(initial.units_per_pack) : '',
  );
  const [isSoldByWeight, setIsSoldByWeight] = useState(
    Boolean(initial.is_sold_by_weight),
  );
  const [description, setDescription] = useState(initial.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const [isPending, startTransition] = useTransition();

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
    const unitSizeTrimmed = unitSize.trim();
    const initialUnitSize =
      initial.unit_size != null ? String(initial.unit_size) : '';
    if (unitSizeTrimmed !== initialUnitSize) {
      patch.unit_size = unitSizeTrimmed === '' ? null : Number(unitSizeTrimmed);
    }
    const initialUom = asUom(initial.unit_of_measure);
    if (unitOfMeasure !== initialUom) {
      patch.unit_of_measure = unitOfMeasure === '' ? null : unitOfMeasure;
    }
    const uppTrimmed = unitsPerPack.trim();
    const initialUpp =
      initial.units_per_pack != null ? String(initial.units_per_pack) : '';
    if (uppTrimmed !== initialUpp) {
      patch.units_per_pack = uppTrimmed === '' ? null : Number(uppTrimmed);
    }
    if (isSoldByWeight !== Boolean(initial.is_sold_by_weight)) {
      patch.is_sold_by_weight = isSoldByWeight;
    }
    const descTrimmed = description.trim();
    const initialDesc = initial.description ?? '';
    if (descTrimmed !== initialDesc) {
      patch.description = descTrimmed === '' ? null : descTrimmed;
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
    if (
      patch.unit_size !== undefined &&
      patch.unit_size !== null &&
      (!Number.isFinite(patch.unit_size) || patch.unit_size <= 0)
    ) {
      setError('Unit size must be a positive number');
      return;
    }
    if (
      patch.units_per_pack !== undefined &&
      patch.units_per_pack !== null &&
      (!Number.isInteger(patch.units_per_pack) || patch.units_per_pack < 1)
    ) {
      setError('Units per pack must be a whole number ≥ 1');
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
          Details &amp; Unit Normalization
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

        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <label className="block text-sm">
            <span className="text-muted">Unit size</span>
            <input
              type="number"
              step="any"
              min="0.001"
              value={unitSize}
              onChange={(e) => setUnitSize(e.target.value)}
              disabled={isPending}
              placeholder="e.g. 500"
              className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Unit of measure</span>
            <select
              value={unitOfMeasure}
              onChange={(e) =>
                setUnitOfMeasure(e.target.value as UnitOfMeasure | '')
              }
              disabled={isPending}
              className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">— none —</option>
              {UOM_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted">Units per pack</span>
            <input
              type="number"
              step="1"
              min="1"
              value={unitsPerPack}
              onChange={(e) => setUnitsPerPack(e.target.value)}
              disabled={isPending}
              placeholder="e.g. 1, 6, 12"
              className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
        </div>

        <label className="sm:col-span-2 flex items-center gap-2 text-sm cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={isSoldByWeight}
            onChange={(e) => setIsSoldByWeight(e.target.checked)}
            disabled={isPending}
            className="h-4 w-4 accent-accent cursor-pointer"
          />
          <span className="text-text">Sold by weight (variable-weight item)</span>
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="text-muted">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
            disabled={isPending}
            placeholder="Optional retailer or product description"
            className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
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
