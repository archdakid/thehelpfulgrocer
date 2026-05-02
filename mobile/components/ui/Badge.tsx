import { Text, View } from 'react-native';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'accent';

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
};

const containerByVariant: Record<BadgeVariant, string> = {
  // 12% bg via opacity-10/20 approximations from the design system spec
  success: 'bg-success/10',
  warning: 'bg-warning/10',
  danger: 'bg-danger/10',
  accent: 'bg-brand-accent/20',
};

const textByVariant: Record<BadgeVariant, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  accent: 'text-brand-accent',
};

export default function Badge({ label, variant = 'success' }: BadgeProps) {
  return (
    <View className={`rounded-full px-1.5 py-0.5 self-start ${containerByVariant[variant]}`}>
      <Text className={`text-caption font-semibold ${textByVariant[variant]}`}>{label}</Text>
    </View>
  );
}
