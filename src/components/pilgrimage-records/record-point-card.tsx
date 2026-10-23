import { getPilgrimagePhotoUri } from '@/lib/pilgrimage-record-files';
import type { PilgrimagePoint } from '@/lib/pilgrimage-records';
import { CalendarDays, ChevronRight } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

type Props = { point: PilgrimagePoint; onPress: () => void };

export function RecordPointCard({ point, onPress }: Props) {
  const { t } = useTranslation();
  const latestDay = point.days.reduce((latest, day) => (day.firstRecordedAt > latest.firstRecordedAt ? day : latest));
  const photos = point.days.flatMap((day) => day.photos);
  const photo = photos[0];

  return (
    <View bg="$background" rounded="$4" overflow="hidden">
      <Pressable accessibilityRole="button" accessibilityLabel={point.snapshot.pointName} onPress={onPress}>
        <XStack gap="$3" minH={104}>
          <View width={104} shrink={0} bg="$color4" rounded="$4" justify="center" items="center" overflow="hidden">
            {photo ? (
              <Image
                source={{ uri: getPilgrimagePhotoUri(photo) }}
                recyclingKey={photo.id}
                contentFit="cover"
                style={{ width: 104, height: '100%' }}
                accessible={false}
              />
            ) : (
              <CalendarDays size={26} color="$color10" />
            )}
          </View>
          <YStack flex={1} minW={0} gap="$2" py="$2" justify="space-between">
            <YStack gap="$1" minW={0}>
              <Text fontSize="$caption" color="$color11" numberOfLines={1}>
                {point.snapshot.bangumiName}
              </Text>
              <Text fontSize="$body" color="$color12" fontWeight="600" numberOfLines={2}>
                {point.snapshot.pointName}
              </Text>
            </YStack>
            <Text fontSize="$caption" color="$color11">
              {latestDay.dateKey}
              {' · '}
              <Text fontSize="$caption" color="$color10">
                {t('pilgrimageRecordsPhotoCount', { count: photos.length })}
              </Text>
            </Text>
          </YStack>
          <View self="center" shrink={0} pr="$2">
            <ChevronRight size={16} color="$color10" />
          </View>
        </XStack>
      </Pressable>
    </View>
  );
}
