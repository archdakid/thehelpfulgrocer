import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg-canvas">
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-h1 text-text-primary">SmartShopper</Text>
        <Text className="text-body-sm text-text-secondary mt-2">
          Your list will appear here.
        </Text>
      </View>
    </SafeAreaView>
  );
}
