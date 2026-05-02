import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ImageOff, Package, RefreshCw, WifiOff } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import {
  useReceipt,
  useReceiptItems,
  useReceiptSignedUrl,
  useReprocessReceipt,
  type Receipt,
  type ReceiptItem,
  type ReceiptStatus,
} from '@/hooks/useReceipts';
import { useStores } from '@/hooks/useStores';
import { formatPrice, formatRelativeTime } from '@/lib/format';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryKeys';
import { useThemedColors } from '@/lib/themedColors';

export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useThemedColors();
  const qc = useQueryClient();
  const receiptQuery = useReceipt(id ?? null);
  const imagePath = receiptQuery.data?.imagePath ?? null;
  const signedUrlQuery = useReceiptSignedUrl(imagePath);
  const itemsQuery = useReceiptItems(id ?? null);
  const reprocess = useReprocessReceipt();
  const { data: stores } = useStores();

  // The items query first fires while the receipt is still 'processing' and
  // caches an empty result for the global 5-minute staleTime. Without this
  // effect, the items inserted by the Edge Function would never appear until
  // the cache expired or the user pulled to refresh. Triggering on the status
  // transition to 'processed' refetches exactly once, when there's actually
  // something new to read.
  const status = receiptQuery.data?.status;
  useEffect(() => {
    if (status === 'processed' && id) {
      void qc.invalidateQueries({ queryKey: queryKeys.receiptItems(id) });
    }
  }, [status, id, qc]);

  if (receiptQuery.isError) logger.error('useReceipt failed', { id, error: receiptQuery.error });
  if (signedUrlQuery.isError) {
    logger.warn('useReceiptSignedUrl failed', { imagePath, error: signedUrlQuery.error });
  }
  if (itemsQuery.isError) {
    logger.warn('useReceiptItems failed', { id, error: itemsQuery.error });
  }

  const receipt = receiptQuery.data ?? null;
  const storeName =
    receipt?.storeId ? stores?.find((s) => s.id === receipt.storeId)?.name ?? null : null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
        <View className="flex-row items-center px-2 pt-1 pb-2">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="w-11 h-11 items-center justify-center"
          >
            <ChevronLeft size={24} color={c.text.primary} />
          </Pressable>
        </View>

        {receiptQuery.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : receiptQuery.isError || !receipt ? (
          <EmptyState
            icon={WifiOff}
            heading="Couldn't load receipt"
            body="Check your connection and try again."
            ctaLabel="Retry"
            onCtaPress={() => void receiptQuery.refetch()}
          />
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            <View className="px-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-h2 text-primary" numberOfLines={1}>
                  {storeName ?? receipt.parsedStoreName ?? 'Receipt'}
                </Text>
                <StatusBadge status={receipt.status} />
              </View>
              <Text className="text-body-sm text-secondary mt-1">
                Uploaded {formatRelativeTime(receipt.createdAt)}
                {receipt.capturedAt && receipt.capturedAt !== receipt.createdAt
                  ? ` · captured ${formatRelativeTime(receipt.capturedAt)}`
                  : ''}
              </Text>
            </View>

            <View
              className="mx-4 mt-4 rounded-2xl border-[0.5px] border-border bg-surface overflow-hidden"
              style={{ aspectRatio: 3 / 4 }}
            >
              {signedUrlQuery.isLoading ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator />
                </View>
              ) : signedUrlQuery.data ? (
                <Image
                  source={{ uri: signedUrlQuery.data }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <ImageOff size={48} color={c.text.tertiary} strokeWidth={1.5} />
                  <Text className="text-body-sm text-tertiary mt-3">Image unavailable</Text>
                </View>
              )}
            </View>

            {receipt.status === 'failed' ? (
              <FailedBanner
                message={receipt.processError}
                onRetry={() => reprocess.mutate(receipt.id)}
                pending={reprocess.isPending}
              />
            ) : null}

            <ItemsSection
              receipt={receipt}
              items={itemsQuery.data ?? []}
              loading={itemsQuery.isLoading}
            />

            {receipt.status !== 'processed' && receipt.status !== 'failed' ? (
              <View className="px-4 mt-5">
                <Text
                  className="text-eyebrow text-tertiary uppercase mb-2"
                  style={{ letterSpacing: 0.5 }}
                >
                  What happens next
                </Text>
                <Text className="text-body-sm text-secondary">{nextStepCopy(receipt.status)}</Text>
              </View>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

function FailedBanner({
  message,
  onRetry,
  pending,
}: {
  message: string | null;
  onRetry: () => void;
  pending: boolean;
}) {
  const c = useThemedColors();
  return (
    <View className="mx-4 mt-4 rounded-xl border-[0.5px] border-danger/40 bg-danger/10 px-4 py-3">
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <RefreshCw size={16} color={c.semantic.danger} />
        <Text className="text-body-sm text-danger font-semibold">Couldn’t read this receipt</Text>
      </View>
      {message ? (
        <Text className="text-caption text-secondary mt-1" numberOfLines={3}>
          {message}
        </Text>
      ) : null}
      <View className="mt-3">
        <Button label={pending ? 'Retrying…' : 'Try again'} onPress={onRetry} loading={pending} />
      </View>
    </View>
  );
}

function ItemsSection({
  receipt,
  items,
  loading,
}: {
  receipt: Receipt;
  items: ReceiptItem[];
  loading: boolean;
}) {
  const totalLabel =
    receipt.totalAmountMinorUnits != null
      ? formatPrice(receipt.totalAmountMinorUnits, receipt.currency ?? 'TTD')
      : null;

  if (receipt.status === 'uploaded' || receipt.status === 'processing') {
    return (
      <View className="px-4 mt-5">
        <SectionHeader>Items</SectionHeader>
        <View className="bg-surface border-[0.5px] border-border rounded-xl px-4 py-5 items-center">
          <ActivityIndicator />
          <Text className="text-body-sm text-secondary mt-2">Reading your receipt…</Text>
        </View>
      </View>
    );
  }

  if (receipt.status === 'failed') return null;

  return (
    <View className="px-4 mt-5">
      <SectionHeader>Items</SectionHeader>
      {loading ? (
        <View className="bg-surface border-[0.5px] border-border rounded-xl px-4 py-5 items-center">
          <ActivityIndicator />
        </View>
      ) : items.length === 0 ? (
        <View className="bg-surface border-[0.5px] border-border rounded-xl px-4 py-5">
          <Text className="text-body-sm text-secondary">
            No line items were detected on this receipt.
          </Text>
        </View>
      ) : (
        <View className="bg-surface border-[0.5px] border-border rounded-xl overflow-hidden">
          {items.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
              currency={receipt.currency ?? 'TTD'}
              isFirst={idx === 0}
            />
          ))}
          {totalLabel ? (
            <View
              className="flex-row items-center px-4 py-3 border-t-[0.5px] border-border bg-muted"
              style={{ minHeight: 44 }}
            >
              <Text className="flex-1 text-body-sm text-secondary font-semibold">Total</Text>
              <Text
                className="text-mono font-bold text-primary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {totalLabel}
              </Text>
            </View>
          ) : null}
        </View>
      )}
      <Text className="text-caption text-tertiary mt-2">
        Items contribute to prices in a follow-up update.
      </Text>
    </View>
  );
}

function ItemRow({
  item,
  currency,
  isFirst,
}: {
  item: ReceiptItem;
  currency: string;
  isFirst: boolean;
}) {
  const c = useThemedColors();
  const matched = item.matchedProduct;

  return (
    <View
      className={`flex-row items-center px-4 py-3 ${isFirst ? '' : 'border-t-[0.5px] border-border'}`}
      style={{ minHeight: 56, gap: 12 }}
    >
      <View
        className="rounded-md overflow-hidden bg-muted items-center justify-center"
        style={{ width: 36, height: 36 }}
      >
        {matched?.imageUrl ? (
          <Image
            source={{ uri: matched.imageUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
        ) : (
          <Package size={18} color={c.text.tertiary} strokeWidth={1.5} />
        )}
      </View>
      <View className="flex-1" style={{ minWidth: 0 }}>
        <Text
          className={`text-body ${matched ? 'text-primary font-semibold' : 'text-primary'}`}
          numberOfLines={1}
        >
          {matched ? matched.name : item.rawText}
        </Text>
        <View className="flex-row items-center mt-0.5" style={{ gap: 6 }}>
          {matched ? (
            <Text className="text-caption text-tertiary" numberOfLines={1}>
              {item.rawText}
            </Text>
          ) : (
            <Badge label="Unmatched" variant="warning" />
          )}
          {item.needsReview ? <Badge label="Review" variant="accent" /> : null}
          {item.quantity !== 1 ? (
            <Text className="text-caption text-tertiary">· Qty {item.quantity}</Text>
          ) : null}
        </View>
      </View>
      <Text
        className="text-mono font-semibold text-primary"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatPrice(item.lineTotalMinorUnits, currency)}
      </Text>
    </View>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <Text
      className="text-eyebrow text-tertiary uppercase mb-2"
      style={{ letterSpacing: 0.5 }}
    >
      {children}
    </Text>
  );
}

function StatusBadge({ status }: { status: ReceiptStatus }) {
  if (status === 'processed') return <Badge label="Processed" variant="success" />;
  if (status === 'processing') return <Badge label="Processing" variant="accent" />;
  if (status === 'failed') return <Badge label="Failed" variant="danger" />;
  return <Badge label="Uploaded" variant="warning" />;
}

function nextStepCopy(status: ReceiptStatus): string {
  if (status === 'processing') return 'We’re reading the items now. Check back in a moment.';
  return 'We’ll start reading the items shortly.';
}
