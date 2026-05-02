import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, PackageOpen, WifiOff } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import CategoryProductRow from '@/components/browse/CategoryProductRow';
import CategoryGlyph from '@/components/ui/CategoryGlyph';
import EmptyState from '@/components/ui/EmptyState';
import { categoryColors, categoryNames, isCategoryId } from '@/constants/categories';
import { useProductsInCategory, type CategoryProductRow as CategoryRow } from '@/hooks/useProductsInCategory';
import { useStores } from '@/hooks/useStores';
import { isCategoryId as isCategoryIdHelper } from '@/constants/categories';
import { logger } from '@/lib/logger';
import { useThemedColors } from '@/lib/themedColors';
import { useListStore } from '@/stores/useListStore';
import { useUIStore } from '@/stores/useUIStore';

type SortKey = 'name-asc' | 'name-desc' | 'cheapest' | 'expensive' | 'savings';

const SORT_LABELS: Record<SortKey, string> = {
  'name-asc': 'A → Z',
  'name-desc': 'Z → A',
  cheapest: 'Cheapest',
  expensive: 'Most expensive',
  savings: 'Best savings',
};

const SORT_ORDER: SortKey[] = ['name-asc', 'name-desc', 'cheapest', 'expensive', 'savings'];

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
  const [sort, setSort] = useState<SortKey>('name-asc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

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

  // The query already returns A→Z. Other sort keys reorder client-side; rows
  // without a price at the active store sort to the bottom in both
  // price-based directions so the user sees stocked items first.
  const sortedProducts = useMemo(() => {
    if (sort === 'name-asc') return products;
    const list = [...products];
    switch (sort) {
      case 'name-desc':
        return list.reverse();
      case 'cheapest':
        return list.sort(
          (a, b) =>
            (a.here?.amountMinorUnits ?? Number.POSITIVE_INFINITY) -
            (b.here?.amountMinorUnits ?? Number.POSITIVE_INFINITY),
        );
      case 'expensive':
        return list.sort(
          (a, b) =>
            (b.here?.amountMinorUnits ?? Number.NEGATIVE_INFINITY) -
            (a.here?.amountMinorUnits ?? Number.NEGATIVE_INFINITY),
        );
      case 'savings':
        return list.sort((a, b) => b.savingsMinor - a.savingsMinor);
    }
  }, [products, sort]);

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

        {/* Sort row */}
        <View className="flex-row items-center justify-between px-4 py-2.5 border-b-[0.5px] border-border">
          <Text className="text-caption text-secondary">
            <Text className="text-primary font-semibold">{products.length}</Text> items shown
          </Text>
          <Pressable
            onPress={() => setSortMenuOpen(true)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Sort options, currently ${SORT_LABELS[sort]}`}
          >
            <Text className="text-body-sm font-semibold text-brand-primary">
              Sort: {SORT_LABELS[sort]}
            </Text>
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
            data={sortedProducts}
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

        <SortSheet
          visible={sortMenuOpen}
          current={sort}
          onSelect={setSort}
          onClose={() => setSortMenuOpen(false)}
        />
      </View>
    </>
  );
}

type SortSheetProps = {
  visible: boolean;
  current: SortKey;
  onSelect: (key: SortKey) => void;
  onClose: () => void;
};

function SortSheet({ visible, current, onSelect, onClose }: SortSheetProps) {
  const insets = useSafeAreaInsets();
  const c = useThemedColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss sort menu"
        />
        <View
          className="bg-surface rounded-t-xl"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="items-center pt-2 pb-1">
            <View
              className="rounded-full bg-border-strong"
              style={{ width: 40, height: 5, opacity: 0.5 }}
            />
          </View>
          <Text className="text-h3 text-primary px-5 pt-2 pb-2">Sort by</Text>
          {SORT_ORDER.map((key, idx) => {
            const selected = current === key;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  onSelect(key);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${SORT_LABELS[key]}`}
                accessibilityState={{ selected }}
                className={`flex-row items-center justify-between px-5 py-3.5 active:bg-muted ${
                  idx < SORT_ORDER.length - 1 ? 'border-b-[0.5px] border-border' : ''
                }`}
                style={{ minHeight: 52 }}
              >
                <Text
                  className={`text-body ${
                    selected ? 'text-brand-primary font-semibold' : 'text-primary'
                  }`}
                >
                  {SORT_LABELS[key]}
                </Text>
                {selected ? <Check size={18} color={c.brand.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
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
