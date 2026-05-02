import { Text, View } from 'react-native';

import Badge from '@/components/ui/Badge';
import { formatPrice, formatRelativeTime, isStalePrice } from '@/lib/format';
import type { PriceAtStore } from '@/hooks/usePricesForProduct';

type PriceComparisonRowProps = {
  entry: PriceAtStore;
  isCheapest: boolean;
};

export default function PriceComparisonRow({ entry, isCheapest }: PriceComparisonRowProps) {
  const stale = isStalePrice(entry.observedAt);

  return (
    <View className="flex-row items-center px-4 py-3 bg-surface border-b-[0.5px] border-border min-h-14">
      <View className="flex-1">
        <Text className="text-body text-primary" numberOfLines={1}>
          {entry.store.name}
        </Text>
        <View className="flex-row items-center mt-0.5">
          <Text className={`text-caption ${stale ? 'text-warning' : 'text-tertiary'}`}>
            {stale ? 'Stale · ' : ''}
            {formatRelativeTime(entry.observedAt)}
          </Text>
          {isCheapest ? (
            <View className="ml-2">
              <Badge label="Best price" variant="accent" />
            </View>
          ) : null}
        </View>
      </View>
      <Text
        className={`text-mono font-semibold ml-3 ${stale ? 'text-tertiary' : 'text-primary'}`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatPrice(entry.amountMinorUnits, entry.currency)}
      </Text>
    </View>
  );
}
