import { useRouter } from 'expo-router';
import { Pencil, Scan, Search, ShoppingBasket } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import CompareStoresSheet, { type StoreTotal } from '@/components/list/CompareStoresSheet';
import ListComposer, { type ListComposerHandle } from '@/components/list/ListComposer';
import ListItemRow from '@/components/list/ListItemRow';
import ListSectionHeader from '@/components/list/ListSectionHeader';
import RunningTotalCard, {
  type SavingsCallout,
  type TotalSummary,
} from '@/components/list/RunningTotalCard';
import StorePicker from '@/components/list/StorePicker';
import { isCategoryId } from '@/constants/categories';
import { config } from '@/constants/config';
import { useListItemPrices } from '@/hooks/useListItemPrices';
import { useListPricesAllStores } from '@/hooks/useListPricesAllStores';
import { useStores } from '@/hooks/useStores';
import { useThemedColors } from '@/lib/themedColors';
import { type ListItem, useListStore } from '@/stores/useListStore';
import { useUIStore } from '@/stores/useUIStore';

export default function HomeScreen() {
  const router = useRouter();
  const composerRef = useRef<ListComposerHandle>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const items = useListStore((s) => s.items);
  const addItem = useListStore((s) => s.addItem);
  const addProductItem = useListStore((s) => s.addProductItem);
  const removeItem = useListStore((s) => s.removeItem);
  const toggleChecked = useListStore((s) => s.toggleChecked);
  const setQuantity = useListStore((s) => s.setQuantity);
  const clearChecked = useListStore((s) => s.clearChecked);
  const activeStoreId = useUIStore((s) => s.activeStoreId);
  const setActiveStoreId = useUIStore((s) => s.setActiveStoreId);
  const { data: stores } = useStores();

  const linkedProductIds = useMemo(
    () => items.flatMap((item) => (item.productId ? [item.productId] : [])),
    [items],
  );
  const prices = useListItemPrices(linkedProductIds, activeStoreId);
  const allStorePrices = useListPricesAllStores(linkedProductIds);

  const { remaining, checked, total } = useMemo(() => {
    const rem: ListItem[] = [];
    const ck: ListItem[] = [];
    let remainingMinor = 0;
    let checkedMinor = 0;
    let unpricedRemaining = 0;
    let currency: string | null = null;

    for (const item of items) {
      const info = item.productId ? prices.data?.get(item.productId) : undefined;
      const current = info?.current;
      if (item.checked) {
        ck.push(item);
        if (current) checkedMinor += current.amountMinorUnits * item.quantity;
      } else {
        rem.push(item);
        if (current) {
          remainingMinor += current.amountMinorUnits * item.quantity;
          currency = currency ?? current.currency;
        } else {
          unpricedRemaining += 1;
        }
      }
    }

    const summary: TotalSummary | undefined = prices.data && (remainingMinor > 0 || checkedMinor > 0)
      ? {
          remainingMinor,
          checkedMinor,
          currency: currency ?? config.defaultCurrency,
          unpricedRemaining,
        }
      : undefined;

    return { remaining: rem, checked: ck, total: summary };
  }, [items, prices.data]);

  // Per-store totals across the entire list (linked items × quantity).
  // Drives both the savings callout in the running-total card and the
  // compare-stores sheet.
  const storeTotals: StoreTotal[] = useMemo(() => {
    if (!stores || !allStorePrices.data) return [];
    const linkedItems = items.filter((item) => item.productId !== null);
    const totalLinked = linkedItems.length;
    if (totalLinked === 0) return [];

    return stores
      .map((store) => {
        let totalMinor = 0;
        let itemsCovered = 0;
        let currency: string = config.defaultCurrency;
        for (const item of linkedItems) {
          const obs = allStorePrices.data.find(
            (o) => o.productId === item.productId && o.storeId === store.id,
          );
          if (obs) {
            totalMinor += obs.amountMinorUnits * item.quantity;
            itemsCovered += 1;
            currency = obs.currency;
          }
        }
        return {
          storeId: store.id,
          storeName: store.name,
          totalMinor,
          currency,
          itemsCovered,
          missingCount: totalLinked - itemsCovered,
        };
      })
      .filter((t) => t.itemsCovered > 0)
      .sort((a, b) => a.totalMinor - b.totalMinor);
  }, [items, stores, allStorePrices.data]);

  const totalLinkedItems = useMemo(
    () => items.filter((item) => item.productId !== null).length,
    [items],
  );

  // Savings callout: only show when the active store isn't already the
  // cheapest. Hidden in Cheapest mode (where active === cheapest by definition).
  const savings: SavingsCallout | undefined = useMemo(() => {
    if (!activeStoreId || storeTotals.length < 2) return undefined;
    const cheapest = storeTotals[0];
    const active = storeTotals.find((t) => t.storeId === activeStoreId);
    if (!cheapest || !active) return undefined;
    const amountMinor = active.totalMinor - cheapest.totalMinor;
    if (amountMinor <= 0) return undefined;
    return {
      amountMinor,
      storeName: cheapest.storeName,
      currency: cheapest.currency,
    };
  }, [activeStoreId, storeTotals]);

  const canCompare = storeTotals.length >= 2 && totalLinkedItems > 0;

  const storeLabel = activeStoreId
    ? stores?.find((s) => s.id === activeStoreId)?.name ?? 'Selected store'
    : 'Cheapest';

  const isEmpty = items.length === 0;

  function handleAddProduct(product: {
    id: string;
    name: string;
    brand: string | null;
    category: string | null;
  }) {
    addProductItem({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: isCategoryId(product.category) ? product.category : null,
    });
  }

  function renderRow(item: ListItem) {
    const info = item.productId ? prices.data?.get(item.productId) : undefined;
    return (
      <Animated.View
        key={item.id}
        entering={FadeInDown.duration(200)}
        exiting={FadeOut.duration(150)}
        layout={LinearTransition.duration(200)}
      >
        <ListItemRow
          item={item}
          priceInfo={info}
          onToggle={() => toggleChecked(item.id)}
          onDelete={() => removeItem(item.id)}
          onIncrement={() => setQuantity(item.id, item.quantity + 1)}
          onDecrement={() => setQuantity(item.id, item.quantity - 1)}
          onOpenProduct={item.productId ? () => router.push(`/product/${item.productId}`) : undefined}
        />
      </Animated.View>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      {/* Header */}
      <View className="flex-row items-end justify-between px-4 pt-1 pb-2">
        <View>
          <Text className="text-eyebrow uppercase text-tertiary">Shopping at</Text>
          <Text className="text-h1 text-primary mt-0.5">Your list</Text>
        </View>
      </View>

      <StorePicker />
      <ListComposer ref={composerRef} onAddCustom={addItem} onAddProduct={handleAddProduct} />

      {isEmpty ? (
        <EmptyList
          onScan={() => router.push('/(tabs)/scan')}
          onSearch={() => composerRef.current?.focus()}
        />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {remaining.length > 0 ? (
            <>
              <ListSectionHeader label="To buy" count={remaining.length} />
              <View className="mx-3 rounded-lg overflow-hidden bg-surface border-[0.5px] border-border">
                {remaining.map(renderRow)}
              </View>
            </>
          ) : null}

          {checked.length > 0 ? (
            <>
              <ListSectionHeader
                label="In cart"
                count={checked.length}
                action={{ label: 'Clear', onPress: clearChecked }}
              />
              <View className="mx-3 rounded-lg overflow-hidden bg-surface border-[0.5px] border-border">
                {checked.map(renderRow)}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}

      {!isEmpty ? (
        <RunningTotalCard
          remainingCount={remaining.length}
          checkedCount={checked.length}
          total={total}
          storeLabel={storeLabel}
          {...(savings ? { savings } : {})}
          {...(checked.length > 0 ? { onClearChecked: clearChecked } : {})}
          {...(canCompare ? { onCompareStores: () => setCompareOpen(true) } : {})}
        />
      ) : null}

      <CompareStoresSheet
        visible={compareOpen}
        onClose={() => setCompareOpen(false)}
        totals={storeTotals}
        totalItems={totalLinkedItems}
        activeStoreId={activeStoreId}
        onSwitchStore={setActiveStoreId}
      />
    </SafeAreaView>
  );
}

type EmptyListProps = { onScan: () => void; onSearch: () => void };

function EmptyList({ onScan, onSearch }: EmptyListProps) {
  const c = useThemedColors();
  return (
    <View className="flex-1 items-center justify-center px-8" style={{ gap: 16 }}>
      <View
        className="w-[88px] h-[88px] rounded-xl items-center justify-center bg-brand-primary/10"
      >
        <ShoppingBasket size={44} color={c.brand.primary} strokeWidth={1.6} />
      </View>
      <View className="items-center">
        <Text className="text-h2 text-primary mb-1.5">Your list is empty</Text>
        <Text className="text-body text-secondary text-center" style={{ maxWidth: 280 }}>
          Scan a barcode, search for a product, or type to add the first item.
        </Text>
      </View>
      <View className="w-full mt-2" style={{ gap: 10 }}>
        <Pressable
          onPress={onScan}
          accessibilityRole="button"
          accessibilityLabel="Scan an item"
          className="h-[52px] rounded-lg bg-brand-primary items-center justify-center flex-row"
          style={{ gap: 8 }}
        >
          <Scan size={20} color="white" />
          <Text className="text-body font-semibold text-brand-primary-fg">Scan an item</Text>
        </Pressable>
        <Pressable
          onPress={onSearch}
          accessibilityRole="button"
          accessibilityLabel="Search products"
          className="h-11 rounded-lg bg-surface border-[0.5px] border-border items-center justify-center flex-row"
          style={{ gap: 8 }}
        >
          <Search size={18} color={c.text.primary} />
          <Text className="text-body-sm font-medium text-primary">Search products</Text>
        </Pressable>
        <Pressable
          onPress={onSearch}
          accessibilityRole="button"
          accessibilityLabel="Type an item"
          className="h-11 items-center justify-center flex-row"
          style={{ gap: 6 }}
        >
          <Pencil size={16} color={c.brand.primary} />
          <Text className="text-body-sm font-semibold text-brand-primary">Type an item</Text>
        </Pressable>
      </View>
    </View>
  );
}
