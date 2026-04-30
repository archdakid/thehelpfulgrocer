import type { LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';

import Button from '@/components/ui/Button';

type EmptyStateProps = {
  icon: LucideIcon;
  heading: string;
  body?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
};

export default function EmptyState({ icon: Icon, heading, body, ctaLabel, onCtaPress }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Icon size={48} color="rgb(136 135 128)" strokeWidth={1.5} />
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
