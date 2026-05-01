import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, PackageOpen, WifiOff } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CategoryProductRow from '@/components/browse/CategoryProductRow';
import CategoryGlyph from '@/components/ui/CategoryGlyph';
import EmptyState from '@/components/ui/EmptyState';
import { categoryColors, categoryNames, isCategoryId } from '@/constants/categories';
import { useProductsInCategory, type CategoryProductRow as CategoryRow } from '@/hooks/useProductsInCategory';
import { useStores } from '@/hooks/useStores';
import { isCategoryId as isCategoryIdHelper } from '@/constants/categories';
import { logger } from '@/lib/logger';
import { useListStore } from '@/stores/useListStore';
import { useUIStore } from '@/stores/useUIStore';

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Check your connection and try again.';
}

export default function CategoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const activeStoreId = useUIStore((s) => s.activeStoreId);
  const items = useListStore((s) => s.items);
  const addProductItem = useListStore((s) => s.addProductItem);
  const productsQuery = useProductsInCategory(id, activeStoreId);
  const { data: stores } = useStores();

  const inListIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.productId) set.add(item.productId);
    return set;
  }, [items]);

  if (productsQuery.isError) {
    logger.error('useProductsInCategory failed', { id, error: productsQuery.error });
  }

  if (!isCategoryId(id)) {
    return (
      <SafeAreaView className="flex-1 bg-canvas">
        <EmptyState
          icon={PackageOpen}
          heading="Unknown category"
          body="That category isn't part of our catalog."
        />
      </SafeAreaView>
    );
  }

  const colors = categoryColors[id];
  const products = productsQuery.data ?? [];
  const storeCount = stores?.length ?? 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-canvas">
        {/* Color-tinted header */}
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.bg }}>
          <View
            className="flex-row items-center px-2 pb-1.5"
            style={{ paddingTop: 4, gap: 10 }}
          >
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.7)' }}
            >
              <ArrowLeft size={18} color={colors.fg} strokeWidth={2.4} />
            </Pressable>
            <Text
              className="flex-1 text-[13px] uppercase font-semibold"
              style={{ color: colors.fg, opacity: 0.7, letterSpacing: 0.4 }}
            >
              Browse
            </Text>
          </View>
          <View
            className="flex-row items-center px-4 pb-3.5"
            style={{ gap: 12 }}
          >
            <View
              className="w-14 h-14 rounded-lg items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.6)' }}
            >
              <CategoryGlyph category={id} size={26} />
            </View>
            <View className="flex-1">
              <Text
                className="text-h1"
                style={{ color: colors.fg }}
              >
                {categoryNames[id]}
              </Text>
              <Text
                className="text-body-sm mt-0.5"
                style={{ color: colors.fg, opacity: 0.78, fontVariant: ['tabular-nums'] }}
              >
                {products.length} item{products.length === 1 ? '' : 's'} · {storeCount} store{storeCount === 1 ? '' : 's'} tracked
              </Text>
            </View>
          </View>
        </SafeAreaView>

        {/* Sort row (stub — defaults to A→Z) */}
        <View className="flex-row items-center justify-between px-4 py-2.5 border-b-[0.5px] border-border">
          <Text className="text-caption text-secondary">
            <Text className="text-primary font-semibold">{products.length}</Text> items shown
          </Text>
          <Pressable
            onPress={() => {
              // TODO(yashua): wire sort options (Best savings / Cheapest / A-Z) when meaningful.
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Sort options"
          >
            <Text className="text-body-sm font-semibold text-brand-primary">Sort: A → Z</Text>
          </Pressable>
        </View>

        {/* Body */}
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
            body="This category will fill in as receipts and circulars are processed."
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
  row: CategoryRow,
  addProductItem: ReturnType<typeof useListStore.getState>['addProductItem'],
) {
  addProductItem({
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: isCategoryIdHelper(row.category) ? row.category : null,
  });
}
