import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ImageOff, WifiOff } from 'lucide-react-native';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import PriceComparisonRow from '@/components/product/PriceComparisonRow';
import EmptyState from '@/components/ui/EmptyState';
import { useProduct } from '@/hooks/useProduct';
import { usePricesForProduct } from '@/hooks/usePricesForProduct';
import { logger } from '@/lib/logger';

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
  const productQuery = useProduct(id);
  const pricesQuery = usePricesForProduct(id);

  if (productQuery.isError) logger.error('useProduct failed', { id, error: productQuery.error });
  if (pricesQuery.isError) logger.error('usePricesForProduct failed', { id, error: pricesQuery.error });

  const isLoading = productQuery.isLoading || pricesQuery.isLoading;
  const isError = productQuery.isError || pricesQuery.isError;
  const error = productQuery.error ?? pricesQuery.error;

  const cheapestId = pricesQuery.data?.[0]?.store.id;

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
            <ArrowLeft size={24} color="rgb(26 26 24)" />
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
              <PriceComparisonRow entry={item} isCheapest={item.store.id === cheapestId} />
            )}
            ListHeaderComponent={
              <View className="px-4 pb-4">
                <View className="w-full aspect-square bg-muted rounded-lg items-center justify-center overflow-hidden mb-4">
                  {productQuery.data.image_url ? (
                    <Image
                      source={{ uri: productQuery.data.image_url }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="contain"
                    />
                  ) : (
                    <ImageOff size={48} color="rgb(136 135 128)" strokeWidth={1.5} />
                  )}
                </View>
                <Text className="text-h2 text-primary">{productQuery.data.name}</Text>
                {productQuery.data.brand ? (
                  <Text className="text-body-sm text-secondary mt-0.5">
                    {productQuery.data.brand}
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
            contentContainerClassName={(pricesQuery.data ?? []).length === 0 ? 'flex-grow' : ''}
            showsVerticalScrollIndicator={false}
          />
        ) : null}
      </SafeAreaView>
    </>
  );
}
