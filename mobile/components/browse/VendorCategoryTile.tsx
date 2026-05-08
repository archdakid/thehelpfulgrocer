import { Tag } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useThemedColors } from '@/lib/themedColors';

type VendorCategoryTileProps = {
  root: string;
  count: number;
  onPress: () => void;
};

// Generic counterpart to CategoryTile — vendor taxonomies don't map to our
// eight color tokens (a vendor's "Beverages" isn't the same set as ours), so
// every vendor tile uses a neutral surface and a single icon. The retailer's
// own labelling is the unit of identity.
export default function VendorCategoryTile({ root, count, onPress }: VendorCategoryTileProps) {
  const c = useThemedColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${root}`}
      className="rounded-lg p-3.5 bg-surface border-[0.5px] border-border"
      style={{ minHeight: 132 }}
    >
      <View
        className="w-10 h-10 rounded-md items-center justify-center mb-2 bg-brand-primary/10"
      >
        <Tag size={20} color={c.brand.primary} strokeWidth={2.2} />
      </View>
      <View className="flex-1">
        <Text
          className="mb-0.5 text-primary"
          style={{ fontSize: 15, fontWeight: '600', letterSpacing: -0.1 }}
          numberOfLines={2}
        >
          {root}
        </Text>
        <Text
          className="text-caption text-secondary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {count} item{count === 1 ? '' : 's'}
        </Text>
      </View>
    </Pressable>
  );
}
