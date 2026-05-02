import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <SafeAreaView className="flex-1 bg-canvas">
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-h1 text-primary">This screen doesn&apos;t exist.</Text>
          <Link href="/" className="mt-4">
            <Text className="text-body text-brand-primary">Go to home</Text>
          </Link>
        </View>
      </SafeAreaView>
    </>
  );
}
