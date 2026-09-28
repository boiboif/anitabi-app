import PreviewableImage from '@/components/previewable-image';
import { buildImageUrl } from '@/services/handlers';
import { type ImageProps, type ImageSource } from 'expo-image';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, YStack, type ViewProps } from 'tamagui';

type Props = ViewProps & {
  image?: string;
  cover?: string;
  title: string;
  /** Lists use h160; map cards use h360 with h160 while it loads. */
  thumbnailSize?: 'h160' | 'h360';
  thumbnailSource?: string | (ImageSource & { uri: string });
  imageStyle?: ImageProps['style'];
  recyclingKey?: string;
  previewBorderRadius?: number;
  previewEnabled?: boolean;
  maxPressDistance?: number;
};

const PREVIEW_CONTAINER_STYLE = { flex: 1 } as const;

/** A point screenshot, or its work's cover with a non-interactive missing-screenshot label. */
export default function PointImage({
  image,
  cover,
  title,
  thumbnailSize = 'h360',
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
  const uri = path ? buildImageUrl(path, `plan=${thumbnailSize}`) : undefined;
  const fallbackUri = path && thumbnailSize === 'h360' ? buildImageUrl(path, 'plan=h160') : undefined;
  // The displayed thumbnail is also the preview placeholder after it has loaded.
  // Keep the native image source unchanged when only preview interaction changes.
  const source = useMemo(
    () =>
      (typeof thumbnailSource === 'string' ? { uri: thumbnailSource } : thumbnailSource) ??
      (uri ? { uri, cacheKey: uri } : undefined),
    [thumbnailSource, uri],
  );
  const label = t(image ? 'previewLocationImage' : 'previewWorkCover', { title });
  const style = imageStyle ?? { width: '100%', height: '100%' };

  // Block taps at the outer view so the image and its gesture wrapper keep their props.
  return (
    <View
      position="relative"
      overflow="hidden"
      bg="$color5"
      {...viewProps}
      pointerEvents={previewEnabled ? 'auto' : 'none'}
      accessibilityElementsHidden={!previewEnabled}
      importantForAccessibility={previewEnabled ? 'auto' : 'no-hide-descendants'}
    >
      {source && path ? (
        <PreviewableImage
          source={source}
          placeholder={fallbackUri ? { uri: fallbackUri } : undefined}
          previewFallbackUri={fallbackUri}
          previewUri={buildImageUrl(path)}
          accessibilityLabel={label}
          previewBorderRadius={previewBorderRadius}
          maxPressDistance={maxPressDistance}
          containerStyle={PREVIEW_CONTAINER_STYLE}
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
