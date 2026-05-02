import { useRouter } from 'expo-router';
import { Plus, Receipt as ReceiptIcon, WifiOff } from 'lucide-react-native';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ReceiptThumbnail from '@/components/receipt/ReceiptThumbnail';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useReceipts, type Receipt, type ReceiptStatus } from '@/hooks/useReceipts';
import { useStores } from '@/hooks/useStores';
import { formatRelativeTime } from '@/lib/format';
import { logger } from '@/lib/logger';
import { useThemedColors } from '@/lib/themedColors';

export default function ReceiptsScreen() {
  const router = useRouter();
  const c = useThemedColors();
  const { isAuthed, isLoading: authLoading } = useAuth();
  const receiptsQuery = useReceipts();
  const { data: stores } = useStores();

  if (receiptsQuery.isError) {
    logger.error('useReceipts failed', { error: receiptsQuery.error });
  }

  const storeName = (storeId: string | null): string | null => {
    if (!storeId) return null;
    return stores?.find((s) => s.id === storeId)?.name ?? null;
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <View className="flex-row items-end justify-between px-4 pt-2 pb-3">
        <View className="flex-1 pr-3">
          <Text className="text-h1 text-primary">Receipts</Text>
          <Text className="text-body-sm text-secondary mt-0.5">
            Upload a receipt and we&apos;ll match items to products soon.
          </Text>
        </View>
        {isAuthed ? (
          <Pressable
            onPress={() => router.push('/receipt/upload')}
            accessibilityRole="button"
            accessibilityLabel="Upload receipt"
            hitSlop={8}
            className="w-11 h-11 rounded-full bg-brand-primary items-center justify-center active:opacity-80"
          >
            <Plus size={22} color={c.brand.primaryFg} strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </View>

      {authLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !isAuthed ? (
        <EmptyState
          icon={ReceiptIcon}
          heading="Sign in to upload receipts"
          body="Receipts are saved to your account so you can review and edit them later."
          ctaLabel="Sign in"
          onCtaPress={() => router.push('/auth/sign-in')}
        />
      ) : receiptsQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : receiptsQuery.isError ? (
        <EmptyState
          icon={WifiOff}
          heading="Couldn't load your receipts"
          body="Check your connection and try again."
          ctaLabel="Retry"
          onCtaPress={() => void receiptsQuery.refetch()}
        />
      ) : !receiptsQuery.data || receiptsQuery.data.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          heading="No receipts yet"
          body="Upload one and it'll appear here while we process the items."
          ctaLabel="Upload receipt"
          onCtaPress={() => router.push('/receipt/upload')}
        />
      ) : (
        <FlatList
          data={receiptsQuery.data}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item }) => (
            <ReceiptListRow
              receipt={item}
              storeName={storeName(item.storeId)}
              onPress={() => router.push(`/receipt/${item.id}`)}
            />
          )}
          refreshing={receiptsQuery.isRefetching}
          onRefresh={() => void receiptsQuery.refetch()}
        />
      )}

    </SafeAreaView>
  );
}

type RowProps = {
  receipt: Receipt;
  storeName: string | null;
  onPress: () => void;
};

function ReceiptListRow({ receipt, storeName, onPress }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Receipt from ${storeName ?? 'unknown store'}, ${statusLabel(receipt.status)}`}
      className="flex-row items-center bg-surface border-[0.5px] border-border rounded-xl px-3 py-2.5 active:bg-muted"
      style={{ gap: 12, minHeight: 72 }}
    >
      <ReceiptThumbnail imagePath={receipt.imagePath} />
      <View className="flex-1" style={{ minWidth: 0 }}>
        <Text className="text-body text-primary font-semibold" numberOfLines={1}>
          {storeName ?? 'Unknown store'}
        </Text>
        <Text className="text-caption text-tertiary mt-0.5">
          {formatRelativeTime(receipt.createdAt)}
        </Text>
        <View className="mt-1.5">
          <StatusBadge status={receipt.status} />
        </View>
      </View>
    </Pressable>
  );
}

function StatusBadge({ status }: { status: ReceiptStatus }) {
  if (status === 'processed') return <Badge label="Processed" variant="success" />;
  if (status === 'processing') return <Badge label="Processing" variant="accent" />;
  if (status === 'failed') return <Badge label="Failed" variant="danger" />;
  return <Badge label="Uploaded" variant="warning" />;
}

function statusLabel(status: ReceiptStatus): string {
  if (status === 'processed') return 'processed';
  if (status === 'processing') return 'processing';
  if (status === 'failed') return 'failed';
  return 'uploaded';
}
