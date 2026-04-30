import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type CheckboxProps = {
  checked: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
};

export default function Checkbox({ checked, onToggle, accessibilityLabel }: CheckboxProps) {
  const iconScale = useSharedValue(checked ? 1 : 0);
  iconScale.value = withTiming(checked ? 1 : 0, { duration: 150 });

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
    opacity: iconScale.value,
  }));

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={12}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
    >
      <View
        className={`w-6 h-6 rounded-md items-center justify-center border-[1.5px] ${
          checked ? 'bg-brand-primary border-brand-primary' : 'bg-transparent border-border-strong'
        }`}
      >
        <Animated.View style={iconStyle}>
          <Check size={16} color="white" strokeWidth={3} />
        </Animated.View>
      </View>
    </Pressable>
  );
}
