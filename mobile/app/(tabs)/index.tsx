import { ShoppingBasket } from 'lucide-react-native';
import { useMemo } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AddItemRow from '@/components/list/AddItemRow';
import ListItemRow from '@/components/list/ListItemRow';
import RunningTotalBar from '@/components/list/RunningTotalBar';
import EmptyState from '@/components/ui/EmptyState';
import { type ListItem, useListStore } from '@/stores/useListStore';

export default function HomeScreen() {
  const items = useListStore((s) => s.items);
  const addItem = useListStore((s) => s.addItem);
  const removeItem = useListStore((s) => s.removeItem);
  const toggleChecked = useListStore((s) => s.toggleChecked);
  const setQuantity = useListStore((s) => s.setQuantity);
  const clearChecked = useListStore((s) => s.clearChecked);

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
    return (
      <ListItemRow
        item={item}
        onToggle={() => toggleChecked(item.id)}
        onDelete={() => removeItem(item.id)}
        onIncrement={() => setQuantity(item.id, item.quantity + 1)}
        onDecrement={() => setQuantity(item.id, item.quantity - 1)}
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <View className="px-4 pt-2 pb-3">
        <Text className="text-h1 text-primary">Your list</Text>
      </View>
      <AddItemRow onAdd={addItem} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerClassName={items.length === 0 ? 'flex-1' : ''}
        ListEmptyComponent={
          <EmptyState
            icon={ShoppingBasket}
            heading="Your list is empty"
            body="Add an item above to get started."
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
