import { Plus, Search } from 'lucide-react-native';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import Input from '@/components/ui/Input';
import { useSearchProducts } from '@/hooks/useSearchProducts';
import type { Product } from '@/hooks/useProduct';
import { useThemedColors } from '@/lib/themedColors';

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

type ListComposerProps = {
  onAddCustom: (name: string) => void;
  onAddProduct: (product: Product) => void;
};

export type ListComposerHandle = {
  focus: () => void;
};

const ListComposer = forwardRef<ListComposerHandle, ListComposerProps>(function ListComposer(
  { onAddCustom, onAddProduct },
  ref,
) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef<TextInput>(null);
  const c = useThemedColors();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const search = useSearchProducts(debounced);
  const showResults = debounced.length >= MIN_QUERY_LENGTH;
  const results = search.data ?? [];

  function reset() {
    setQuery('');
    setDebounced('');
    inputRef.current?.focus();
  }

  function handleAddCustom() {
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    onAddCustom(trimmed);
    reset();
  }

  function handlePickProduct(product: Product) {
    onAddProduct(product);
    reset();
  }

  return (
    <View className="bg-canvas">
      <View className="flex-row items-center px-4 py-3">
        <View className="flex-1">
          <Input
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search products or add an item…"
            accessibilityLabel="Search products or add a custom item"
            returnKeyType="done"
            onSubmitEditing={handleAddCustom}
            blurOnSubmit={false}
            autoCapitalize="sentences"
          />
        </View>
        <Pressable
          onPress={handleAddCustom}
          disabled={query.trim().length === 0}
          accessibilityRole="button"
          accessibilityLabel="Add as custom item"
          className={`ml-2 w-11 h-11 items-center justify-center rounded-md bg-brand-primary ${
            query.trim().length === 0 ? 'opacity-40' : ''
          }`}
        >
          <Plus size={22} color="white" />
        </Pressable>
      </View>

      {showResults ? (
        <View className="mx-4 mb-3 bg-surface rounded-lg border-[0.5px] border-border overflow-hidden">
          {search.isFetching ? (
            <View className="flex-row items-center px-4 py-3">
              <ActivityIndicator />
              <Text className="text-body-sm text-secondary ml-3">Searching…</Text>
            </View>
          ) : results.length === 0 ? (
            <View className="px-4 py-3">
              <Text className="text-body-sm text-secondary">No matching products.</Text>
            </View>
          ) : (
            results.map((product) => (
              <Pressable
                key={product.id}
                onPress={() => handlePickProduct(product)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${product.name} to list`}
                className="flex-row items-center px-4 py-3 border-b-[0.5px] border-border"
              >
                <Search size={16} color={c.text.tertiary} />
                <View className="flex-1 ml-3">
                  <Text className="text-body text-primary" numberOfLines={1}>
                    {product.name}
                  </Text>
                  {product.brand ? (
                    <Text className="text-body-sm text-secondary" numberOfLines={1}>
                      {product.brand}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
          <Pressable
            onPress={handleAddCustom}
            accessibilityRole="button"
            accessibilityLabel={`Add ${query} as a custom item`}
            className="px-4 py-3 bg-muted"
          >
            <Text className="text-body-sm text-brand-primary font-semibold">
              Add &ldquo;{query.trim()}&rdquo; as a custom item
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

export default ListComposer;
