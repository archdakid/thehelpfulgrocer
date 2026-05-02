import { Link, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useThemedColors } from '@/lib/themedColors';

export default function SignInScreen() {
  const router = useRouter();
  const c = useThemedColors();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    const err = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/settings');
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-row items-center px-3 pt-1 pb-2">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/settings'))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            className="w-10 h-10 items-center justify-center rounded-full"
          >
            <ChevronLeft size={24} color={c.text.primary} />
          </Pressable>
        </View>

        <View className="flex-1 px-5 pt-2">
          <Text className="text-h1 text-primary">Sign in</Text>
          <Text className="text-body-sm text-secondary mt-1 mb-6">
            Welcome back. Sync your list and contribute prices.
          </Text>

          <Text className="text-caption text-secondary mb-1.5">Email</Text>
          <Input
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />

          <View className="h-4" />

          <Text className="text-caption text-secondary mb-1.5">Password</Text>
          <Input
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            placeholder="••••••••"
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />

          {error ? (
            <Text className="text-body-sm text-danger mt-3" numberOfLines={3}>
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            accessibilityState={{ disabled: !canSubmit }}
            className={`rounded-lg items-center justify-center mt-5 ${
              canSubmit ? 'bg-brand-primary' : 'bg-muted'
            }`}
            style={{ height: 50 }}
          >
            {submitting ? (
              <ActivityIndicator color={c.brand.primaryFg} />
            ) : (
              <Text
                className={`text-body font-semibold ${
                  canSubmit ? 'text-brand-primary-fg' : 'text-tertiary'
                }`}
              >
                Sign in
              </Text>
            )}
          </Pressable>

          <View className="mt-6 items-center">
            <Link href="/auth/sign-up" replace asChild>
              <Pressable hitSlop={12}>
                <Text className="text-body-sm text-secondary">
                  Don&apos;t have an account?{' '}
                  <Text className="text-brand-primary font-semibold">Sign up</Text>
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
