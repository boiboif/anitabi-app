import { getPointTitle } from '@/lib/localized-data';
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('currentSelectedLocation', {
        defaultValue: '当前选中点位：{{title}}',
        title,
      })}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
    >
      <YStack collapsable={false} items="center">
        {showImage && point.image ? (
          <View
            rounded="$3"
            overflow="hidden"
            borderWidth={3}
            borderColor="$primary"
          >
            <Image
              source={{ uri: buildImageUrl(point.image, 'plan=h160') }}
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={0}
              style={{ width: 112, aspectRatio: 16 / 9 }}
            />
          </View>
        ) : null}

        <View bg="$primary" rounded="$9" px="$2" py="$0.5" mt={showImage && point.image ? -3 : 0} z={2}>
          <Text fontSize="$caption" lineHeight={16} fontWeight="700" color="white">
            {t('currentLocation', { defaultValue: '当前点位' })}
          </Text>
        </View>
        <View
          width={24}
          height={24}
          rounded="$9"
          borderWidth={3}
          borderColor="white"
          mt={-2}
          style={{ backgroundColor: bangumi.color || '#991b1b' }}
        />
      </YStack>
    </Pressable>
  );
}
