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

export default function SignUpScreen() {
  const router = useRouter();
  const c = useThemedColors();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Supabase rejects passwords shorter than 6 characters by default; surface
  // that locally so we don't round-trip just to learn it.
  const passwordTooShort = password.length > 0 && password.length < 6;
  const canSubmit =
    email.length > 0 && password.length >= 6 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const err = await signUp(email.trim(), password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    // If Supabase email confirmation is enabled, the session will be null
    // and the user has to verify before signing in. Otherwise they land here
    // already authed and we bounce back to Settings.
    setInfo('Account created. Check your email to confirm, then sign in.');
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
          <Text className="text-h1 text-primary">Create account</Text>
          <Text className="text-body-sm text-secondary mt-1 mb-6">
            One account keeps your list synced across devices.
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
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="At least 6 characters"
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />
          {passwordTooShort ? (
            <Text className="text-caption text-tertiary mt-1.5">
              Use at least 6 characters.
            </Text>
          ) : null}

          {error ? (
            <Text className="text-body-sm text-danger mt-3" numberOfLines={3}>
              {error}
            </Text>
          ) : null}
          {info ? (
            <Text className="text-body-sm text-success mt-3">{info}</Text>
          ) : null}

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Create account"
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
                Create account
              </Text>
            )}
          </Pressable>

          <View className="mt-6 items-center">
            <Link href="/auth/sign-in" replace asChild>
              <Pressable hitSlop={12}>
                <Text className="text-body-sm text-secondary">
                  Already have an account?{' '}
                  <Text className="text-brand-primary font-semibold">Sign in</Text>
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
