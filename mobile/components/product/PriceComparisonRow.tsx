import { Text, View } from 'react-native';

import Badge from '@/components/ui/Badge';
import {
  formatPackEach,
  formatPerUnitPrice,
  formatPrice,
  formatRelativeTime,
  isStalePrice,
} from '@/lib/format';
import type { PriceAtStore } from '@/hooks/usePricesForProduct';
import type { Product } from '@/hooks/useProduct';

type PriceComparisonRowProps = {
  entry: PriceAtStore;
  product: Pick<Product, 'unit_size' | 'unit_of_measure' | 'units_per_pack' | 'is_sold_by_weight'>;
  isCheapest: boolean;
};

export default function PriceComparisonRow({
  entry,
  product,
  isCheapest,
}: PriceComparisonRowProps) {
  const stale = isStalePrice(entry.observedAt);
  const onSale =
    entry.regularAmountMinorUnits != null &&
    entry.regularAmountMinorUnits > entry.amountMinorUnits;
  const muted = !entry.isAvailable;

  // Out-of-stock takes precedence over best-price; you can't claim "best" on
  // a row the user can't actually buy.
  const badge = muted
    ? { label: 'Out of stock', variant: 'danger' as const }
    : isCheapest
    ? { label: 'Best price', variant: 'accent' as const }
    : null;

  const perUnit = formatPerUnitPrice({
    amountMinorUnits: entry.amountMinorUnits,
    unitSize: product.unit_size,
    unitOfMeasure: product.unit_of_measure,
    currency: entry.currency,
    isSoldByWeight: product.is_sold_by_weight ?? false,
  });
  const packEach = formatPackEach({
    amountMinorUnits: entry.amountMinorUnits,
    unitsPerPack: product.units_per_pack,
    currency: entry.currency,
  });

  return (
    <View
      className="flex-row items-center px-4 py-3 bg-surface border-b-[0.5px] border-border min-h-14"
      style={{ opacity: muted ? 0.55 : 1 }}
    >
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Text className="text-body text-primary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {entry.store.name}
          </Text>
          {entry.promoLabel ? (
            <View className="bg-brand-accent/20 rounded-full px-1.5 self-start" style={{ paddingVertical: 1 }}>
              <Text
                className="text-caption font-semibold text-brand-accent"
                numberOfLines={1}
              >
                {entry.promoLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center mt-0.5" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Text className={`text-caption ${stale ? 'text-warning' : 'text-tertiary'}`}>
            {stale ? 'Stale · ' : ''}
            {formatRelativeTime(entry.observedAt)}
          </Text>
          {badge ? <Badge label={badge.label} variant={badge.variant} /> : null}
        </View>
        {/* Per-unit and pack-each lines render only when they apply. They're
            independent — a "case of 24 cans of 330ml" can show both. */}
        {perUnit || packEach ? (
          <View className="mt-1" style={{ gap: 1 }}>
            {perUnit ? (
              <Text
                className="text-caption text-secondary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {perUnit}
              </Text>
            ) : null}
            {packEach ? (
              <Text
                className="text-caption text-secondary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {packEach}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View className="items-end ml-3" style={{ gap: 2 }}>
        {onSale && entry.regularAmountMinorUnits != null ? (
          <Text
            className="text-caption text-tertiary"
            style={{
              fontVariant: ['tabular-nums'],
              textDecorationLine: 'line-through',
            }}
          >
            {formatPrice(entry.regularAmountMinorUnits, entry.currency)}
          </Text>
        ) : null}
        <Text
          className={`text-mono font-semibold ${stale || muted ? 'text-tertiary' : onSale ? 'text-brand-accent' : 'text-primary'}`}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatPrice(entry.amountMinorUnits, entry.currency)}
        </Text>
      </View>
    </View>
  );
}
