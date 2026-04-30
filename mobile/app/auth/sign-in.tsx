import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignInScreen() {
  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 items-center justify-center">
        <Text className="text-h2 text-primary">Sign in</Text>
      </View>
    </SafeAreaView>
  );
}
