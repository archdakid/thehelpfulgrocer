import { Pressable, ScrollView, Text } from 'react-native';

import { useStores, type Store } from '@/hooks/useStores';
import { useUIStore } from '@/stores/useUIStore';

const CHEAPEST_LABEL = 'Cheapest';

type PillProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function Pill({ label, active, onPress }: PillProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Set active store: ${label}`}
      accessibilityState={{ selected: active }}
      className={`shrink-0 px-3 py-2 rounded-full border-[0.5px] mr-2 ${
        active ? 'bg-brand-primary border-brand-primary' : 'bg-surface border-border'
      }`}
    >
      <Text
        className={`text-body-sm font-semibold ${active ? 'text-brand-primary-fg' : 'text-primary'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function StorePicker() {
  const activeStoreId = useUIStore((s) => s.activeStoreId);
  const setActiveStoreId = useUIStore((s) => s.setActiveStoreId);
  const { data: stores } = useStores();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
      }}
      className="bg-canvas grow-0 shrink-0"
    >
      <Pill
        label={CHEAPEST_LABEL}
        active={activeStoreId === null}
        onPress={() => setActiveStoreId(null)}
      />
      {(stores ?? [])
        .filter((store: Store) => store.is_active)
        .map((store: Store) => (
          <Pill
            key={store.id}
            label={store.name}
            active={activeStoreId === store.id}
            onPress={() => setActiveStoreId(store.id)}
          />
        ))}
    </ScrollView>
  );
}
