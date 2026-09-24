import { getPointTitle } from '@/lib/localized-data';
import { SELECTED_MAP_POINT_DOT_DIAMETER } from '@/lib/ui-sizes';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { Image } from 'expo-image';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, View, YStack } from 'tamagui';

type Props = {
  point: Point;
  bangumi: Bangumi;
  showImage: boolean;
  onPress: () => void;
};

export default function SelectedMapPointMarker({ point, bangumi, showImage, onPress }: Props) {
  const { t, i18n } = useTranslation();
  const title = getPointTitle(point, i18n.resolvedLanguage) || t('unnamedLocation', { defaultValue: '未命名点位' });
  const accessibilityLabel = t('currentSelectedLocation', {
    defaultValue: '当前选中点位：{{title}}',
    title,
  });

  return (
    <YStack collapsable={false} items="center" pointerEvents="box-none">
      {point.image ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityElementsHidden={!showImage}
          importantForAccessibility={showImage ? 'auto' : 'no-hide-descendants'}
          pointerEvents={showImage ? 'auto' : 'none'}
          onPress={onPress}
          style={({ pressed }) => ({ opacity: showImage ? (pressed ? 0.72 : 1) : 0 })}
        >
          <View rounded="$3" overflow="hidden" borderWidth={3} borderColor="$primary">
            <Image
              source={{ uri: buildImageUrl(point.image, 'plan=h160') }}
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={0}
              style={{ width: 112, aspectRatio: 16 / 9 }}
            />
          </View>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
      >
        <YStack items="center">
          <View bg="$primary" rounded="$9" px="$2" py="$0.5" mt={point.image ? -3 : 0} z={2}>
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
      </Pressable>
    </YStack>
  );
}
