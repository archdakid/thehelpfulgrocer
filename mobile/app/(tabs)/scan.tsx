import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  Barcode,
  Camera as CameraIcon,
  Check,
  Flashlight,
  FlashlightOff,
  Keyboard,
  Plus,
  ReceiptText,
  RotateCcw,
  Sparkles,
  Store,
  X,
} from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
  type Code,
} from 'react-native-vision-camera';

import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { isCategoryId } from '@/constants/categories';
import { usePricesForProduct } from '@/hooks/usePricesForProduct';
import { useProductByBarcode } from '@/hooks/useProductByBarcode';
import { formatPrice } from '@/lib/format';
import { resolveProductImage } from '@/lib/productImage';
import { useThemedColors } from '@/lib/themedColors';
import { useListStore } from '@/stores/useListStore';

export default function ScanScreen() {
  const router = useRouter();
  const c = useThemedColors();
  const isFocused = useIsFocused();

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const [torch, setTorch] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [addedToList, setAddedToList] = useState(false);

  // Cooldown guard so a single physical scan doesn't fire multiple state updates
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const addProductItem = useListStore((s) => s.addProductItem);
  const addItem = useListStore((s) => s.addItem);

  const lookupQuery = useProductByBarcode(scannedBarcode);
  const matchedProduct =
    lookupQuery.data?.source === 'catalog' ? lookupQuery.data.product : null;
  const pricesQuery = usePricesForProduct(matchedProduct?.id ?? '');

  const onCodeScanned = useCallback(
    (codes: Code[]) => {
      if (scannedBarcode || manualModalOpen) return;
      const firstValue = codes.find((code) => code.value && code.value.trim().length >= 6)?.value;
      const raw = firstValue?.trim();
      if (!raw) return;

      const now = Date.now();
      if (lastScanRef.current.code === raw && now - lastScanRef.current.at < 2000) {
        return;
      }
      lastScanRef.current = { code: raw, at: now };
      setAddedToList(false);
      setScannedBarcode(raw);
    },
    [scannedBarcode, manualModalOpen],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128'],
    onCodeScanned,
  });

  const handleManualSubmit = () => {
    const cleaned = manualInput.trim().replace(/\s+/g, '');
    if (cleaned.length < 6) return;
    setManualModalOpen(false);
    setAddedToList(false);
    setScannedBarcode(cleaned);
  };

  const handleResetScan = () => {
    setScannedBarcode(null);
    setAddedToList(false);
  };

  const handleAddCatalogProduct = () => {
    if (!matchedProduct) return;
    addProductItem({
      id: matchedProduct.id,
      name: matchedProduct.name,
      brand: matchedProduct.brand,
      category: isCategoryId(matchedProduct.category) ? matchedProduct.category : null,
      imageUrl: resolveProductImage({ offImageUrl: null, ownImageUrl: matchedProduct.image_url }),
    });
    setAddedToList(true);
  };

  const handleAddOffProduct = () => {
    if (lookupQuery.data?.source !== 'open_food_facts') return;
    const off = lookupQuery.data.offProduct;
    const label = [off.brand, off.productName].filter(Boolean).join(' ') || `Item (${scannedBarcode})`;
    addItem(label);
    setAddedToList(true);
  };

  const cheapestEntry =
    pricesQuery.data && pricesQuery.data.length > 0 ? pricesQuery.data[0] : null;
  const storeCount = pricesQuery.data?.length ?? 0;

  const cameraActive =
    isFocused &&
    hasPermission &&
    device != null &&
    scannedBarcode === null &&
    !manualModalOpen;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b-[0.5px] border-border">
        <View className="flex-1 pr-3">
          <Text className="text-h2 font-semibold text-primary">Scan</Text>
          <Text className="text-caption text-secondary mt-0.5">
            Scan a product barcode or capture a store receipt
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/receipt/upload')}
          accessibilityRole="button"
          accessibilityLabel="Upload or capture store receipt"
          className="flex-row items-center gap-1.5 rounded-full bg-surface border-[0.5px] border-border px-3.5 py-2 active:opacity-80"
        >
          <ReceiptText size={16} color={c.brand.primary} strokeWidth={1.9} />
          <Text className="text-body-sm font-semibold text-brand-primary">Scan Receipt</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Camera Viewport or Permission Card */}
        <View className="flex-1 px-4 pt-3 pb-4">
          {!hasPermission ? (
            <View className="flex-1 items-center justify-center rounded-2xl bg-surface border-[0.5px] border-border px-6">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-tint mb-4">
                <CameraIcon size={26} color={c.brand.primary} strokeWidth={1.8} />
              </View>
              <Text className="text-h3 font-semibold text-primary text-center">
                Camera Access for Barcode Scanning
              </Text>
              <Text className="text-body-sm text-secondary text-center mt-2 mb-6">
                Allow SmartShopper to use your camera to scan UPC and EAN barcodes in-store and
                instantly compare prices across Massy, PriceSmart, and SuperPharm.
              </Text>
              <Button label="Enable Camera" onPress={requestPermission} />
              <Pressable
                onPress={() => setManualModalOpen(true)}
                className="mt-4 py-2 flex-row items-center gap-1.5"
              >
                <Keyboard size={15} color={c.text.secondary} />
                <Text className="text-body-sm font-medium text-secondary">
                  Or type a barcode number manually
                </Text>
              </Pressable>
            </View>
          ) : device == null ? (
            <View className="flex-1 items-center justify-center rounded-2xl bg-surface border-[0.5px] border-border px-6">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-tint mb-4">
                <Barcode size={26} color={c.brand.primary} strokeWidth={1.8} />
              </View>
              <Text className="text-h3 font-semibold text-primary text-center">
                No Back Camera Detected
              </Text>
              <Text className="text-body-sm text-secondary text-center mt-2 mb-6">
                Connect a physical iOS device to use high-speed VisionCamera barcode scanning, or
                look up any barcode manually below.
              </Text>
              <Button label="Type Barcode Manually" onPress={() => setManualModalOpen(true)} />
            </View>
          ) : (
            <View className="flex-1 overflow-hidden rounded-2xl bg-black border-[0.5px] border-border relative">
              {cameraActive ? (
                <Camera
                  style={StyleSheet.absoluteFillObject}
                  device={device}
                  isActive={cameraActive}
                  torch={torch && device.hasTorch ? 'on' : 'off'}
                  codeScanner={codeScanner}
                />
              ) : (
                <View
                  style={StyleSheet.absoluteFillObject}
                  className="items-center justify-center bg-black/90"
                >
                  <Barcode size={42} color="#FFFFFF" strokeWidth={1.5} />
                  <Text className="text-caption text-white/70 mt-2">
                    {scannedBarcode ? `Scanned ${scannedBarcode}` : 'Camera paused'}
                  </Text>
                </View>
              )}

              {/* Reticle overlay when scanning */}
              {cameraActive ? (
                <View
                  pointerEvents="none"
                  className="flex-1 items-center justify-center px-8"
                >
                  <View className="w-full max-w-[260px] h-[156px] relative items-center justify-center">
                    {/* Top-left bracket */}
                    <View className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-white rounded-tl-lg" />
                    {/* Top-right bracket */}
                    <View className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-white rounded-tr-lg" />
                    {/* Bottom-left bracket */}
                    <View className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-white rounded-bl-lg" />
                    {/* Bottom-right bracket */}
                    <View className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-white rounded-br-lg" />
                    {/* Center scan line */}
                    <View className="w-5/6 h-[1.5px] bg-brand-accent/80" />
                  </View>
                  <View className="mt-4 rounded-full bg-black/65 px-3.5 py-1.5">
                    <Text className="text-caption text-white font-medium">
                      Align UPC / EAN barcode inside frame
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Floating camera toolbar */}
              <View className="absolute bottom-3 left-3 right-3 flex-row items-center justify-between">
                <Pressable
                  onPress={() => setTorch((prev) => !prev)}
                  disabled={!device.hasTorch}
                  accessibilityRole="button"
                  accessibilityLabel={torch ? 'Turn flashlight off' : 'Turn flashlight on'}
                  className={`flex-row items-center gap-1.5 rounded-full bg-black/70 px-3.5 py-2 ${
                    !device.hasTorch ? 'opacity-40' : ''
                  }`}
                >
                  {torch ? (
                    <FlashlightOff size={16} color="#FDE047" />
                  ) : (
                    <Flashlight size={16} color="#FFFFFF" />
                  )}
                  <Text className="text-caption font-medium text-white">
                    {torch ? 'Torch On' : 'Torch'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setManualInput(scannedBarcode ?? '');
                    setManualModalOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Enter barcode manually"
                  className="flex-row items-center gap-1.5 rounded-full bg-black/70 px-3.5 py-2"
                >
                  <Keyboard size={16} color="#FFFFFF" />
                  <Text className="text-caption font-medium text-white">Type UPC</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Manual Barcode Entry Drawer */}
          {manualModalOpen ? (
            <View className="mt-3 rounded-xl bg-surface border-[0.5px] border-border p-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-body font-semibold text-primary">
                  Enter Barcode (UPC / EAN)
                </Text>
                <Pressable
                  onPress={() => setManualModalOpen(false)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close manual barcode input"
                >
                  <X size={18} color={c.text.secondary} />
                </Pressable>
              </View>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={manualInput}
                  onChangeText={setManualInput}
                  placeholder="e.g. 078742039527"
                  placeholderTextColor={c.text.tertiary}
                  keyboardType="number-pad"
                  returnKeyType="search"
                  onSubmitEditing={handleManualSubmit}
                  autoFocus
                  className="flex-1 h-11 rounded-lg bg-canvas border-[0.5px] border-border px-3 text-body text-primary font-mono"
                />
                <View className="w-28">
                  <Button
                    label="Look Up"
                    onPress={handleManualSubmit}
                    disabled={manualInput.trim().length < 6}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {/* Scanned Result Panel */}
          {scannedBarcode ? (
            <View className="mt-3 rounded-xl bg-surface border-[0.5px] border-border p-4">
              <View className="flex-row items-center justify-between mb-2.5">
                <View className="flex-row items-center gap-1.5">
                  <Badge variant="accent" label={`UPC ${scannedBarcode}`} />
                  {lookupQuery.data?.source === 'catalog' ? (
                    <Badge variant="success" label="In Catalog" />
                  ) : lookupQuery.data?.source === 'open_food_facts' ? (
                    <Badge variant="warning" label="Open Food Facts" />
                  ) : null}
                </View>
                <Pressable
                  onPress={handleResetScan}
                  className="flex-row items-center gap-1 py-1 px-2 rounded-md active:opacity-75"
                >
                  <RotateCcw size={14} color={c.brand.primary} />
                  <Text className="text-caption font-semibold text-brand-primary">
                    Scan Next
                  </Text>
                </Pressable>
              </View>

              {lookupQuery.isLoading ? (
                <View className="py-6 items-center justify-center">
                  <ActivityIndicator color={c.brand.primary} />
                  <Text className="text-caption text-secondary mt-2">
                    Checking Trinidad grocery catalogs…
                  </Text>
                </View>
              ) : lookupQuery.data?.source === 'catalog' && matchedProduct ? (
                <ScrollView className="max-h-64" showsVerticalScrollIndicator={false}>
                  <View className="flex-row items-center gap-3">
                    {matchedProduct.image_url ? (
                      <Image
                        source={{ uri: matchedProduct.image_url }}
                        style={{ width: 56, height: 56, borderRadius: 10 }}
                        contentFit="contain"
                      />
                    ) : (
                      <View className="h-14 w-14 rounded-lg bg-canvas items-center justify-center border-[0.5px] border-border">
                        <Store size={22} color={c.text.tertiary} />
                      </View>
                    )}
                    <View className="flex-1">
                      {matchedProduct.brand ? (
                        <Text className="text-caption uppercase tracking-wider text-secondary">
                          {matchedProduct.brand}
                        </Text>
                      ) : null}
                      <Text className="text-h3 font-semibold text-primary" numberOfLines={2}>
                        {matchedProduct.name}
                      </Text>
                      {pricesQuery.isLoading ? (
                        <Text className="text-caption text-secondary mt-1">
                          Loading store prices…
                        </Text>
                      ) : cheapestEntry ? (
                        <Text className="text-body-sm font-semibold text-brand-primary mt-1">
                          Best price {formatPrice(cheapestEntry.amountMinorUnits)} at{' '}
                          {cheapestEntry.store?.name ?? 'Store'}
                          {storeCount > 1 ? ` · ${storeCount} stores` : ''}
                        </Text>
                      ) : (
                        <Text className="text-caption text-secondary mt-1">
                          No active shelf prices recorded yet
                        </Text>
                      )}
                    </View>
                  </View>

                  <View className="mt-4 gap-2">
                    <Button
                      label="Compare Store Prices"
                      onPress={() => router.push(`/product/${matchedProduct.id}`)}
                    />
                    <Pressable
                      onPress={handleAddCatalogProduct}
                      disabled={addedToList}
                      className={`h-10 rounded-lg border-[0.5px] border-border flex-row items-center justify-center gap-1.5 ${
                        addedToList ? 'bg-brand-tint' : 'bg-canvas'
                      }`}
                    >
                      {addedToList ? (
                        <>
                          <Check size={16} color={c.brand.primary} />
                          <Text className="text-body-sm font-semibold text-brand-primary">
                            Added to Grocery List
                          </Text>
                        </>
                      ) : (
                        <>
                          <Plus size={16} color={c.text.primary} />
                          <Text className="text-body-sm font-semibold text-primary">
                            Add to Grocery List
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </ScrollView>
              ) : lookupQuery.data?.source === 'open_food_facts' ? (
                <View>
                  <View className="flex-row items-center gap-3">
                    {lookupQuery.data.offProduct.imageUrl ? (
                      <Image
                        source={{ uri: lookupQuery.data.offProduct.imageUrl }}
                        style={{ width: 52, height: 52, borderRadius: 10 }}
                        contentFit="contain"
                      />
                    ) : (
                      <View className="h-12 w-12 rounded-lg bg-canvas items-center justify-center border-[0.5px] border-border">
                        <Sparkles size={20} color={c.brand.primary} />
                      </View>
                    )}
                    <View className="flex-1">
                      {lookupQuery.data.offProduct.brand ? (
                        <Text className="text-caption uppercase tracking-wider text-secondary">
                          {lookupQuery.data.offProduct.brand}
                        </Text>
                      ) : null}
                      <Text className="text-h3 font-semibold text-primary" numberOfLines={2}>
                        {lookupQuery.data.offProduct.productName ?? `Barcode ${scannedBarcode}`}
                      </Text>
                      <Text className="text-caption text-secondary mt-0.5">
                        Identified via Open Food Facts · Not yet linked to a local store price
                      </Text>
                    </View>
                  </View>

                  <View className="mt-3.5 gap-2">
                    <Button
                      label={addedToList ? 'Added to Grocery List ✓' : 'Add to Grocery List'}
                      onPress={handleAddOffProduct}
                      disabled={addedToList}
                    />
                    <Button
                      label="Scan Another Barcode"
                      variant="secondary"
                      onPress={handleResetScan}
                    />
                  </View>
                </View>
              ) : (
                <View>
                  <Text className="text-body font-semibold text-primary">
                    No Product Found for {scannedBarcode}
                  </Text>
                  <Text className="text-body-sm text-secondary mt-1">
                    This barcode isn&apos;t in our Trinidad catalog yet. You can upload a receipt
                    to contribute new products and prices, or scan another item.
                  </Text>
                  <View className="mt-3.5 flex-row gap-2">
                    <View className="flex-1">
                      <Button
                        label="Scan Receipt"
                        variant="secondary"
                        onPress={() => router.push('/receipt/upload')}
                      />
                    </View>
                    <View className="flex-1">
                      <Button label="Scan Again" onPress={handleResetScan} />
                    </View>
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
