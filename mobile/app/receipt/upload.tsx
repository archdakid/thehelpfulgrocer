import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { Camera, ChevronLeft, ImageIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useUploadReceipt } from '@/hooks/useReceipts';
import { logger } from '@/lib/logger';
import { useThemedColors } from '@/lib/themedColors';

type Picked = {
  uri: string;
  mimeType: string;
};

export default function ReceiptUploadScreen() {
  const router = useRouter();
  const c = useThemedColors();
  const { isAuthed } = useAuth();
  const upload = useUploadReceipt();
  const [picked, setPicked] = useState<Picked | null>(null);

  const onPickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to choose a receipt image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      exif: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setPicked({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const onCapture = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to capture a receipt.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      exif: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setPicked({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const onSubmit = async () => {
    if (!picked) return;
    try {
      const receipt = await upload.mutateAsync({
        localUri: picked.uri,
        mimeType: picked.mimeType,
        capturedAt: new Date().toISOString(),
      });
      router.replace(`/receipt/${receipt.id}`);
    } catch (err) {
      // Direct console.error first so the raw err object surfaces in RN's
      // inspector regardless of what the logger pipeline does with it.
      // eslint-disable-next-line no-console
      console.error(
        '[upload] raw =',
        err,
        '| typeof =',
        typeof err,
        '| message =',
        (err as { message?: unknown })?.message,
        '| stack =',
        (err as { stack?: unknown })?.stack,
      );
      logger.error('receipt upload failed', {
        error: err,
        errorType: typeof err,
        errorIsNull: err === null,
        errorIsUndefined: err === undefined,
        errorString: err === null ? '<null>' : err === undefined ? '<undefined>' : String(err),
      });
      Alert.alert('Upload failed', 'Check your connection and try again.');
    }
  };

  if (!isAuthed) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
          <Header onBack={() => router.back()} />
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-h3 text-primary text-center">Sign in to upload</Text>
            <Text className="text-body-sm text-secondary mt-2 text-center">
              Receipts are saved to your account so you can review and edit them later.
            </Text>
            <View className="mt-6 w-full max-w-xs">
              <Button label="Sign in" onPress={() => router.push('/auth/sign-in')} />
            </View>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
        <Header onBack={() => router.back()} />
        <View className="px-4 pt-1 pb-3">
          <Text className="text-h1 text-primary">Upload receipt</Text>
          <Text className="text-body-sm text-secondary mt-0.5">
            Snap a photo or pick one from your library. We&apos;ll match items in a follow-up.
          </Text>
        </View>

        <View className="flex-1 px-4">
          <View
            className="rounded-2xl border-[0.5px] border-border bg-surface overflow-hidden"
            style={{ aspectRatio: 3 / 4 }}
          >
            {picked ? (
              <Image
                source={{ uri: picked.uri }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <ImageIcon size={48} color={c.text.tertiary} strokeWidth={1.5} />
                <Text className="text-body-sm text-tertiary mt-3">No image selected</Text>
              </View>
            )}
          </View>

          <View className="flex-row mt-4" style={{ gap: 12 }}>
            <View className="flex-1">
              <ActionButton
                icon={<Camera size={18} color={c.text.primary} />}
                label="Camera"
                onPress={onCapture}
                disabled={upload.isPending}
              />
            </View>
            <View className="flex-1">
              <ActionButton
                icon={<ImageIcon size={18} color={c.text.primary} />}
                label="Library"
                onPress={onPickFromLibrary}
                disabled={upload.isPending}
              />
            </View>
          </View>
        </View>

        <View className="px-4 pb-6 pt-3">
          <Button
            label={upload.isPending ? 'Uploading…' : 'Upload'}
            onPress={onSubmit}
            disabled={!picked || upload.isPending}
            loading={upload.isPending}
          />
        </View>
      </SafeAreaView>
    </>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  const c = useThemedColors();
  return (
    <View className="flex-row items-center px-2 pt-1 pb-2">
      <Pressable
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        className="w-11 h-11 items-center justify-center"
      >
        <ChevronLeft size={24} color={c.text.primary} />
      </Pressable>
    </View>
  );
}

type ActionButtonProps = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

function ActionButton({ icon, label, onPress, disabled }: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center justify-center h-11 rounded-lg bg-surface border-[0.5px] border-border ${disabled ? 'opacity-40' : 'active:bg-muted'}`}
      style={{ gap: 8 }}
    >
      {icon}
      <Text className="text-body text-primary font-semibold">{label}</Text>
    </Pressable>
  );
}
