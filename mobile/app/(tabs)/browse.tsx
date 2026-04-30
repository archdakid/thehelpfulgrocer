import { Store as StoreIcon, WifiOff } from 'lucide-react-native';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import EmptyState from '@/components/ui/EmptyState';
import ListItem from '@/components/ui/ListItem';
import { logger } from '@/lib/logger';
import { type Store, useStores } from '@/hooks/useStores';

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Check your connection and try again.';
}

export default function BrowseScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useStores();

  if (isError) {
    logger.error('useStores failed', { error });
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <View className="px-4 pt-2 pb-3">
        <Text className="text-h1 text-primary">Stores</Text>
        <Text className="text-body-sm text-secondary mt-0.5">
          Tap a store to see its catalog and prices.
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : isError ? (
        <EmptyState
          icon={WifiOff}
          heading="Couldn't load stores"
          body={extractErrorMessage(error)}
          ctaLabel="Try again"
          onCtaPress={() => refetch()}
        />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(store: Store) => store.id}
          renderItem={({ item }) => <ListItem title={item.name} subtitle={item.region} showChevron />}
          contentContainerClassName={(data ?? []).length === 0 ? 'flex-1' : ''}
          ListEmptyComponent={
            <EmptyState
              icon={StoreIcon}
              heading="No stores yet"
              body="Stores are admin-curated. Check back soon."
            />
          }
          refreshing={isRefetching}
          onRefresh={refetch}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
