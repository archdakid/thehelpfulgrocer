import { Pressable, Text, View } from 'react-native';

type ListSectionHeaderProps = {
  label: string;
  count: number;
  action?: { label: string; onPress: () => void };
};

export default function ListSectionHeader({ label, count, action }: ListSectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-4 pt-5 pb-2">
      <View className="flex-row items-baseline">
        <Text className="text-eyebrow uppercase text-secondary">{label}</Text>
        <Text className="text-eyebrow uppercase text-tertiary ml-1.5" style={{ fontWeight: '400' }}>
          {count}
        </Text>
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text className="text-body-sm text-brand-primary font-semibold">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
