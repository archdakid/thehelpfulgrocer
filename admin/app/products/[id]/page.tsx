import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import DeleteSection from './DeleteSection';
import DetailsEditor from './DetailsEditor';
import EquivalentsSection, { type EquivalentRow } from './EquivalentsSection';
import ImageEditor from './ImageEditor';
import PricesSection from './PricesSection';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('products')
    .select(
      'id, name, brand, upc, image_url, category, unit_size, unit_of_measure, units_per_pack, is_sold_by_weight, description, created_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6">
        <p className="text-danger">Failed to load product: {error.message}</p>
      </div>
    );
  }

  if (!data) notFound();

  // Pull stores + current prices + availability + equivalents in parallel.
  const [storesRes, pricesRes, availabilityRes, eqLargerRes, eqSmallerRes] =
    await Promise.all([
      supabase
        .from('stores')
        .select('id, name, region')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('current_prices')
        .select('store_id, amount_minor_units, currency, source, observed_at')
        .eq('product_id', id),
      supabase
        .from('product_store_availability')
        .select('store_id, is_available, updated_at')
        .eq('product_id', id),
      supabase
        .from('product_equivalents')
        .select(
          `id, product_id, equivalent_product_id, scale_factor, source, notes,
           other_product:products!product_equivalents_equivalent_product_id_fkey (
             id, name, brand, unit_size, unit_of_measure, units_per_pack
           )`,
        )
        .eq('product_id', id),
      supabase
        .from('product_equivalents')
        .select(
          `id, product_id, equivalent_product_id, scale_factor, source, notes,
           other_product:products!product_equivalents_product_id_fkey (
             id, name, brand, unit_size, unit_of_measure, units_per_pack
           )`,
        )
        .eq('equivalent_product_id', id),
    ]);

  const equivalents: EquivalentRow[] = [
    ...((eqLargerRes.data ?? []) as unknown as EquivalentRow[]),
    ...((eqSmallerRes.data ?? []) as unknown as EquivalentRow[]),
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/products" className="text-sm text-muted hover:text-text">
          ← Products
        </Link>
        <h1 className="text-xl font-semibold mt-1">{data.name}</h1>
      </div>

      <DetailsEditor
        productId={data.id}
        initial={{
          name: data.name,
          brand: data.brand,
          upc: data.upc,
          category: data.category,
          unit_size: data.unit_size,
          unit_of_measure: data.unit_of_measure,
          units_per_pack: data.units_per_pack,
          is_sold_by_weight: data.is_sold_by_weight,
          description: data.description,
        }}
      />

      <EquivalentsSection
        productId={data.id}
        productName={data.name}
        equivalents={equivalents}
      />

      <ImageEditor
        productId={data.id}
        initialImageUrl={data.image_url}
        productName={data.name}
        upc={data.upc}
      />

      <PricesSection
        productId={data.id}
        stores={storesRes.data ?? []}
        prices={(pricesRes.data ?? []).flatMap((p) =>
          // current_prices is a view; generated types mark all
          // columns nullable. Drop any incomplete rows so the
          // client component can rely on non-null fields.
          p.store_id &&
          p.amount_minor_units !== null &&
          p.currency &&
          p.source &&
          p.observed_at
            ? [
                {
                  store_id: p.store_id,
                  amount_minor_units: p.amount_minor_units,
                  currency: p.currency,
                  source: p.source,
                  observed_at: p.observed_at,
                },
              ]
            : [],
        )}
        availability={availabilityRes.data ?? []}
      />

      <DeleteSection productId={data.id} productName={data.name} />
    </div>
  );
}
