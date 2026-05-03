import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import DeleteSection from './DeleteSection';
import DetailsEditor from './DetailsEditor';
import ImageEditor from './ImageEditor';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('products')
    .select('id, name, brand, upc, image_url, category, created_at')
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
        }}
      />

      <ImageEditor
        productId={data.id}
        initialImageUrl={data.image_url}
        productName={data.name}
        upc={data.upc}
      />

      <DeleteSection productId={data.id} productName={data.name} />
    </div>
  );
}
