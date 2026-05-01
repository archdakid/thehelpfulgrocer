import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReceiptsScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <View className="px-4 pt-2 pb-3">
        <Text className="text-h1 text-primary">Receipts</Text>
        <Text className="text-body-sm text-secondary mt-0.5">
          Upload a receipt and we&apos;ll match the items to products. Coming soon.
        </Text>
      </View>
      <View className="flex-1 items-center justify-center">
        <Text className="text-body text-tertiary">No receipts yet.</Text>
      </View>
    </SafeAreaView>
  );
}
