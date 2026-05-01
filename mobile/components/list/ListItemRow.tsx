import { Minus, Plus, Trash2 } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import Checkbox from '@/components/ui/Checkbox';
import { formatPrice } from '@/lib/format';
import type { CheapestPrice } from '@/hooks/useCheapestPricesForProducts';
import type { ListItem } from '@/stores/useListStore';

type ListItemRowProps = {
  item: ListItem;
  cheapestPrice?: CheapestPrice | undefined;
  onToggle: () => void;
  onDelete: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onOpenProduct?: (() => void) | undefined;
};

function DeleteAction({ onDelete }: { onDelete: () => void }) {
  return (
    <Pressable
      onPress={onDelete}
      className="bg-danger justify-center items-center w-20"
      accessibilityRole="button"
      accessibilityLabel="Delete item"
    >
      <Trash2 size={20} color="white" />
      <Text className="text-caption text-white mt-1">Delete</Text>
    </Pressable>
  );
}

export default function ListItemRow({
  item,
  cheapestPrice,
  onToggle,
  onDelete,
  onIncrement,
  onDecrement,
  onOpenProduct,
}: ListItemRowProps) {
  const linked = item.productId !== null;
  const canOpen = linked && !!onOpenProduct;
  const priceLabel = cheapestPrice
    ? `from ${formatPrice(cheapestPrice.amountMinorUnits, cheapestPrice.currency)}`
    : linked
      ? 'No price yet'
      : null;

  // Gesture-handler tap that fails on movement past its threshold, so a swipe
  // on the row never resolves as a tap on release.
  const tapToOpen = Gesture.Tap()
    .enabled(canOpen)
    .maxDistance(10)
    .onEnd((_event, success) => {
      if (success && onOpenProduct) onOpenProduct();
    })
    .runOnJS(true);

  return (
    <ReanimatedSwipeable
      renderRightActions={() => <DeleteAction onDelete={onDelete} />}
      friction={2}
      rightThreshold={40}
    >
      <View className="flex-row items-center px-4 py-3 bg-surface border-b-[0.5px] border-border min-h-14">
        <Checkbox
          checked={item.checked}
          onToggle={onToggle}
          accessibilityLabel={`${item.checked ? 'Uncheck' : 'Check'} ${item.name}`}
        />
        <GestureDetector gesture={tapToOpen}>
          <View
            className="flex-1 ml-3"
            accessibilityRole={canOpen ? 'button' : 'text'}
            accessibilityLabel={canOpen ? `Open ${item.name} details` : item.name}
          >
            <Text
              className={`text-body ${item.checked ? 'text-tertiary line-through' : 'text-primary'}`}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {priceLabel ? (
              <Text className="text-caption text-tertiary mt-0.5" numberOfLines={1}>
                {priceLabel}
              </Text>
            ) : null}
          </View>
        </GestureDetector>
        <View className="flex-row items-center bg-muted rounded-full px-1 py-1 ml-3">
          <Pressable
            onPress={onDecrement}
            hitSlop={6}
            disabled={item.quantity <= 1}
            accessibilityRole="button"
            accessibilityLabel="Decrease quantity"
            className={`w-7 h-7 items-center justify-center rounded-full ${item.quantity <= 1 ? 'opacity-30' : ''}`}
          >
            <Minus size={14} color="rgb(95 94 90)" />
          </Pressable>
          <Text
            className="text-body-sm text-primary mx-2 min-w-[20px] text-center"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {item.quantity}
          </Text>
          <Pressable
            onPress={onIncrement}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Increase quantity"
            className="w-7 h-7 items-center justify-center rounded-full"
          >
            <Plus size={14} color="rgb(95 94 90)" />
          </Pressable>
        </View>
      </View>
    </ReanimatedSwipeable>
  );
}
