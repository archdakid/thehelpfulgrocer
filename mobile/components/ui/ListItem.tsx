import { ChevronRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

type ListItemProps = {
  title: string;
  subtitle?: string;
  trailingText?: string;
  trailingMuted?: boolean;
  leading?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  accessibilityLabel?: string;
};

export default function ListItem({
  title,
  subtitle,
  trailingText,
  trailingMuted = false,
  leading,
  onPress,
  showChevron = false,
  accessibilityLabel,
}: ListItemProps) {
  const content = (
    <View className="flex-row items-center px-4 py-3 bg-surface border-b-[0.5px] border-border min-h-14">
      {leading ? <View className="mr-3">{leading}</View> : null}
      <View className="flex-1">
        <Text className="text-body text-primary" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-body-sm text-secondary mt-0.5" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailingText ? (
        <Text
          className={`text-mono ml-3 ${trailingMuted ? 'text-tertiary' : 'text-primary'}`}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {trailingText}
        </Text>
      ) : null}
      {showChevron ? <ChevronRight size={20} color="rgb(136 135 128)" className="ml-2" /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}
