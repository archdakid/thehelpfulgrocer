import { useRouter } from 'expo-router';
import { ShoppingBasket } from 'lucide-react-native';
import { useMemo } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ListComposer from '@/components/list/ListComposer';
import ListItemRow from '@/components/list/ListItemRow';
import RunningTotalBar, { type TotalSummary } from '@/components/list/RunningTotalBar';
import StorePicker from '@/components/list/StorePicker';
import EmptyState from '@/components/ui/EmptyState';
import { useListItemPrices } from '@/hooks/useListItemPrices';
import { useStores } from '@/hooks/useStores';
import { config } from '@/constants/config';
import { type ListItem, useListStore } from '@/stores/useListStore';
import { useUIStore } from '@/stores/useUIStore';

export default function HomeScreen() {
  const router = useRouter();
  const items = useListStore((s) => s.items);
  const addItem = useListStore((s) => s.addItem);
  const addProductItem = useListStore((s) => s.addProductItem);
  const removeItem = useListStore((s) => s.removeItem);
  const toggleChecked = useListStore((s) => s.toggleChecked);
  const setQuantity = useListStore((s) => s.setQuantity);
  const clearChecked = useListStore((s) => s.clearChecked);
  const activeStoreId = useUIStore((s) => s.activeStoreId);
  const { data: stores } = useStores();

  const linkedProductIds = useMemo(
    () => items.flatMap((item) => (item.productId ? [item.productId] : [])),
    [items],
  );
  const prices = useListItemPrices(linkedProductIds, activeStoreId);

  const { remainingCount, checkedCount, total } = useMemo(() => {
    let remaining = 0;
    let checked = 0;
    let remainingMinor = 0;
    let checkedMinor = 0;
    let unpricedRemaining = 0;
    let currency: string | null = null;

    for (const item of items) {
      const price = item.productId ? prices.data?.get(item.productId) : undefined;
      if (item.checked) {
        checked += 1;
        if (price) checkedMinor += price.amountMinorUnits * item.quantity;
      } else {
        remaining += 1;
        if (price) {
          remainingMinor += price.amountMinorUnits * item.quantity;
          currency = currency ?? price.currency;
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

    return { remainingCount: remaining, checkedCount: checked, total: summary };
  }, [items, prices.data]);

  const priceMode = activeStoreId ? 'at-store' : 'cheapest';
  const storeLabel = activeStoreId
    ? stores?.find((s) => s.id === activeStoreId)?.name ?? 'Selected store'
    : 'Cheapest across all stores';

  function renderItem({ item }: { item: ListItem }) {
    const price = item.productId ? prices.data?.get(item.productId) : undefined;
    return (
      <ListItemRow
        item={item}
        price={price}
        priceMode={priceMode}
        onToggle={() => toggleChecked(item.id)}
        onDelete={() => removeItem(item.id)}
        onIncrement={() => setQuantity(item.id, item.quantity + 1)}
        onDecrement={() => setQuantity(item.id, item.quantity - 1)}
        onOpenProduct={item.productId ? () => router.push(`/product/${item.productId}`) : undefined}
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <View className="px-4 pt-2 pb-1">
        <Text className="text-h1 text-primary">Your list</Text>
      </View>
      <StorePicker />
      <ListComposer onAddCustom={addItem} onAddProduct={addProductItem} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerClassName={items.length === 0 ? 'flex-1' : ''}
        ListEmptyComponent={
          <EmptyState
            icon={ShoppingBasket}
            heading="Your list is empty"
            body="Search for a product or type any text and tap +."
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
      <RunningTotalBar
        remainingCount={remainingCount}
        checkedCount={checkedCount}
        total={total}
        storeLabel={storeLabel}
        onClearChecked={clearChecked}
      />
    </SafeAreaView>
  );
}
