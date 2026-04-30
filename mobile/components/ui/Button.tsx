import { ActivityIndicator, Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
};

const containerVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-primary',
  secondary: 'bg-surface border-[0.5px] border-border',
  ghost: 'bg-transparent',
};

const labelVariants: Record<ButtonVariant, string> = {
  primary: 'text-brand-primary-fg',
  secondary: 'text-primary',
  ghost: 'text-brand-primary',
};

const sizeHeights: Record<ButtonSize, string> = {
  sm: 'h-8 px-3',
  md: 'h-11 px-4',
  lg: 'h-[52px] px-6',
};

const sizeText: Record<ButtonSize, string> = {
  sm: 'text-body-sm',
  md: 'text-body',
  lg: 'text-body',
};

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = true,
  accessibilityLabel,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isInactive = disabled || loading;

  return (
    <Animated.View style={animatedStyle} className={fullWidth ? 'w-full' : ''}>
      <Pressable
        onPress={isInactive ? undefined : onPress}
        onPressIn={() => {
          scale.value = withTiming(0.97, { duration: 100 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 100 });
        }}
        disabled={isInactive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: isInactive, busy: loading }}
        className={`flex-row items-center justify-center rounded-lg ${sizeHeights[size]} ${containerVariants[variant]} ${isInactive ? 'opacity-40' : ''}`}
      >
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text className={`font-semibold ${sizeText[size]} ${labelVariants[variant]}`}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
