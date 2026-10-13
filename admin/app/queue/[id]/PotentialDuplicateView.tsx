import Link from 'next/link';

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  unit_size: number | null;
  unit_of_measure: string | null;
  units_per_pack: number | null;
  description: string | null;
} | null;

type Props = {
  flagged: Product;
  candidate: Product;
};

// Side-by-side renderer for the two products in a potential_duplicate row.
// "Flagged" is the just-ingested product the matcher was unsure about;
// "Candidate" is the existing row the matcher thinks it might be the same
// as. The merge action consolidates the flagged into the candidate (or any
// admin-picked target).
export default function PotentialDuplicateView({ flagged, candidate }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ProductPanel
        title="Flagged (just ingested)"
        product={flagged}
        accent="border-warn/40"
      />
      <ProductPanel
        title="Candidate (existing — proposed merge target)"
        product={candidate}
        accent="border-accent/40"
      />
    </div>
  );
}

function ProductPanel({
  title,
  product,
  accent,
}: {
  title: string;
  product: Product;
  accent: string;
}) {
  if (!product) {
    return (
      <section className={`bg-surface border ${accent} rounded-lg p-4`}>
        <p className="text-xs uppercase tracking-wider text-muted mb-2">{title}</p>
        <p className="text-sm text-muted">
          Product no longer exists (probably already merged or deleted).
        </p>
      </section>
    );
  }

  const sizeLabel = formatSize(product);
  return (
    <section className={`bg-surface border ${accent} rounded-lg p-4 space-y-3`}>
      <p className="text-xs uppercase tracking-wider text-muted">{title}</p>
      <div className="flex gap-3">
        <div className="w-20 h-20 rounded bg-bg border border-border overflow-hidden shrink-0 flex items-center justify-center">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt=""
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="text-[10px] text-muted uppercase">no image</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/products/${product.id}`}
            className="text-sm font-medium hover:underline block"
          >
            {product.name}
          </Link>
          <p className="text-xs text-muted mt-0.5">
            {product.brand ?? '—'}
            {sizeLabel ? ` · ${sizeLabel}` : ''}
            {product.category ? ` · ${product.category}` : ''}
          </p>
        </div>
      </div>
      {product.description ? (
        <p className="text-xs text-muted line-clamp-3">{product.description}</p>
      ) : null}
    </section>
  );
}

function formatSize(p: NonNullable<Product>): string | null {
  const parts: string[] = [];
  if (p.unit_size && p.unit_of_measure && p.unit_of_measure !== 'each') {
    parts.push(`${p.unit_size}${p.unit_of_measure}`);
  }
  if (p.units_per_pack && p.units_per_pack > 1) {
    parts.push(`pack of ${p.units_per_pack}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
