import type { LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';

import Button from '@/components/ui/Button';
import { useThemedColors } from '@/lib/themedColors';

type EmptyStateProps = {
  icon: LucideIcon;
  heading: string;
  body?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
};

export default function EmptyState({ icon: Icon, heading, body, ctaLabel, onCtaPress }: EmptyStateProps) {
  const c = useThemedColors();
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Icon size={48} color={c.text.tertiary} strokeWidth={1.5} />
      <Text className="text-h3 text-primary mt-4 text-center">{heading}</Text>
      {body ? (
        <Text className="text-body-sm text-secondary mt-2 text-center">{body}</Text>
      ) : null}
      {ctaLabel && onCtaPress ? (
        <View className="mt-6 w-full max-w-xs">
          <Button label={ctaLabel} onPress={onCtaPress} />
        </View>
      ) : null}
    </View>
  );
}
