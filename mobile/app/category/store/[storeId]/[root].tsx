import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, PackageOpen, Tag, WifiOff } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CategoryProductRow from '@/components/browse/CategoryProductRow';
import EmptyState from '@/components/ui/EmptyState';
import { isCategoryId } from '@/constants/categories';
import { useProductsAtStoreVendorRoot, type StoreVendorProductRow } from '@/hooks/useProductsAtStoreVendorRoot';
import { useStores } from '@/hooks/useStores';
import { logger } from '@/lib/logger';
import { useThemedColors } from '@/lib/themedColors';
import { useListStore } from '@/stores/useListStore';

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Check your connection and try again.';
}

export default function StoreVendorCategoryScreen() {
  const params = useLocalSearchParams<{ storeId: string; root: string }>();
  const storeId = typeof params.storeId === 'string' ? params.storeId : null;
  // Expo Router decodes percent-encoded path segments before delivering them.
  const root = typeof params.root === 'string' ? params.root : null;

  const router = useRouter();
  const c = useThemedColors();
  const { data: stores } = useStores();
  const items = useListStore((s) => s.items);
  const addProductItem = useListStore((s) => s.addProductItem);
  const productsQuery = useProductsAtStoreVendorRoot(storeId, root);

  const inListIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.productId) set.add(item.productId);
    return set;
  }, [items]);

  if (productsQuery.isError) {
    logger.error('useProductsAtStoreVendorRoot failed', {
      storeId,
      root,
      error: productsQuery.error,
    });
  }

  if (!storeId || !root) {
    return (
      <SafeAreaView className="flex-1 bg-canvas">
        <EmptyState
          icon={PackageOpen}
          heading="Missing category"
          body="That store-category link is incomplete."
        />
      </SafeAreaView>
    );
  }

  const storeName = stores?.find((s) => s.id === storeId)?.name ?? 'this store';
  const products = productsQuery.data ?? [];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-canvas">
        <SafeAreaView edges={['top']} className="bg-surface border-b-[0.5px] border-border">
          <View className="flex-row items-center px-2 pb-2" style={{ paddingTop: 4, gap: 10 }}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              className="w-9 h-9 rounded-full items-center justify-center"
            >
              <ArrowLeft size={18} color={c.text.primary} strokeWidth={2.4} />
            </Pressable>
            <Text
              className="flex-1 text-eyebrow uppercase text-tertiary"
              numberOfLines={1}
            >
              {storeName}
            </Text>
          </View>
          <View className="flex-row items-center px-4 pb-3" style={{ gap: 12 }}>
            <View className="w-12 h-12 rounded-md items-center justify-center bg-brand-primary/10">
              <Tag size={22} color={c.brand.primary} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="text-h2 text-primary" numberOfLines={2}>
                {root}
              </Text>
              <Text
                className="text-body-sm text-secondary mt-0.5"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {products.length} item{products.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
        </SafeAreaView>

        {productsQuery.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : productsQuery.isError ? (
          <EmptyState
            icon={WifiOff}
            heading="Couldn't load this category"
            body={extractErrorMessage(productsQuery.error)}
            ctaLabel="Try again"
            onCtaPress={() => productsQuery.refetch()}
          />
        ) : products.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            heading="No products yet"
            body="This category will fill in as scrape runs ingest more of this store's catalog."
          />
        ) : (
          <FlatList
            data={products}
            keyExtractor={(row) => row.id}
            renderItem={({ item }) => (
              <CategoryProductRow
                row={item}
                inList={inListIds.has(item.id)}
                onOpen={() => router.push(`/product/${item.id}`)}
                onAdd={() => handleAdd(item, addProductItem)}
              />
            )}
            ItemSeparatorComponent={null}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </>
  );
}

function handleAdd(
  row: StoreVendorProductRow,
  addProductItem: ReturnType<typeof useListStore.getState>['addProductItem'],
) {
  addProductItem({
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: isCategoryId(row.category) ? row.category : null,
  });
}
