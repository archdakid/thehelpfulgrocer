import { useRouter } from 'expo-router';
import { MapPin, Plus, ScanLine, Search } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CategoryTile from '@/components/browse/CategoryTile';
import VendorCategoryTile from '@/components/browse/VendorCategoryTile';
import { CATEGORY_DISPLAY_ORDER } from '@/constants/categories';
import { useCategoryCounts } from '@/hooks/useCategoryCounts';
import { useStores } from '@/hooks/useStores';
import { useStoreVendorCategories } from '@/hooks/useStoreVendorCategories';
import { useThemedColors } from '@/lib/themedColors';
import { useUIStore } from '@/stores/useUIStore';

const QUICK_ADD = ['Bananas', 'Whole milk', 'Bread', 'Eggs', 'Tomatoes', 'Rice', 'Coffee'];

type BrowseMode = 'global' | 'by-store';

export default function BrowseScreen() {
  const router = useRouter();
  const c = useThemedColors();
  const activeStoreId = useUIStore((s) => s.activeStoreId);
  const { data: stores } = useStores();
  const counts = useCategoryCounts();
  const [mode, setMode] = useState<BrowseMode>('global');
  const vendorCategories = useStoreVendorCategories(
    mode === 'by-store' ? activeStoreId : null,
  );

  const totalProducts = counts.data
    ? [...counts.data.values()].reduce((sum, n) => sum + n, 0)
    : null;
  const activeStoreName = activeStoreId
    ? stores?.find((s) => s.id === activeStoreId)?.name ?? 'your store'
    : 'all stores';
  const placeholder = totalProducts !== null
    ? `Search ${totalProducts} item${totalProducts === 1 ? '' : 's'} at ${activeStoreName}`
    : `Search at ${activeStoreName}`;

  // The by-store toggle only makes sense when a store is selected — vendor
  // categories are per-retailer, and "all stores" is exactly the global view.
  const canShowByStore = !!activeStoreId;
  const effectiveMode: BrowseMode = mode === 'by-store' && canShowByStore ? 'by-store' : 'global';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      {/* Header */}
      <View className="px-4 pt-1 pb-3">
        <Text className="text-eyebrow uppercase text-tertiary">Browse</Text>
        <Text className="text-h1 text-primary mt-0.5">What do you need?</Text>
      </View>

      {/* Search field (visual stub for this session) */}
      <View className="px-4 pb-3">
        <Pressable
          onPress={() => router.push('/search')}
          accessibilityRole="search"
          accessibilityLabel={placeholder}
          className="flex-row items-center bg-surface border-[0.5px] border-border rounded-md px-3.5"
          style={{ height: 44, gap: 10 }}
        >
          <Search size={18} color={c.text.tertiary} />
          <Text className="flex-1 text-body text-tertiary" numberOfLines={1}>
            {placeholder}
          </Text>
          <ScanLine size={18} color={c.brand.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Store-context banner */}
        <View
          className="mx-4 mb-3 px-3 py-2.5 rounded-md flex-row items-center bg-brand-primary/10"
          style={{ gap: 10 }}
        >
          <MapPin size={16} color={c.brand.primary} />
          <Text className="flex-1 text-body-sm text-primary" numberOfLines={1}>
            Showing prices at{' '}
            <Text className="font-semibold">{activeStoreName}</Text>
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Change store"
          >
            <Text className="text-body-sm font-semibold text-brand-primary">Change</Text>
          </Pressable>
        </View>

        {/* Global / By-store toggle. Hidden when no store is picked — the
            by-store view has nothing to render in that case. */}
        {canShowByStore ? (
          <View className="px-4 pb-3">
            <ModeToggle mode={effectiveMode} onChange={setMode} />
          </View>
        ) : null}

        {effectiveMode === 'global' ? (
          <GlobalGrid
            counts={counts.data}
            onPress={(cat) => router.push(`/category/${cat}`)}
          />
        ) : (
          <ByStoreGrid
            storeId={activeStoreId!}
            isLoading={vendorCategories.isLoading}
            isError={vendorCategories.isError}
            categories={vendorCategories.data ?? []}
            onPress={(root) =>
              router.push(`/category/store/${activeStoreId}/${encodeURIComponent(root)}`)
            }
          />
        )}

        {/* Often bought */}
        <Text className="text-eyebrow uppercase text-secondary px-4 pt-5 pb-2">Often bought</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}
          className="grow-0"
        >
          {QUICK_ADD.map((label) => (
            <Pressable
              key={label}
              onPress={() => {
                // TODO(yashua): wire quick-add when product-by-name resolution lands.
              }}
              accessibilityRole="button"
              accessibilityLabel={`Add ${label}`}
              className="flex-row items-center bg-surface border-[0.5px] border-border rounded-full"
              style={{ paddingHorizontal: 14, paddingVertical: 8, gap: 6 }}
            >
              <Plus size={14} color={c.brand.primary} strokeWidth={2.4} />
              <Text className="text-body-sm font-medium text-primary">{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

type ModeToggleProps = {
  mode: BrowseMode;
  onChange: (mode: BrowseMode) => void;
};

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <View
      className="flex-row items-center bg-surface border-[0.5px] border-border rounded-md p-0.5"
      accessibilityRole="tablist"
    >
      <ToggleButton
        label="All stores"
        active={mode === 'global'}
        onPress={() => onChange('global')}
      />
      <ToggleButton
        label="This store"
        active={mode === 'by-store'}
        onPress={() => onChange('by-store')}
      />
    </View>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      className={`flex-1 items-center justify-center rounded ${active ? 'bg-brand-primary/10' : ''}`}
      style={{ paddingVertical: 8 }}
    >
      <Text
        className={`text-body-sm ${active ? 'text-brand-primary font-semibold' : 'text-secondary'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type GlobalGridProps = {
  counts: Map<string, number> | undefined;
  onPress: (cat: string) => void;
};

function GlobalGrid({ counts, onPress }: GlobalGridProps) {
  return (
    <>
      <Text className="text-eyebrow uppercase text-secondary px-4 pb-2">Categories</Text>
      <View className="px-3 flex-row flex-wrap">
        {CATEGORY_DISPLAY_ORDER.map((cat) => (
          <View key={cat} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <CategoryTile
              category={cat}
              count={counts?.get(cat)}
              onPress={() => onPress(cat)}
            />
          </View>
        ))}
      </View>
    </>
  );
}

type ByStoreGridProps = {
  storeId: string;
  isLoading: boolean;
  isError: boolean;
  categories: { root: string; productCount: number }[];
  onPress: (root: string) => void;
};

function ByStoreGrid({ isLoading, isError, categories, onPress }: ByStoreGridProps) {
  return (
    <>
      <Text className="text-eyebrow uppercase text-secondary px-4 pb-2">
        At this store
      </Text>
      {isLoading ? (
        <View className="py-10 items-center">
          <ActivityIndicator />
        </View>
      ) : isError ? (
        <View className="px-4">
          <Text className="text-body-sm text-tertiary">
            Couldn't load this store's categories. Pull to refresh.
          </Text>
        </View>
      ) : categories.length === 0 ? (
        <View className="px-4">
          <Text className="text-body-sm text-tertiary">
            No vendor categories yet for this store. They appear once a scrape run
            ingests this store's catalog.
          </Text>
        </View>
      ) : (
        <View className="px-3 flex-row flex-wrap">
          {categories.map((cat) => (
            <View
              key={cat.root}
              style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}
            >
              <VendorCategoryTile
                root={cat.root}
                count={cat.productCount}
                onPress={() => onPress(cat.root)}
              />
            </View>
          ))}
        </View>
      )}
    </>
  );
}
