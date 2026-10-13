import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ImageOff, WifiOff } from 'lucide-react-native';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import NutritionPanel from '@/components/product/NutritionPanel';
import PriceComparisonRow from '@/components/product/PriceComparisonRow';
import EmptyState from '@/components/ui/EmptyState';
import { useOpenFoodFacts } from '@/hooks/useOpenFoodFacts';
import { useProduct, type Product } from '@/hooks/useProduct';
import { usePricesForProduct } from '@/hooks/usePricesForProduct';
import { logger } from '@/lib/logger';
import { resolveProductImage } from '@/lib/productImage';
import { useThemedColors } from '@/lib/themedColors';

// "500ml" / "Case of 24 · 330ml each" / "1 lb" — purely a header readout.
// Returns null when the product has no UOM/pack info worth surfacing.
function formatProductSize(product: Product): string | null {
  const parts: string[] = [];
  const size =
    product.unit_size && product.unit_of_measure && product.unit_of_measure !== 'each'
      ? `${product.unit_size}${product.unit_of_measure}`
      : null;
  if (product.units_per_pack && product.units_per_pack > 1) {
    parts.push(`Case of ${product.units_per_pack}`);
    if (size) parts.push(`${size} each`);
  } else if (size) {
    parts.push(size);
  }
  if (product.is_sold_by_weight && product.unit_of_measure) {
    parts.push(`sold by ${product.unit_of_measure}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Check your connection and try again.';
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useThemedColors();
  const productQuery = useProduct(id);
  const pricesQuery = usePricesForProduct(id);
  const offQuery = useOpenFoodFacts(productQuery.data?.upc ?? null);

  if (productQuery.isError) logger.error('useProduct failed', { id, error: productQuery.error });
  if (pricesQuery.isError) logger.error('usePricesForProduct failed', { id, error: pricesQuery.error });
  // OFF errors are non-fatal — the product page works without nutrition.
  // Log so we notice systemic failures, but don't surface to the user.
  if (offQuery.isError) {
    logger.warn('useOpenFoodFacts failed', { upc: productQuery.data?.upc, error: offQuery.error });
  }

  const isLoading = productQuery.isLoading || pricesQuery.isLoading;
  const isError = productQuery.isError || pricesQuery.isError;
  const error = productQuery.error ?? pricesQuery.error;

  // Cheapest = cheapest IN-STOCK row. usePricesForProduct sorts in-stock
  // first, so the first available entry is the canonical "best price"
  // target; if everything's out of stock, no row gets the badge.
  const cheapestId = pricesQuery.data?.find((p) => p.isAvailable)?.store.id;
  const product = productQuery.data;
  const sizeLabel = product ? formatProductSize(product) : null;

  const resolvedImageUrl = resolveProductImage({
    offImageUrl: offQuery.data?.imageUrl ?? null,
    ownImageUrl: productQuery.data?.image_url ?? null,
  });
  // Hold the no-image placeholder until OFF settles so we don't flicker
  // ImageOff → real image for products OFF eventually returns. When the OFF
  // hook is disabled (no UPC, or INTERNAL- prefix), isLoading is false from
  // mount and the placeholder shows immediately, which is what we want.
  const showImagePlaceholder = resolvedImageUrl === null && !offQuery.isLoading;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
        <View className="flex-row items-center px-2 pt-1 pb-2">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="w-11 h-11 items-center justify-center"
          >
            <ArrowLeft size={24} color={c.text.primary} />
          </Pressable>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : isError ? (
          <EmptyState
            icon={WifiOff}
            heading="Couldn't load this product"
            body={extractErrorMessage(error)}
            ctaLabel="Try again"
            onCtaPress={() => {
              productQuery.refetch();
              pricesQuery.refetch();
            }}
          />
        ) : productQuery.data ? (
          <FlatList
            data={pricesQuery.data ?? []}
            keyExtractor={(entry) => entry.store.id}
            renderItem={({ item }) => (
              <PriceComparisonRow
                entry={item}
                product={productQuery.data!}
                isCheapest={item.store.id === cheapestId}
              />
            )}
            ListHeaderComponent={
              <View className="px-4 pb-4">
                <View className="w-full aspect-square bg-muted rounded-lg items-center justify-center overflow-hidden mb-4">
                  {resolvedImageUrl ? (
                    <Image
                      source={{ uri: resolvedImageUrl }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="contain"
                    />
                  ) : showImagePlaceholder ? (
                    <ImageOff size={48} color={c.text.tertiary} strokeWidth={1.5} />
                  ) : null}
                </View>
                <Text className="text-h2 text-primary">{productQuery.data.name}</Text>
                {productQuery.data.brand ? (
                  <Text className="text-body-sm text-secondary mt-0.5">
                    {productQuery.data.brand}
                  </Text>
                ) : null}
                {sizeLabel ? (
                  <Text className="text-caption text-tertiary mt-0.5">
                    {sizeLabel}
                  </Text>
                ) : null}
                <Text className="text-h3 text-primary mt-6 mb-1">Prices</Text>
                <Text className="text-body-sm text-secondary mb-2">
                  {(pricesQuery.data ?? []).length === 0
                    ? 'No prices yet — be the first to upload a receipt.'
                    : 'Cheapest first. Prices observed by the SmartShopper team.'}
                </Text>
              </View>
            }
            ListFooterComponent={
              offQuery.data?.nutrition ? (
                <View className="px-4 pt-4 pb-6">
                  <NutritionPanel nutrition={offQuery.data.nutrition} />
                </View>
              ) : null
            }
            contentContainerClassName={(pricesQuery.data ?? []).length === 0 ? 'flex-grow' : ''}
            showsVerticalScrollIndicator={false}
          />
        ) : null}
      </SafeAreaView>
    </>
  );
}
