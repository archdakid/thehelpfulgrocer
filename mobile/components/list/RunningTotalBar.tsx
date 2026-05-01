import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatPrice } from '@/lib/format';

export type TotalSummary = {
  remainingMinor: number;
  checkedMinor: number;
  currency: string;
  unpricedRemaining: number;
};

type RunningTotalBarProps = {
  remainingCount: number;
  checkedCount: number;
  total?: TotalSummary | undefined;
  storeLabel: string;
  onClearChecked?: () => void;
};

export default function RunningTotalBar({
  remainingCount,
  checkedCount,
  total,
  storeLabel,
  onClearChecked,
}: RunningTotalBarProps) {
  const insets = useSafeAreaInsets();
  const showClear = checkedCount > 0 && onClearChecked;

  const moneyText = total
    ? `${formatPrice(total.remainingMinor, total.currency)} remaining · ${formatPrice(total.checkedMinor, total.currency)} in cart`
    : null;

  const captionText = total
    ? total.unpricedRemaining > 0
      ? `${storeLabel} · ${total.unpricedRemaining} item${total.unpricedRemaining === 1 ? '' : 's'} without a price`
      : storeLabel
    : 'Add a product from search to see prices';

  return (
    <View
      className="bg-surface border-t-[0.5px] border-border px-4 pt-3 flex-row items-center"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <View className="flex-1">
        {moneyText ? (
          <Text
            className="text-h3 text-primary"
            style={{ fontVariant: ['tabular-nums'] }}
            numberOfLines={1}
          >
            {moneyText}
          </Text>
        ) : (
          <Text className="text-body-sm text-secondary">
            <Text className="text-primary font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
              {remainingCount}
            </Text>
            {' remaining · '}
            <Text className="text-primary font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
              {checkedCount}
            </Text>
            {' in cart'}
          </Text>
        )}
        <Text className="text-caption text-tertiary mt-0.5">{captionText}</Text>
      </View>
      {showClear ? (
        <Pressable
          onPress={onClearChecked}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear checked items"
          className="ml-3"
        >
          <Text className="text-body-sm text-brand-primary font-semibold">Clear checked</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
