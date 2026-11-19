import { getPilgrimagePhotoUri } from '@/lib/pilgrimage-record-files';
import { getPilgrimageDayLatestTime, type PilgrimagePoint } from '@/lib/pilgrimage-records';
import { buildImageUrl } from '@/services/handlers';
import { CalendarDays, ChevronRight } from '@/components/icons';
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
    <View bg="background" rounded={9} overflow="hidden">
      <Pressable accessibilityRole="button" accessibilityLabel={point.snapshot.pointName} onPress={onPress}>
        <XStack gap="7px" minH={96}>
          <View w={120} shrink={0} bg="color-4" rounded={9} justify="center" items="center" overflow="hidden">
            {coverUri ? (
              <Image
                source={{ uri: coverUri }}
                recyclingKey={photo?.id ?? coverUri}
                contentFit="cover"
                style={{ width: 120, height: '100%' }}
                accessible={false}
              />
            ) : (
              <CalendarDays size={26} color="color-10" />
            )}
          </View>
          <YStack flex={1} minW={0} gap="0-5" py="1" justify="space-between">
            <YStack gap="px" minW={0}>
              <Text fontSize="body" color="color-12" fontWeight="600" numberOfLines={2}>
                {point.snapshot.pointName}
              </Text>
              <Text fontSize="caption" color="color-11" numberOfLines={1}>
                {point.snapshot.bangumiName}
              </Text>
            </YStack>
            <YStack gap="0-5">
              <Text fontSize="caption" lineHeight="13px" color="color-10">
                {t('pilgrimageRecordsCounts', { days: point.days.length, photos: photos.length })}
              </Text>
              <Text fontSize={9} lineHeight="12px" color="color-11" numberOfLines={1}>
                {t('pilgrimageRecordsLastVisit', { date: latestVisit })}
              </Text>
            </YStack>
          </YStack>
          <View self="center" shrink={0} pr="7px">
            <ChevronRight size={16} color="color-10" />
          </View>
        </XStack>
      </Pressable>
    </View>
  );
}
