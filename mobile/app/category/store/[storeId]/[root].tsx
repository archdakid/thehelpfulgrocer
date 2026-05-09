import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, PackageOpen, Tag, WifiOff } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CategoryProductRow from '@/components/browse/CategoryProductRow';
import EmptyState from '@/components/ui/EmptyState';
import { isCategoryId } from '@/constants/categories';
import {
  useProductsAtStoreVendorPath,
  type StoreVendorProductRow,
} from '@/hooks/useProductsAtStoreVendorRoot';
import { useStores } from '@/hooks/useStores';
import { useStoreVendorCategoryTree } from '@/hooks/useStoreVendorCategoryTree';
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

  // null = "All" chip selected (everything under root); otherwise filter to
  // products at "root › child" or its descendants.
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  const treeQuery = useStoreVendorCategoryTree(storeId, root);
  const productsQuery = useProductsAtStoreVendorPath(storeId, root, selectedChild);

  const inListIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.productId) set.add(item.productId);
    return set;
  }, [items]);

  if (productsQuery.isError) {
    logger.error('useProductsAtStoreVendorPath failed', {
      storeId,
      root,
      child: selectedChild,
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
  const tree = treeQuery.data;
  // Show chips only when we have at least one subcategory worth navigating
  // into. Single-segment paths (e.g. PriceSmart's flat "Groceries") collapse
  // to a flat product list — chips would be a single useless "All".
  const showChips = !!tree && tree.children.length > 0;

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
              {tree ? (
                <Text
                  className="text-body-sm text-secondary mt-0.5"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {tree.total} item{tree.total === 1 ? '' : 's'}
                  {tree.children.length > 0
                    ? ` · ${tree.children.length} subcategor${tree.children.length === 1 ? 'y' : 'ies'}`
                    : ''}
                </Text>
              ) : null}
            </View>
          </View>
          {showChips ? (
            <ChipBar
              total={tree.total}
              children={tree.children}
              selected={selectedChild}
              onSelect={setSelectedChild}
            />
          ) : null}
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
          selectedChild ? (
            <EmptyState
              icon={PackageOpen}
              heading="No products yet"
              body={`Nothing under "${selectedChild}" right now.`}
              ctaLabel={`Show all in ${root}`}
              onCtaPress={() => setSelectedChild(null)}
            />
          ) : (
            <EmptyState
              icon={PackageOpen}
              heading="No products yet"
              body="This category will fill in as scrape runs ingest more of this store's catalog."
            />
          )
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

type ChipBarProps = {
  total: number;
  children: { name: string; productCount: number }[];
  selected: string | null;
  onSelect: (name: string | null) => void;
};

function ChipBar({ total, children, selected, onSelect }: ChipBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10, gap: 6 }}
    >
      <Chip
        label="All"
        count={total}
        selected={selected === null}
        onPress={() => onSelect(null)}
      />
      {children.map((child) => (
        <Chip
          key={child.name}
          label={child.name}
          count={child.productCount}
          selected={selected === child.name}
          onPress={() => onSelect(child.name)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${count} item${count === 1 ? '' : 's'}`}
      className={`flex-row items-center rounded-full border-[0.5px] ${
        selected
          ? 'bg-brand-primary border-brand-primary'
          : 'bg-surface border-border'
      }`}
      style={{ paddingHorizontal: 12, paddingVertical: 6, gap: 6 }}
    >
      <Text
        className={`text-body-sm ${selected ? 'text-brand-primary-fg font-semibold' : 'text-primary'}`}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        className={`text-caption ${selected ? 'text-brand-primary-fg/80' : 'text-tertiary'}`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {count}
      </Text>
    </Pressable>
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
