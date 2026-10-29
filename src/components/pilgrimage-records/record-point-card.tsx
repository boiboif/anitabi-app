import { getPilgrimagePhotoUri } from '@/lib/pilgrimage-record-files';
import { getPilgrimageDayLatestTime, type PilgrimagePoint } from '@/lib/pilgrimage-records';
import { buildImageUrl } from '@/services/handlers';
import { CalendarDays, ChevronRight } from '@tamagui/lucide-icons-2';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

type Props = { point: PilgrimagePoint; onPress: () => void };

export function RecordPointCard({ point, onPress }: Props) {
  const { t } = useTranslation();
  const latestDay = point.days.reduce((latest, day) =>
    getPilgrimageDayLatestTime(day) > getPilgrimageDayLatestTime(latest) ? day : latest,
  );
  const latestVisit =
    latestDay.lastRecordedAt === undefined
      ? latestDay.dateKey
      : dayjs(latestDay.lastRecordedAt).format('YYYY-MM-DD HH:mm');
  const photos = point.days.flatMap((day) => day.photos);
  const photo = photos[0];
  const coverUri = photo
    ? getPilgrimagePhotoUri(photo)
    : point.snapshot.pointImage
      ? buildImageUrl(point.snapshot.pointImage, 'plan=h160')
      : undefined;

  return (
    <View bg="$background" rounded="$4" overflow="hidden">
      <Pressable accessibilityRole="button" accessibilityLabel={point.snapshot.pointName} onPress={onPress}>
        <XStack gap="$2" minH={96}>
          <View width={120} shrink={0} bg="$color4" rounded="$4" justify="center" items="center" overflow="hidden">
            {coverUri ? (
              <Image
                source={{ uri: coverUri }}
                recyclingKey={photo?.id ?? coverUri}
                contentFit="cover"
                style={{ width: 120, height: '100%' }}
                accessible={false}
              />
            ) : (
              <CalendarDays size={26} color="$color10" />
            )}
          </View>
          <YStack flex={1} minW={0} gap="$1" py="$1.5" justify="space-between">
            <YStack gap="$0.5" minW={0}>
              <Text fontSize="$caption" color="$color11" numberOfLines={1}>
                {point.snapshot.bangumiName}
              </Text>
              <Text fontSize="$body" color="$color12" fontWeight="600" numberOfLines={2}>
                {point.snapshot.pointName}
              </Text>
            </YStack>
            <YStack gap="$1">
              <Text fontSize="$caption" lineHeight={13} color="$color10">
                {t('pilgrimageRecordsCounts', { days: point.days.length, photos: photos.length })}
              </Text>
              <Text fontSize={9} lineHeight={12} color="$color11" numberOfLines={1}>
                {t('pilgrimageRecordsLastVisit', { date: latestVisit })}
              </Text>
            </YStack>
          </YStack>
          <View self="center" shrink={0} pr="$2">
            <ChevronRight size={16} color="$color10" />
          </View>
        </XStack>
      </Pressable>
    </View>
  );
}
