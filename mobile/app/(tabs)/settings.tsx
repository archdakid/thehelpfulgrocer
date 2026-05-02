import { useRouter } from 'expo-router';
import { ChevronRight, LogOut, Moon, Sun, SunMoon, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useThemedColors } from '@/lib/themedColors';
import { type ThemePreference, useUIStore } from '@/stores/useUIStore';

export default function SettingsScreen() {
  const router = useRouter();
  const c = useThemedColors();
  const { isAuthed, isLoading, user, signOut } = useAuth();
  const themePreference = useUIStore((s) => s.themePreference);
  const setThemePreference = useUIStore((s) => s.setThemePreference);

  const onSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void signOut();
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <View className="px-4 pt-2 pb-3">
        <Text className="text-h1 text-primary">Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <SectionHeader>Account</SectionHeader>
        <View className="mx-3 bg-surface border-[0.5px] border-border rounded-xl overflow-hidden">
          {isLoading ? (
            <View className="px-4 py-4">
              <Text className="text-body-sm text-tertiary">Loading…</Text>
            </View>
          ) : isAuthed && user ? (
            <>
              <AuthedAccount email={user.email ?? null} />
              <Divider />
              <Pressable
                onPress={onSignOut}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                className="flex-row items-center px-4 py-3.5 active:bg-muted"
                style={{ gap: 12 }}
              >
                <View className="w-10 h-10 items-center justify-center">
                  <LogOut size={20} color={c.semantic.danger} />
                </View>
                <Text className="flex-1 text-body text-danger font-semibold">Sign out</Text>
              </Pressable>
            </>
          ) : (
            <>
              <NavRow
                label="Sign in"
                sublabel="Sync your list across devices"
                onPress={() => router.push('/auth/sign-in')}
                accessibilityLabel="Sign in"
                iconColor={c.text.primary}
              />
              <Divider />
              <NavRow
                label="Create account"
                sublabel="New here? Takes a few seconds."
                onPress={() => router.push('/auth/sign-up')}
                accessibilityLabel="Create account"
                iconColor={c.text.primary}
              />
            </>
          )}
        </View>

        <SectionHeader>Appearance</SectionHeader>
        <View className="mx-3 bg-surface border-[0.5px] border-border rounded-xl overflow-hidden">
          <View className="px-4 py-3">
            <Text className="text-body-sm text-secondary mb-3">Theme</Text>
            <View
              className="flex-row p-1 rounded-lg"
              style={{ backgroundColor: c.bg.muted, gap: 4 }}
            >
              <ThemeSegment
                active={themePreference === 'light'}
                label="Light"
                icon={<Sun size={16} color={themePreference === 'light' ? c.text.primary : c.text.secondary} />}
                onPress={() => setThemePreference('light')}
              />
              <ThemeSegment
                active={themePreference === 'dark'}
                label="Dark"
                icon={<Moon size={16} color={themePreference === 'dark' ? c.text.primary : c.text.secondary} />}
                onPress={() => setThemePreference('dark')}
              />
              <ThemeSegment
                active={themePreference === 'system'}
                label="Auto"
                icon={<SunMoon size={16} color={themePreference === 'system' ? c.text.primary : c.text.secondary} />}
                onPress={() => setThemePreference('system')}
              />
            </View>
            <Text className="text-caption text-tertiary mt-2.5">
              {themeHint(themePreference)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AuthedAccount({ email }: { email: string | null }) {
  const c = useThemedColors();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  const [draft, setDraft] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Seed the draft from the first profile load. We don't keep it in sync with
  // later remote changes because the only writer is this same screen — and
  // resetting mid-edit would clobber user input.
  useEffect(() => {
    if (profile && !hydrated) {
      setDraft(profile.displayName ?? '');
      setHydrated(true);
    }
  }, [profile, hydrated]);

  const save = () => {
    if (!profile) return;
    const next = draft.trim().length === 0 ? null : draft.trim();
    if (next !== profile.displayName) {
      updateProfile.mutate({ displayName: next });
    }
  };

  return (
    <>
      <View className="flex-row items-center px-4 py-3.5" style={{ gap: 12 }}>
        <View
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: c.bg.muted }}
        >
          <User size={20} color={c.text.secondary} />
        </View>
        <View className="flex-1" style={{ minWidth: 0 }}>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Text className="text-body-sm text-secondary">Signed in</Text>
            {profile?.isAdmin ? (
              <View
                className="rounded-full px-1.5"
                style={{ backgroundColor: c.brand.accent, paddingVertical: 1 }}
              >
                <Text
                  className="text-[10px] uppercase font-bold text-inverse"
                  style={{ letterSpacing: 0.5 }}
                >
                  Admin
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-body text-primary font-semibold" numberOfLines={1}>
            {email ?? 'Account'}
          </Text>
        </View>
      </View>
      <Divider />
      <View className="px-4 py-3.5">
        <View className="flex-row items-baseline justify-between mb-1.5">
          <Text className="text-caption text-secondary">Display name</Text>
          {updateProfile.isPending ? (
            <Text className="text-caption text-tertiary">Saving…</Text>
          ) : updateProfile.isError ? (
            <Text className="text-caption text-danger">Save failed</Text>
          ) : null}
        </View>
        {isLoading && !profile ? (
          <Text className="text-body-sm text-tertiary py-3">Loading…</Text>
        ) : (
          <Input
            accessibilityLabel="Display name"
            value={draft}
            onChangeText={setDraft}
            onEndEditing={save}
            blurOnSubmit
            returnKeyType="done"
            placeholder="Add a display name"
            maxLength={48}
          />
        )}
      </View>
    </>
  );
}

function themeHint(pref: ThemePreference): string {
  if (pref === 'light') return 'Always use light mode.';
  if (pref === 'dark') return 'Always use dark mode.';
  return 'Match the system color scheme.';
}

function SectionHeader({ children }: { children: string }) {
  return (
    <Text
      className="text-eyebrow text-tertiary uppercase mt-5 mb-2 px-4"
      style={{ letterSpacing: 0.5 }}
    >
      {children}
    </Text>
  );
}

function Divider() {
  return <View className="h-[0.5px] bg-border ml-4" />;
}

type NavRowProps = {
  label: string;
  sublabel?: string;
  onPress: () => void;
  accessibilityLabel: string;
  iconColor: string;
};

function NavRow({ label, sublabel, onPress, accessibilityLabel, iconColor }: NavRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="flex-row items-center px-4 py-3.5 active:bg-muted"
      style={{ gap: 12, minHeight: 56 }}
    >
      <View className="flex-1" style={{ minWidth: 0 }}>
        <Text className="text-body text-primary font-semibold">{label}</Text>
        {sublabel ? (
          <Text className="text-caption text-secondary mt-0.5">{sublabel}</Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={iconColor} />
    </Pressable>
  );
}

type ThemeSegmentProps = {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
};

function ThemeSegment({ active, label, icon, onPress }: ThemeSegmentProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Theme: ${label}`}
      accessibilityState={{ selected: active }}
      className={`flex-1 flex-row items-center justify-center py-2.5 rounded-md ${
        active ? 'bg-surface' : ''
      }`}
      style={{ gap: 6, minHeight: 36 }}
    >
      {icon}
      <Text
        className={`text-body-sm ${active ? 'text-primary font-semibold' : 'text-secondary'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
