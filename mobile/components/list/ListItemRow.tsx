import { Minus, Plus, Trash2 } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import CategoryGlyph from '@/components/ui/CategoryGlyph';
import Checkbox from '@/components/ui/Checkbox';
import { categoryColors, DEFAULT_CATEGORY } from '@/constants/categories';
import { formatPrice } from '@/lib/format';
import type { ListItemPriceInfo } from '@/hooks/useListItemPrices';
import { useThemedColors } from '@/lib/themedColors';
import type { ListItem } from '@/stores/useListStore';

type ListItemRowProps = {
  item: ListItem;
  priceInfo?: ListItemPriceInfo | undefined;
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
      className="bg-danger justify-center items-center w-20 h-full"
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
  priceInfo,
  onToggle,
  onDelete,
  onIncrement,
  onDecrement,
  onOpenProduct,
}: ListItemRowProps) {
  const linked = item.productId !== null;
  const canOpen = linked && !!onOpenProduct;
  const category = item.category ?? DEFAULT_CATEGORY;
  const tile = categoryColors[category];
  const c = useThemedColors();

  const current = priceInfo?.current;
  const lineTotalMinor = current ? current.amountMinorUnits * item.quantity : null;
  const lineTotalText = current && lineTotalMinor !== null
    ? formatPrice(lineTotalMinor, current.currency)
    : null;
  const unitPriceText = current && item.quantity > 1
    ? `${formatPrice(current.amountMinorUnits, current.currency)} ea`
    : null;

  // "Best price" badge: linked + we have a current price + that price equals
  // the cheapest across all stores. In cheapest mode every linked item with a
  // price qualifies; in at-store mode, only when active store is the cheapest.
  const showBestBadge = linked && !!current && priceInfo?.isBestHere === true;

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
      <View
        className="flex-row items-center px-4 py-3 bg-surface border-b-[0.5px] border-border"
        style={{ minHeight: 64, opacity: item.checked ? 0.55 : 1 }}
      >
        <Checkbox
          checked={item.checked}
          onToggle={onToggle}
          accessibilityLabel={`${item.checked ? 'Uncheck' : 'Check'} ${item.name}`}
        />
        <View
          className="w-11 h-11 rounded-md items-center justify-center ml-3"
          style={{ backgroundColor: tile.bg }}
        >
          <CategoryGlyph category={category} />
        </View>
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
            <View className="flex-row items-center mt-0.5">
              {item.brand ? (
                <Text className="text-caption text-secondary" numberOfLines={1}>
                  {item.brand}
                </Text>
              ) : !linked ? (
                <Text className="text-caption text-tertiary italic" numberOfLines={1}>
                  Custom item
                </Text>
              ) : null}
              {item.quantity > 1 ? (
                <View className="bg-muted rounded-full px-1.5 py-px ml-1.5">
                  <Text className="text-[11px] font-semibold text-secondary">
                    ×{item.quantity}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </GestureDetector>
        <View className="items-end ml-3">
          {lineTotalText ? (
            <Text
              className="text-mono-lg text-primary"
              style={{ fontVariant: ['tabular-nums'] }}
              numberOfLines={1}
            >
              {lineTotalText}
            </Text>
          ) : linked ? (
            <Text className="text-caption text-tertiary italic">No price</Text>
          ) : null}
          {showBestBadge ? (
            <View className="rounded-full px-1.5 py-px mt-1" style={{ backgroundColor: 'rgba(239,159,39,0.18)' }}>
              <Text className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#8A5A1E' }}>
                Best price
              </Text>
            </View>
          ) : unitPriceText ? (
            <Text
              className="text-caption text-tertiary mt-0.5"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {unitPriceText}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center bg-muted rounded-full px-1 py-1 ml-3">
          <Pressable
            onPress={onDecrement}
            hitSlop={6}
            disabled={item.quantity <= 1}
            accessibilityRole="button"
            accessibilityLabel="Decrease quantity"
            className={`w-7 h-7 items-center justify-center rounded-full ${item.quantity <= 1 ? 'opacity-30' : ''}`}
          >
            <Minus size={14} color={c.text.secondary} />
          </Pressable>
          <Text
            className="text-body-sm text-primary mx-1.5 min-w-[16px] text-center"
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
            <Plus size={14} color={c.text.secondary} />
          </Pressable>
        </View>
      </View>
    </ReanimatedSwipeable>
  );
}
