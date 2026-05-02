import { Check, Plus } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import CategoryGlyph from '@/components/ui/CategoryGlyph';
import { categoryColors } from '@/constants/categories';
import { formatPrice } from '@/lib/format';
import { useThemedColors } from '@/lib/themedColors';
import type { CategoryProductRow as CategoryProductRowData } from '@/hooks/useProductsInCategory';

type CategoryProductRowProps = {
  row: CategoryProductRowData;
  inList: boolean;
  onOpen: () => void;
  onAdd: () => void;
};

export default function CategoryProductRow({
  row,
  inList,
  onOpen,
  onAdd,
}: CategoryProductRowProps) {
  const c = useThemedColors();
  const tile = categoryColors[row.category];
  const here = row.here;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open ${row.name}`}
      className="flex-row items-center px-4 py-3 bg-surface border-b-[0.5px] border-border"
      style={{ minHeight: 72 }}
    >
      <View
        className="w-12 h-12 rounded-md items-center justify-center mr-3"
        style={{ backgroundColor: tile.bg }}
      >
        <CategoryGlyph category={row.category} />
      </View>

      <View className="flex-1 min-w-0">
        <View className="flex-row items-baseline">
          <Text
            className="flex-1 text-[15px] text-primary"
            style={{ fontWeight: '500' }}
            numberOfLines={1}
          >
            {row.name}
          </Text>
          {inList ? (
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(120)}
              className="ml-2 flex-row items-center bg-brand-primary/10 rounded-full px-1.5"
              style={{ paddingVertical: 2, gap: 3 }}
            >
              <Check size={10} color={c.brand.primary} strokeWidth={3} />
              <Text
                className="text-[10px] uppercase font-semibold"
                style={{ color: c.brand.primary, letterSpacing: 0.4 }}
              >
                On list
              </Text>
            </Animated.View>
          ) : null}
        </View>
        {row.brand ? (
          <Text className="text-caption text-secondary mt-0.5" numberOfLines={1}>
            {row.brand}
          </Text>
        ) : null}
        <View className="mt-1.5">
          {!here ? (
            <Text className="text-caption text-tertiary italic">Not at this store</Text>
          ) : row.savingsMinor > 0 && row.cheapest ? (
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <View
                className="rounded-full px-1.5"
                style={{ backgroundColor: 'rgba(239,159,39,0.18)', paddingVertical: 1 }}
              >
                <Text
                  className="text-[11px] font-semibold"
                  style={{ color: '#8A5A1E', fontVariant: ['tabular-nums'] }}
                >
                  {formatPrice(row.cheapest.amountMinorUnits, row.cheapest.currency)} at {row.cheapest.storeName}
                </Text>
              </View>
              <Text className="text-[11px] text-tertiary">
                save {formatPrice(row.savingsMinor, here.currency)}
              </Text>
            </View>
          ) : (
            <Text
              className="text-[11px] uppercase font-semibold"
              style={{ color: c.brand.primary, letterSpacing: 0.3 }}
            >
              Best price here
            </Text>
          )}
        </View>
      </View>

      <View className="items-end ml-3" style={{ gap: 4 }}>
        {here ? (
          <Text
            className="text-mono-lg"
            style={{
              color: row.savingsMinor > 0 ? c.text.secondary : c.text.primary,
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatPrice(here.amountMinorUnits, here.currency)}
          </Text>
        ) : null}
        <Pressable
          onPress={(e) => { e.stopPropagation(); if (!inList) onAdd(); }}
          accessibilityRole="button"
          accessibilityLabel={inList ? `${row.name} is on the list` : `Add ${row.name} to the list`}
          accessibilityState={{ selected: inList }}
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: inList ? 'rgba(15,110,86,0.10)' : c.brand.primary }}
        >
          {inList ? (
            <Check size={16} color={c.brand.primary} strokeWidth={2.4} />
          ) : (
            <Plus size={16} color={c.brand.primaryFg} strokeWidth={2.4} />
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}
