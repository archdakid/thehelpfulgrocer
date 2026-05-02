import { useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatPrice } from '@/lib/format';
import { useThemedColors } from '@/lib/themedColors';

export type StoreTotal = {
  storeId: string;
  storeName: string;
  totalMinor: number;
  currency: string;
  itemsCovered: number;
  missingCount: number;
};

type CompareStoresSheetProps = {
  visible: boolean;
  onClose: () => void;
  totals: StoreTotal[];          // pre-sorted cheapest first
  totalItems: number;
  activeStoreId: string | null;
  onSwitchStore: (storeId: string) => void;
};

const TEAL_DELTA_FILL_FLOOR = 0.15; // worst store still shows a small bar
const SCREEN_HEIGHT = Dimensions.get('window').height;
const ENTER_MS = 280;
const EXIT_MS = 220;

export default function CompareStoresSheet({
  visible,
  onClose,
  totals,
  totalItems,
  activeStoreId,
  onSwitchStore,
}: CompareStoresSheetProps) {
  const insets = useSafeAreaInsets();
  const c = useThemedColors();

  // Stay mounted through the exit animation so the sheet has time to slide out
  // before the Modal unmounts its children. progress goes 0 -> 1 to enter,
  // 1 -> 0 to exit.
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: ENTER_MS });
    } else {
      progress.value = withTiming(0, { duration: EXIT_MS }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible, progress]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.5,
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * SCREEN_HEIGHT }],
  }));

  const cheapest = totals[0];
  const activeIndex = activeStoreId
    ? totals.findIndex((t) => t.storeId === activeStoreId)
    : -1;
  const activeTotal = activeIndex >= 0 ? totals[activeIndex] : undefined;
  const savingsMinor = cheapest && activeTotal
    ? Math.max(0, activeTotal.totalMinor - cheapest.totalMinor)
    : 0;

  const min = cheapest?.totalMinor ?? 0;
  const max = totals[totals.length - 1]?.totalMinor ?? min;
  const range = Math.max(1, max - min);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end">
        <Animated.View
          pointerEvents={visible ? 'auto' : 'none'}
          style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'black' }, scrimStyle]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close compare stores"
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <Animated.View
          className="bg-surface rounded-t-xl"
          style={[{ maxHeight: '88%' }, sheetStyle]}
        >
          {/* Drag handle */}
          <View className="items-center pt-2 pb-1">
            <View
              className="rounded-full bg-border-strong"
              style={{ width: 40, height: 5, opacity: 0.5 }}
            />
          </View>

          {/* Header */}
          <View className="px-5 pb-3">
            <Text className="text-h2 text-primary">Compare stores</Text>
            <Text className="text-body text-secondary mt-0.5">
              {totalItems} item{totalItems === 1 ? '' : 's'} · prices observed by SmartShopper
            </Text>
          </View>

          {/* Savings callout */}
          {savingsMinor > 0 && cheapest ? (
            <View
              className="mx-4 mb-3 px-3.5 py-3 rounded-lg flex-row items-center"
              style={{
                backgroundColor: 'rgba(239,159,39,0.12)',
                borderWidth: 0.5,
                borderColor: 'rgba(239,159,39,0.35)',
                gap: 12,
              }}
            >
              <View
                className="w-9 h-9 rounded-full items-center justify-center"
                style={{ backgroundColor: c.brand.accent }}
              >
                <Text className="text-body font-bold text-inverse">$</Text>
              </View>
              <View className="flex-1">
                <Text
                  className="text-body-sm font-semibold"
                  style={{ color: '#8A5A1E' }}
                  numberOfLines={1}
                >
                  Save {formatPrice(savingsMinor, cheapest.currency)} at {cheapest.storeName}
                </Text>
                {cheapest.missingCount > 0 ? (
                  <Text className="text-caption text-secondary mt-0.5">
                    {cheapest.missingCount} item{cheapest.missingCount === 1 ? '' : 's'} not stocked there
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Bar list */}
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {totals.map((t, idx) => {
              const isBest = idx === 0;
              const isCurrent = t.storeId === activeStoreId;
              const delta = t.totalMinor - min;
              // Best gets full bar; worst gets minimum visible width.
              const barFraction = 1 - ((t.totalMinor - min) / range) * (1 - TEAL_DELTA_FILL_FLOOR);
              const barFill = `${Math.round(barFraction * 100)}%` as const;

              return (
                <View
                  key={t.storeId}
                  className={`py-3.5 ${idx < totals.length - 1 ? 'border-b-[0.5px] border-border' : ''}`}
                >
                  <View className="flex-row items-baseline justify-between mb-2">
                    <View className="flex-1 flex-row items-center" style={{ gap: 8, minWidth: 0 }}>
                      <Text className="text-[15px] font-semibold text-primary" numberOfLines={1}>
                        {t.storeName}
                      </Text>
                      {isBest ? (
                        <View
                          className="rounded-full px-1.5"
                          style={{ backgroundColor: c.brand.accent, paddingVertical: 2 }}
                        >
                          <Text
                            className="text-[10px] uppercase font-bold text-inverse"
                            style={{ letterSpacing: 0.5 }}
                          >
                            Best
                          </Text>
                        </View>
                      ) : null}
                      {isCurrent ? (
                        <View
                          className="rounded-full px-1.5 bg-brand-primary/10"
                          style={{ paddingVertical: 2 }}
                        >
                          <Text
                            className="text-[10px] uppercase font-semibold text-brand-primary"
                            style={{ letterSpacing: 0.4 }}
                          >
                            You
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View className="flex-row items-baseline" style={{ gap: 6 }}>
                      {delta > 0 ? (
                        <Text
                          className="text-caption text-tertiary"
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          +{formatPrice(delta, t.currency)}
                        </Text>
                      ) : null}
                      <Text
                        className="text-mono-lg"
                        style={{
                          color: isBest ? c.brand.accent : c.text.primary,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {formatPrice(t.totalMinor, t.currency)}
                      </Text>
                    </View>
                  </View>
                  {/* Bar */}
                  <View className="h-2 rounded-full bg-muted overflow-hidden mb-1.5">
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: barFill,
                        backgroundColor: isBest
                          ? c.brand.accent
                          : isCurrent
                          ? c.brand.primary
                          : c.text.tertiary,
                        opacity: isBest || isCurrent ? 1 : 0.55,
                      }}
                    />
                  </View>
                  <View className="flex-row" style={{ gap: 14 }}>
                    <Text
                      className="text-caption text-secondary"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {t.itemsCovered}/{totalItems} in stock
                    </Text>
                    {t.missingCount > 0 ? (
                      <Text
                        className="text-caption font-semibold"
                        style={{ color: c.brand.accent }}
                      >
                        {t.missingCount} missing
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Sticky CTA footer */}
          <View
            className="border-t-[0.5px] border-border flex-row"
            style={{
              paddingTop: 12,
              paddingHorizontal: 16,
              paddingBottom: Math.max(insets.bottom, 16),
              gap: 10,
            }}
          >
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={activeTotal ? `Stay at ${activeTotal.storeName}` : 'Close'}
              className="flex-1 h-[50px] rounded-lg bg-muted items-center justify-center px-2"
            >
              <Text
                className="text-body font-semibold text-primary"
                numberOfLines={1}
              >
                {activeTotal ? `Stay at ${activeTotal.storeName}` : 'Close'}
              </Text>
            </Pressable>
            {cheapest && cheapest.storeId !== activeStoreId ? (
              <Pressable
                onPress={() => {
                  onSwitchStore(cheapest.storeId);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${cheapest.storeName}`}
                className="h-[50px] rounded-lg bg-brand-primary items-center justify-center px-2"
                style={{ flex: 1.4 }}
              >
                <Text
                  className="text-body font-semibold text-brand-primary-fg"
                  numberOfLines={1}
                >
                  Switch to {cheapest.storeName}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
