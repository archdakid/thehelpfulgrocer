import { Pressable, Text, View } from 'react-native';

import { formatPrice } from '@/lib/format';
import { useThemedColors } from '@/lib/themedColors';

export type TotalSummary = {
  remainingMinor: number;
  checkedMinor: number;
  currency: string;
  unpricedRemaining: number;
};

export type SavingsCallout = {
  amountMinor: number;
  storeName: string;
  currency: string;
};

type RunningTotalCardProps = {
  remainingCount: number;
  checkedCount: number;
  total?: TotalSummary | undefined;
  savings?: SavingsCallout | undefined;
  storeLabel: string;
  onClearChecked?: () => void;
  onCompareStores?: () => void;
};

export default function RunningTotalCard({
  remainingCount,
  checkedCount,
  total,
  savings,
  storeLabel,
  onClearChecked,
  onCompareStores,
}: RunningTotalCardProps) {
  const c = useThemedColors();
  const grandMinor = total ? total.remainingMinor + total.checkedMinor : 0;
  const cartPct = total && grandMinor > 0
    ? Math.round((total.checkedMinor / grandMinor) * 100)
    : 0;
  const showClear = checkedCount > 0 && onClearChecked;

  return (
    <View
      className="mx-3 bg-surface border-[0.5px] border-border rounded-xl"
      style={{
        marginBottom: 8,
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 14,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <View className="flex-row items-end justify-between mb-2" style={{ gap: 12 }}>
        <View className="flex-shrink">
          <Text className="text-eyebrow uppercase text-tertiary">
            Total at {storeLabel}
          </Text>
          {total ? (
            <View className="flex-row items-baseline mt-0.5">
              <Text className="text-body-sm font-semibold text-secondary mr-1">
                {currencySymbol(total.currency)}
              </Text>
              <Text
                className="text-mono-display text-primary"
                style={{ fontVariant: ['tabular-nums'] }}
                numberOfLines={1}
              >
                {(grandMinor / 100).toFixed(2)}
              </Text>
            </View>
          ) : (
            <Text className="text-body-sm text-secondary mt-0.5">
              {remainingCount} remaining · {checkedCount} in cart
            </Text>
          )}
        </View>
        <View className="items-end">
          {savings && savings.amountMinor > 0 ? (
            <Text
              className="text-caption font-semibold"
              style={{ color: c.brand.accent }}
              numberOfLines={1}
            >
              Save {formatPrice(savings.amountMinor, savings.currency)} at {savings.storeName}
            </Text>
          ) : null}
          {onCompareStores ? (
            <Pressable
              onPress={onCompareStores}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Compare stores"
            >
              <Text className="text-body-sm font-semibold text-brand-primary mt-0.5">
                Compare stores ›
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
        <View
          className="h-full bg-brand-primary"
          style={{ width: `${cartPct}%` }}
        />
      </View>

      <View className="flex-row justify-between">
        <Text className="text-caption text-secondary" style={{ fontVariant: ['tabular-nums'] }}>
          <Text className="text-brand-primary font-semibold">
            {total ? formatPrice(total.checkedMinor, total.currency) : '—'}
          </Text>
          {' in cart · '}{checkedCount}
        </Text>
        <Text className="text-caption text-secondary" style={{ fontVariant: ['tabular-nums'] }}>
          <Text className="text-primary font-semibold">
            {total ? formatPrice(total.remainingMinor, total.currency) : '—'}
          </Text>
          {' remaining · '}{remainingCount}
        </Text>
      </View>

      {total && total.unpricedRemaining > 0 ? (
        <Text className="text-caption text-tertiary mt-1.5">
          {total.unpricedRemaining} item{total.unpricedRemaining === 1 ? '' : 's'} without a price
        </Text>
      ) : null}

      {showClear ? (
        <Pressable
          onPress={onClearChecked}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear checked items"
          className="mt-2"
        >
          <Text className="text-body-sm text-brand-primary font-semibold">Clear checked items</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function currencySymbol(currency: string): string {
  switch (currency) {
    case 'TTD': return 'TT$';
    case 'USD': return 'US$';
    default: return currency;
  }
}
