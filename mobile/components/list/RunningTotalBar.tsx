import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type RunningTotalBarProps = {
  remainingCount: number;
  checkedCount: number;
  onClearChecked?: () => void;
};

export default function RunningTotalBar({
  remainingCount,
  checkedCount,
  onClearChecked,
}: RunningTotalBarProps) {
  const insets = useSafeAreaInsets();
  const showClear = checkedCount > 0 && onClearChecked;

  return (
    <View
      className="bg-surface border-t-[0.5px] border-border px-4 pt-3 flex-row items-center"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <View className="flex-1">
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
        <Text className="text-caption text-tertiary mt-0.5">
          Prices unavailable until stores are connected
        </Text>
      </View>
      {showClear ? (
        <Pressable
          onPress={onClearChecked}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear checked items"
        >
          <Text className="text-body-sm text-brand-primary font-semibold">Clear checked</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
