import { useRouter } from 'expo-router';
import { ShoppingBasket } from 'lucide-react-native';
import { useMemo } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ListComposer from '@/components/list/ListComposer';
import ListItemRow from '@/components/list/ListItemRow';
import RunningTotalBar from '@/components/list/RunningTotalBar';
import EmptyState from '@/components/ui/EmptyState';
import { useCheapestPricesForProducts } from '@/hooks/useCheapestPricesForProducts';
import { type ListItem, useListStore } from '@/stores/useListStore';

export default function HomeScreen() {
  const router = useRouter();
  const items = useListStore((s) => s.items);
  const addItem = useListStore((s) => s.addItem);
  const addProductItem = useListStore((s) => s.addProductItem);
  const removeItem = useListStore((s) => s.removeItem);
  const toggleChecked = useListStore((s) => s.toggleChecked);
  const setQuantity = useListStore((s) => s.setQuantity);
  const clearChecked = useListStore((s) => s.clearChecked);

  const linkedProductIds = useMemo(
    () => items.flatMap((item) => (item.productId ? [item.productId] : [])),
    [items],
  );
  const cheapestPrices = useCheapestPricesForProducts(linkedProductIds);

  const { remainingCount, checkedCount } = useMemo(() => {
    let remaining = 0;
    let checked = 0;
    for (const item of items) {
      if (item.checked) {
        checked += 1;
      } else {
        remaining += 1;
      }
    }
    return { remainingCount: remaining, checkedCount: checked };
  }, [items]);

  function renderItem({ item }: { item: ListItem }) {
    const cheapest = item.productId ? cheapestPrices.data?.get(item.productId) : undefined;
    return (
      <ListItemRow
        item={item}
        cheapestPrice={cheapest}
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
      <View className="px-4 pt-2 pb-3">
        <Text className="text-h1 text-primary">Your list</Text>
      </View>
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
        onClearChecked={clearChecked}
      />
    </SafeAreaView>
  );
}
