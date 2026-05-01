import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { List, Receipt, ScanLine, Search, Settings as SettingsIcon } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedColors } from '@/lib/themedColors';

type IconKind = 'List' | 'Search' | 'ScanLine' | 'Receipt' | 'Settings';

const ICONS: Record<IconKind, ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
  List,
  Search,
  ScanLine,
  Receipt,
  Settings: SettingsIcon,
};

const ROUTE_META: Record<string, { label: string; icon: IconKind; primary?: boolean }> = {
  index: { label: 'List', icon: 'List' },
  browse: { label: 'Browse', icon: 'Search' },
  scan: { label: 'Scan', icon: 'ScanLine', primary: true },
  receipts: { label: 'Receipts', icon: 'Receipt' },
  settings: { label: 'Settings', icon: 'Settings' },
};

const FAB_DIAMETER = 52;
const FAB_OVERHANG = 18;
const BAR_HEIGHT = 56;

export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const c = useThemedColors();

  return (
    <View
      className="bg-surface border-t-[0.5px] border-border"
      style={{ paddingBottom: insets.bottom }}
    >
      <View
        className="flex-row items-center justify-around px-2"
        style={{ height: BAR_HEIGHT }}
      >
        {state.routes.map((route, index) => {
          const meta = ROUTE_META[route.name];
          if (!meta) return null;
          const isFocused = state.index === index;
          const Icon = ICONS[meta.icon];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          if (meta.primary) {
            return (
              <View key={route.key} className="flex-1 items-center">
                <Pressable
                  onPress={onPress}
                  accessibilityRole="button"
                  accessibilityLabel={meta.label}
                  accessibilityState={isFocused ? { selected: true } : {}}
                  className="bg-brand-primary items-center justify-center"
                  style={{
                    width: FAB_DIAMETER,
                    height: FAB_DIAMETER,
                    borderRadius: FAB_DIAMETER / 2,
                    marginTop: -FAB_OVERHANG,
                    borderWidth: 4,
                    borderColor: c.bg.surface,
                    shadowColor: c.brand.primary,
                    shadowOpacity: 0.3,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 6,
                  }}
                >
                  <Icon size={22} color={c.brand.primaryFg} strokeWidth={2.2} />
                </Pressable>
              </View>
            );
          }

          const tint = isFocused ? c.brand.primary : c.text.tertiary;
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={meta.label}
              accessibilityState={isFocused ? { selected: true } : {}}
              className="flex-1 items-center justify-center"
              style={{ paddingVertical: 4 }}
            >
              <Icon size={22} color={tint} strokeWidth={isFocused ? 2.2 : 2} />
              <Text
                className="text-[10px] mt-0.5"
                style={{ color: tint, fontWeight: isFocused ? '600' : '400' }}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
