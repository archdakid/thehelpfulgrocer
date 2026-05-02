import { Pressable, Text, View } from 'react-native';

import CategoryGlyph from '@/components/ui/CategoryGlyph';
import { categoryColors, categoryNames, type CategoryId } from '@/constants/categories';

type CategoryTileProps = {
  category: CategoryId;
  count?: number | undefined;
  lead?: string | undefined;
  onPress: () => void;
};

export default function CategoryTile({ category, count, lead, onPress }: CategoryTileProps) {
  const colors = categoryColors[category];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${categoryNames[category]}`}
      className="rounded-lg p-3.5"
      style={{ backgroundColor: colors.bg, minHeight: 132 }}
    >
      <View
        className="w-10 h-10 rounded-md items-center justify-center mb-2"
        style={{ backgroundColor: 'rgba(255,255,255,0.55)' }}
      >
        <CategoryGlyph category={category} />
      </View>
      <View className="flex-1">
        <Text
          className="mb-0.5"
          style={{ color: colors.fg, fontSize: 15, fontWeight: '600', letterSpacing: -0.1 }}
          numberOfLines={1}
        >
          {categoryNames[category]}
        </Text>
        <Text
          className="text-caption"
          style={{ color: colors.fg, opacity: 0.7, fontVariant: ['tabular-nums'] }}
        >
          {count !== undefined ? `${count} item${count === 1 ? '' : 's'}` : '—'}
        </Text>
      </View>
      {lead ? (
        <Text
          className="text-caption mt-1"
          style={{ color: colors.fg, opacity: 0.78 }}
          numberOfLines={1}
        >
          {lead}
        </Text>
      ) : null}
    </Pressable>
  );
}
