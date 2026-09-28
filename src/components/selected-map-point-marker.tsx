import { SELECTED_MAP_POINT_DOT_DIAMETER } from '@/lib/ui-sizes';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Text, View, YStack } from 'tamagui';

type Props = {
  point: Point;
  bangumi: Bangumi;
  showImage: boolean;
  onRendered: () => void;
};

/** Offscreen artwork for a native map symbol. Taps are handled by its ShapeSource. */
export default function SelectedMapPointMarker({ point, bangumi, showImage, onRendered }: Props) {
  const { t } = useTranslation();

  return (
    <YStack
      collapsable={false}
      items="center"
      pointerEvents="none"
      onLayout={onRendered}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {point.image && showImage ? (
        <View rounded="$3" overflow="hidden" borderWidth={3} borderColor="$primary">
          <Image
            key={point.image}
            source={{ uri: buildImageUrl(point.image, 'plan=h160') }}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={0}
            onDisplay={onRendered}
            style={{ width: 112, aspectRatio: 16 / 9 }}
          />
        </View>
      ) : null}

      <YStack items="center">
        <View bg="$primary" rounded="$9" px="$2" py="$0.5" mt={point.image && showImage ? -3 : 0} z={2}>
          <Text fontSize="$caption" lineHeight={16} fontWeight="700" color="white">
            {t('currentLocation', { defaultValue: '当前点位' })}
          </Text>
        </View>
        <View
          width={SELECTED_MAP_POINT_DOT_DIAMETER}
          height={SELECTED_MAP_POINT_DOT_DIAMETER}
          rounded="$9"
          borderWidth={3}
          borderColor="white"
          mt={-2}
          style={{ backgroundColor: bangumi.color || '#991b1b' }}
        />
      </YStack>
    </YStack>
  );
}
