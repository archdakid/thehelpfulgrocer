import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, PackageOpen, Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import EmptyState from '@/components/ui/EmptyState';
import { useSearchProducts } from '@/hooks/useSearchProducts';
import { useThemedColors } from '@/lib/themedColors';

const MIN_QUERY_LENGTH = 2;

// Tiny inline debouncer — keystroke-triggered fetches would otherwise race
// with each other on a small catalog. 220ms is below the threshold where a
// user would notice a delay but enough to coalesce rapid typing.
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

export default function SearchScreen() {
  const router = useRouter();
  const c = useThemedColors();

  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 220);
  const trimmed = debounced.trim();
  const queryQ = useSearchProducts(debounced);

  const showInitial = trimmed.length === 0;
  const showTooShort = trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH;
  const isLoading = !showInitial && !showTooShort && queryQ.isFetching;
  const isError = !!queryQ.error && !isLoading;
  const results = queryQ.data ?? [];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
        <View className="flex-row items-center px-2 pt-1 pb-2" style={{ gap: 4 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="w-11 h-11 items-center justify-center"
          >
            <ArrowLeft size={22} color={c.text.primary} />
          </Pressable>
          <View
            className="flex-1 flex-row items-center bg-surface border-[0.5px] border-border rounded-md px-3"
            style={{ height: 40, gap: 8 }}
          >
            <Search size={16} color={c.text.tertiary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              placeholder="Search products"
              placeholderTextColor={c.text.tertiary}
              returnKeyType="search"
              accessibilityLabel="Search products"
              className="flex-1 text-body text-primary"
              style={{ paddingVertical: 0 }}
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <X size={16} color={c.text.tertiary} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {showInitial ? (
          <EmptyState
            icon={Search}
            heading="Search the catalog"
            body="Type at least two letters to look up a product by name."
          />
        ) : showTooShort ? (
          <EmptyState
            icon={Search}
            heading="Keep typing"
            body="Two letters or more to start searching."
          />
        ) : isLoading && results.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : isError ? (
          <EmptyState
            icon={PackageOpen}
            heading="Search failed"
            body="Check your connection and try again."
            ctaLabel="Retry"
            onCtaPress={() => queryQ.refetch()}
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            heading="No matches"
            body={`Nothing in the catalog matches "${trimmed}" yet.`}
          />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(p) => p.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/product/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.name}`}
                className="flex-row items-center px-4 py-3 bg-surface border-b-[0.5px] border-border"
                style={{ minHeight: 60 }}
              >
                <View className="flex-1 min-w-0">
                  <Text className="text-body text-primary" numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.brand ? (
                    <Text className="text-caption text-secondary mt-0.5" numberOfLines={1}>
                      {item.brand}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight size={18} color={c.text.tertiary} />
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </>
  );
}
