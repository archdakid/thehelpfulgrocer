import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, PackageOpen, WifiOff } from 'lucide-react-native';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import EmptyState from '@/components/ui/EmptyState';
import ListItem from '@/components/ui/ListItem';
import { useProductsAtStore } from '@/hooks/useProductsAtStore';
import { useStore } from '@/hooks/useStore';
import { formatPrice } from '@/lib/format';
import { logger } from '@/lib/logger';

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Check your connection and try again.';
}

export default function StoreDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const storeQuery = useStore(id);
  const productsQuery = useProductsAtStore(id);

  if (storeQuery.isError) logger.error('useStore failed', { id, error: storeQuery.error });
  if (productsQuery.isError) logger.error('useProductsAtStore failed', { id, error: productsQuery.error });

  const isLoading = storeQuery.isLoading || productsQuery.isLoading;
  const isError = storeQuery.isError || productsQuery.isError;
  const error = storeQuery.error ?? productsQuery.error;

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

        <View className="px-4 pb-3">
          <Text className="text-h1 text-primary">
            {storeQuery.data?.name ?? '…'}
          </Text>
          <Text className="text-body-sm text-secondary mt-0.5">
            {productsQuery.data?.length ?? 0} product
            {(productsQuery.data?.length ?? 0) === 1 ? '' : 's'}
          </Text>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : isError ? (
          <EmptyState
            icon={WifiOff}
            heading="Couldn't load this store"
            body={extractErrorMessage(error)}
            ctaLabel="Try again"
            onCtaPress={() => {
              storeQuery.refetch();
              productsQuery.refetch();
            }}
          />
        ) : (
          <FlatList
            data={productsQuery.data ?? []}
            keyExtractor={(item) => item.product.id}
            renderItem={({ item }) => (
              <ListItem
                title={item.product.name}
                {...(item.product.brand ? { subtitle: item.product.brand } : {})}
                trailingText={formatPrice(item.amountMinorUnits, item.currency)}
                showChevron
                onPress={() => router.push(`/product/${item.product.id}`)}
              />
            )}
            contentContainerClassName={(productsQuery.data ?? []).length === 0 ? 'flex-1' : ''}
            ListEmptyComponent={
              <EmptyState
                icon={PackageOpen}
                heading="No products listed yet"
                body="This store has no priced products in our catalog. Receipts and circulars will fill it in."
              />
            }
            refreshing={productsQuery.isRefetching}
            onRefresh={productsQuery.refetch}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </>
  );
}
