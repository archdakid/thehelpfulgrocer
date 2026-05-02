import { Image } from 'expo-image';
import { ImageIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { useReceiptSignedUrl } from '@/hooks/useReceipts';
import { useThemedColors } from '@/lib/themedColors';

type ReceiptThumbnailProps = {
  imagePath: string;
  size?: number;
};

export default function ReceiptThumbnail({ imagePath, size = 56 }: ReceiptThumbnailProps) {
  const c = useThemedColors();
  const { data: signedUrl } = useReceiptSignedUrl(imagePath);

  return (
    <View
      className="rounded-lg overflow-hidden bg-muted items-center justify-center"
      style={{ width: size, height: size }}
    >
      {signedUrl ? (
        <Image source={{ uri: signedUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <ImageIcon size={Math.round(size * 0.4)} color={c.text.tertiary} strokeWidth={1.5} />
      )}
    </View>
  );
}
