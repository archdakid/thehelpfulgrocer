import { Plus } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import Input from '@/components/ui/Input';

type AddItemRowProps = {
  onAdd: (name: string) => void;
};

export default function AddItemRow({ onAdd }: AddItemRowProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  function submit() {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onAdd(trimmed);
    setText('');
    inputRef.current?.focus();
  }

  return (
    <View className="flex-row items-center px-4 py-3 bg-canvas">
      <View className="flex-1">
        <Input
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder="Add an item…"
          accessibilityLabel="New item name"
          returnKeyType="done"
          onSubmitEditing={submit}
          blurOnSubmit={false}
          autoCapitalize="sentences"
        />
      </View>
      <Pressable
        onPress={submit}
        disabled={text.trim().length === 0}
        accessibilityRole="button"
        accessibilityLabel="Add item to list"
        className={`ml-2 w-11 h-11 items-center justify-center rounded-md bg-brand-primary ${
          text.trim().length === 0 ? 'opacity-40' : ''
        }`}
      >
        <Plus size={22} color="white" />
      </Pressable>
    </View>
  );
}
