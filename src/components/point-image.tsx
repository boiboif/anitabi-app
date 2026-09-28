import PreviewableImage from '@/components/previewable-image';
import { buildImageUrl } from '@/services/handlers';
import { type ImageProps, type ImageSource } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Text, View, YStack, type ViewProps } from 'tamagui';

type Props = ViewProps & {
  image?: string;
  cover?: string;
  title: string;
  thumbnailSource?: string | (ImageSource & { uri: string });
  imageStyle?: ImageProps['style'];
  recyclingKey?: string;
  previewBorderRadius?: number;
  previewEnabled?: boolean;
  maxPressDistance?: number;
};

/** A point screenshot, or its work's cover with a non-interactive missing-screenshot label. */
export default function PointImage({
  image,
  cover,
  title,
  thumbnailSource,
  imageStyle,
  recyclingKey,
  previewBorderRadius = 0,
  previewEnabled = true,
  maxPressDistance,
  children,
  ...viewProps
}: Props) {
  const { t } = useTranslation();
  const path = image || cover;
  const uri = path ? buildImageUrl(path, 'plan=h360') : undefined;
  // Use one thumbnail both on the card and as the full-size preview's placeholder.
  const source =
    (typeof thumbnailSource === 'string' ? { uri: thumbnailSource } : thumbnailSource) ??
    (uri ? { uri, cacheKey: uri } : undefined);
  const label = t(image ? 'previewLocationImage' : 'previewWorkCover', { title });
  const style = imageStyle ?? { width: '100%', height: '100%' };

  return (
    <View position="relative" overflow="hidden" bg="$color5" {...viewProps}>
      {source && path ? (
        <PreviewableImage
          source={source}
          previewUri={previewEnabled ? buildImageUrl(path) : undefined}
          accessibilityLabel={label}
          previewBorderRadius={previewBorderRadius}
          maxPressDistance={maxPressDistance}
          containerStyle={{ flex: 1 }}
          recyclingKey={recyclingKey ?? path}
          style={style}
        />
      ) : null}
      {!image ? (
        <YStack fullscreen pointerEvents="none" bg="rgba(0,0,0,0.7)" items="center" justify="center">
          <Text fontSize="$footnote" color="white">
            {t('noImage', { defaultValue: '暂无截图' })}
          </Text>
        </YStack>
      ) : null}
      {children}
    </View>
  );
}
