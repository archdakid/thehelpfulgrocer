import { File as FsFile } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { useAuthStore } from '@/stores/useAuthStore';
import type { Database } from '@/types/database';

export type ReceiptStatus = Database['public']['Enums']['receipt_status'];

// Phase 2 columns (ocr_text, processed_at, process_error, parsed_store_name,
// total_amount_minor_units, currency, receipt_date) are added in migration
// 0008. Until 0008 is pushed and database.ts is regenerated, we extend the
// generated row type locally and cast at the boundary. After regen, this type
// alias collapses into Database['public']['Tables']['receipts']['Row'].
type ReceiptRowGenerated = Database['public']['Tables']['receipts']['Row'];
type ReceiptRow = ReceiptRowGenerated & {
  ocr_text: string | null;
  processed_at: string | null;
  process_error: string | null;
  parsed_store_name: string | null;
  total_amount_minor_units: number | null;
  currency: string | null;
  receipt_date: string | null;
};

export type Receipt = {
  id: string;
  userId: string;
  storeId: string | null;
  imagePath: string;
  status: ReceiptStatus;
  notes: string | null;
  capturedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ocrText: string | null;
  processedAt: string | null;
  processError: string | null;
  parsedStoreName: string | null;
  totalAmountMinorUnits: number | null;
  currency: string | null;
  receiptDate: string | null;
};

const RECEIPT_COLUMNS =
  'id, user_id, store_id, image_path, status, notes, captured_at, created_at, updated_at, ocr_text, processed_at, process_error, parsed_store_name, total_amount_minor_units, currency, receipt_date';

function mapReceipt(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    userId: row.user_id,
    storeId: row.store_id,
    imagePath: row.image_path,
    status: row.status,
    notes: row.notes,
    capturedAt: row.captured_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ocrText: row.ocr_text,
    processedAt: row.processed_at,
    processError: row.process_error,
    parsedStoreName: row.parsed_store_name,
    totalAmountMinorUnits: row.total_amount_minor_units,
    currency: row.currency,
    receiptDate: row.receipt_date,
  };
}

// 4 seconds is short enough that a "Processing…" badge feels live without
// hammering the API. Phase 2 OCR usually completes in 5-15s.
const PROCESSING_POLL_INTERVAL_MS = 4000;

export function useReceipts() {
  const userId = useAuthStore((s) => s.user?.id ?? null);

  return useQuery({
    queryKey: queryKeys.receipts(userId),
    enabled: userId !== null,
    refetchInterval: (query) => {
      const data = query.state.data as Receipt[] | undefined;
      if (!data) return false;
      return data.some((r) => r.status === 'processing' || r.status === 'uploaded')
        ? PROCESSING_POLL_INTERVAL_MS
        : false;
    },
    queryFn: async (): Promise<Receipt[]> => {
      const { data, error } = await supabase
        .from('receipts')
        .select(RECEIPT_COLUMNS)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as ReceiptRow[]).map(mapReceipt);
    },
  });
}

export function useReceipt(id: string | null) {
  const userId = useAuthStore((s) => s.user?.id ?? null);

  return useQuery({
    queryKey: queryKeys.receipt(id),
    enabled: userId !== null && id !== null,
    refetchInterval: (query) => {
      const data = query.state.data as Receipt | null | undefined;
      if (!data) return false;
      return data.status === 'processing' || data.status === 'uploaded'
        ? PROCESSING_POLL_INTERVAL_MS
        : false;
    },
    queryFn: async (): Promise<Receipt | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('receipts')
        .select(RECEIPT_COLUMNS)
        .eq('id', id)
        .single();
      if (error) throw error;
      return mapReceipt(data as unknown as ReceiptRow);
    },
  });
}

// Mints a short-lived signed URL for a receipt image. The bucket is private
// (see migration 0007), so direct CDN reads aren't possible — every render
// needs a fresh URL. 5-minute TTL is plenty for a detail screen view and
// short enough that a leaked URL doesn't outlive the session.
export function useReceiptSignedUrl(imagePath: string | null) {
  return useQuery({
    queryKey: ['receipt-signed-url', imagePath],
    enabled: imagePath !== null,
    staleTime: 1000 * 60 * 4,
    queryFn: async (): Promise<string | null> => {
      if (!imagePath) return null;
      const { data, error } = await supabase.storage
        .from('receipts')
        .createSignedUrl(imagePath, 60 * 5);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

// Receipt items shape — Phases 2+3. Until 0008/0009 are regenerated into
// database.ts, this is hand-typed against the migration's column list.
export type ReceiptItemMatchedProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export type ReceiptItem = {
  id: string;
  receiptId: string;
  position: number;
  rawText: string;
  quantity: number;
  unitPriceMinorUnits: number | null;
  lineTotalMinorUnits: number;
  matchedProductId: string | null;
  matchConfidence: number | null;
  needsReview: boolean;
  matchedProduct: ReceiptItemMatchedProduct | null;
};

type ReceiptItemRow = {
  id: string;
  receipt_id: string;
  position: number;
  raw_text: string;
  quantity: number;
  unit_price_minor_units: number | null;
  line_total_minor_units: number;
  matched_product_id: string | null;
  match_confidence: number | null;
  needs_review: boolean;
  // PostgREST returns nested relations as a single object when the FK is
  // singular; supabase-js's auto-detection sometimes types it as an array,
  // so we accept both shapes and flatten in mapReceiptItem.
  products: { id: string; name: string; image_url: string | null } | { id: string; name: string; image_url: string | null }[] | null;
};

function mapReceiptItem(row: ReceiptItemRow): ReceiptItem {
  const productRel = Array.isArray(row.products) ? row.products[0] ?? null : row.products;
  return {
    id: row.id,
    receiptId: row.receipt_id,
    position: row.position,
    rawText: row.raw_text,
    quantity: Number(row.quantity),
    unitPriceMinorUnits: row.unit_price_minor_units,
    lineTotalMinorUnits: row.line_total_minor_units,
    matchedProductId: row.matched_product_id,
    matchConfidence: row.match_confidence == null ? null : Number(row.match_confidence),
    needsReview: row.needs_review,
    matchedProduct: productRel
      ? { id: productRel.id, name: productRel.name, imageUrl: productRel.image_url }
      : null,
  };
}

export function useReceiptItems(receiptId: string | null) {
  const userId = useAuthStore((s) => s.user?.id ?? null);

  return useQuery({
    queryKey: queryKeys.receiptItems(receiptId),
    enabled: userId !== null && receiptId !== null,
    queryFn: async (): Promise<ReceiptItem[]> => {
      if (!receiptId) return [];
      // RLS gates this by joining to receipts.user_id; a user querying someone
      // else's receipt id gets an empty array, not an error. The nested
      // products(...) select uses the matched_product_id FK declared in
      // migration 0008 and returns null when no product is matched yet.
      const { data, error } = await (supabase.from('receipt_items' as never) as any)
        .select(
          'id, receipt_id, position, raw_text, quantity, unit_price_minor_units, line_total_minor_units, matched_product_id, match_confidence, needs_review, products:matched_product_id (id, name, image_url)',
        )
        .eq('receipt_id', receiptId)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data as unknown as ReceiptItemRow[]).map(mapReceiptItem);
    },
  });
}

type UploadInput = {
  // file:// URI from expo-image-picker
  localUri: string;
  // Picker-reported dimensions; used to decide whether to downscale before
  // uploading. Required so we don't upscale small images.
  width: number;
  height: number;
  storeId?: string | null;
  notes?: string | null;
  capturedAt?: string | null;
};

// Gemini's vision endpoint rejects with "Unable to process input image" when
// inline_data approaches ~7MB or when the format isn't a clean JPEG/PNG. A
// fresh phone capture at 12MP+ blows past that envelope even after JPEG
// re-encode, so we cap the long edge here. 1600px is well above what receipt
// OCR needs while staying under Gemini's safe inline limit.
const MAX_EDGE_PX = 1600;

async function normalizeToJpeg(
  localUri: string,
  width: number,
  height: number,
): Promise<string> {
  const longEdge = Math.max(width, height);
  // Only resize when the original is larger — passing resize: { width: N }
  // would upscale a smaller image, which wastes bytes and softens text.
  const actions =
    longEdge > MAX_EDGE_PX
      ? [{ resize: width >= height ? { width: MAX_EDGE_PX } : { height: MAX_EDGE_PX } }]
      : [];
  const result = await manipulateAsync(localUri, actions, {
    compress: 0.85,
    format: SaveFormat.JPEG,
  });
  return result.uri;
}

// Fire-and-forget invocation of the OCR Edge Function. We don't await it from
// the upload flow because a) Gemini takes 5-15s and we don't want to block the
// "go to detail" navigation, and b) the receipts query polls while status is
// 'uploaded'/'processing' so the UI catches up regardless. Errors here surface
// only via the receipts.process_error column on the next refetch.
function kickOffProcessing(receiptId: string): void {
  void supabase.functions
    .invoke('process-receipt', { body: { receipt_id: receiptId } })
    .catch((err: unknown) => {
      logger.warn('process-receipt invoke failed', { receiptId, error: err });
    });
}

export function useUploadReceipt() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UploadInput): Promise<Receipt> => {
      if (!userId) throw new Error('Not signed in');

      // Path convention from migration 0007: {user_id}/{receipt_id}.{ext}.
      // Generating the receipt id client-side lets us name the storage object
      // before inserting the row, so the insert is the last step and either
      // both (object + row) succeed or we abandon an orphan object.
      const receiptId = generateReceiptId();
      const path = `${userId}/${receiptId}.jpg`;

      let normalizedUri: string;
      try {
        normalizedUri = await normalizeToJpeg(input.localUri, input.width, input.height);
      } catch (err) {
        throw wrapError('Image normalize failed', err);
      }

      // Read the normalized JPEG via expo-file-system, NOT fetch(file://).blob().
      // The latter is a long-standing RN footgun: it returns a Blob with a
      // plausible .size but whose bytes don't survive supabase-js's upload —
      // the object lands in storage either zero-bytes or corrupted, which is
      // exactly what we saw (blank previews + Gemini "Unable to process input
      // image"). Reading via the File API hands supabase-js a real
      // ArrayBuffer it can serialize correctly.
      let bytes: ArrayBuffer;
      try {
        bytes = await new FsFile(normalizedUri).arrayBuffer();
      } catch (err) {
        throw wrapError('Read normalized file failed', err);
      }
      if (bytes.byteLength === 0) {
        throw new Error(
          `Normalized file is empty (0 bytes). originalUri=${input.localUri}`,
        );
      }

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw wrapError('Storage upload failed', uploadError);

      const { data, error } = await supabase
        .from('receipts')
        .insert({
          id: receiptId,
          user_id: userId,
          image_path: path,
          store_id: input.storeId ?? null,
          notes: input.notes ?? null,
          captured_at: input.capturedAt ?? null,
        })
        .select(RECEIPT_COLUMNS)
        .single();
      if (error) {
        // Insert failed but the bytes are already in storage — clean them up
        // so we don't leak orphan objects on transient errors.
        await supabase.storage.from('receipts').remove([path]);
        throw wrapError('Receipt row insert failed', error);
      }
      const receipt = mapReceipt(data as unknown as ReceiptRow);
      kickOffProcessing(receipt.id);
      return receipt;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.receipts(userId) });
    },
  });
}

// Manually re-runs OCR on a receipt — usually because the first attempt set
// status='failed'. Optimistically flips status to 'processing' so the UI
// reflects the in-flight state immediately; the function flips it again on
// completion.
export function useReprocessReceipt() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (receiptId: string): Promise<void> => {
      const { error } = await supabase.functions.invoke('process-receipt', {
        body: { receipt_id: receiptId },
      });
      if (error) throw error;
    },
    onSuccess: (_data, receiptId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.receipts(userId) });
      void qc.invalidateQueries({ queryKey: queryKeys.receipt(receiptId) });
      void qc.invalidateQueries({ queryKey: queryKeys.receiptItems(receiptId) });
    },
  });
}

// Re-throws an upstream failure with a step-specific prefix while preserving
// the original error's message and any extra fields (Supabase errors carry
// `code`, `details`, `hint`, etc.). The logger.ts unwrap pass copies those
// across automatically.
function wrapError(stepLabel: string, cause: unknown): Error {
  // Supabase errors come back as plain objects ({ message, code, details,
  // hint, ... }) — `cause instanceof Error` is false. Calling
  // String({}) gives "[object Object]", which is exactly the useless
  // wrapped message we kept seeing. Handle the three real cases:
  //   1. Real Error instance — copy enumerable own-props for codes/etc.
  //   2. Plain object with a `message` — use that.
  //   3. Anything else — String() it.
  if (cause instanceof Error) {
    const wrapped = new Error(`${stepLabel}: ${cause.message || 'unknown error'}`);
    for (const key of Object.keys(cause)) {
      if (key === 'message' || key === 'stack') continue;
      (wrapped as unknown as Record<string, unknown>)[key] = (
        cause as unknown as Record<string, unknown>
      )[key];
    }
    return wrapped;
  }
  if (cause && typeof cause === 'object') {
    const obj = cause as Record<string, unknown>;
    const msg =
      typeof obj.message === 'string' && obj.message
        ? obj.message
        : safeStringify(obj);
    const wrapped = new Error(`${stepLabel}: ${msg}`);
    for (const key of Object.keys(obj)) {
      if (key === 'message' || key === 'stack') continue;
      (wrapped as unknown as Record<string, unknown>)[key] = obj[key];
    }
    return wrapped;
  }
  return new Error(`${stepLabel}: ${String(cause)}`);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// Hermes (the JS engine RN uses by default) historically ships without
// `globalThis.crypto` — neither `randomUUID` nor `getRandomValues` are
// guaranteed. The previous fallback called getRandomValues unconditionally
// and crashed on any device where crypto was undefined. Receipt IDs aren't
// security-sensitive (they're an opaque storage key), so Math.random is
// adequate — collision odds at our scale are negligible.
function generateReceiptId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
