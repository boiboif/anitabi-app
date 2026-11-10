import PointImage from '@/components/point/point-image';
import PointNavigationButton from '@/components/point/point-navigation-button';
import NearbyPlaceIcon from '@/components/map/nearby-place-icon';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import type { Bangumi, Point } from '@/services/types';
import { formatNearbyDistance, type NearbyPoint } from '@/utils/nearby-points';
import { getNearbyPlaceColor } from '@/utils/nearby-place-appearance';
import { Toast } from '@boiboif/react-native-toast';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { Text, useTheme, useThemeName, View, XStack, YStack } from 'tamagui';

export type NearbyPlace = {
  name: string;
  englishName?: string | null;
  icon?: string;
  fallbackIcon?: string;
  category?: string;
};

type Props = {
  /** Coordinates in the point data's [latitude, longitude] order. */
  geo: [number, number];
  nearbyPoints: NearbyPoint[];
  place: NearbyPlace | null;
  region: string | null;
  onPointPress: (point: Point, bangumi: Bangumi) => void;
};

export default function NearbyPointPopupCard({ geo, nearbyPoints, place, region, onPointPress }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const colorScheme = useThemeName() === 'dark' ? 'dark' : 'light';
  const placeColor = place && (
    getNearbyPlaceColor(place.icon, undefined, colorScheme) ??
    getNearbyPlaceColor(place.fallbackIcon, place.category, colorScheme)
  );
  const title = place?.name || `${geo[1].toFixed(6)}, ${geo[0].toFixed(6)}`;

  const copyText = async (text: string) => {
    try {
      if (await Clipboard.setStringAsync(text)) Toast.show(t('copiedToClipboard'));
    } catch {
      // Do not report success when the clipboard is unavailable.
    }
  };

  return (
    <YStack bg="$background" rounded="$3" boxShadow="0 2px 8px rgba(0,0,0,0.4)" width={220}>
      {nearbyPoints.length > 0 ? (
        <XStack overflow="hidden" rounded="$2">
          {nearbyPoints.map(({ point, bangumi, distanceMeters }) => {
            const pointTitle = getPointTitle(point, i18n.resolvedLanguage) || t('unnamedLocation');
            const bangumiTitle = getBangumiTitle(bangumi, i18n.resolvedLanguage) || t('unknown');
            const distance = formatNearbyDistance(distanceMeters);
            return (
              <Pressable
                key={`${bangumi.id}:${point.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${pointTitle}, ${bangumiTitle}, ${distance}${point.image ? '' : `, ${t('noImage')}`}`}
                onPress={(event) => {
                  event.stopPropagation();
                  onPointPress(point, bangumi);
                }}
                style={{ width: 220 / 3 }}
              >
                <PointImage
                  image={point.image}
                  cover={bangumi.cover}
                  title={pointTitle}
                  thumbnailSize="h160"
                  previewEnabled={false}
                  height={64}
                  width="100%"
                >
                  <View position="absolute" l={0} b={0} bg="rgba(0,0,0,0.65)" px="$1" py="$0.5">
                    <Text fontSize="$caption" fontWeight="700" color="white">
                      {distance}
                    </Text>
                  </View>
                </PointImage>
              </Pressable>
            );
          })}
        </XStack>
      ) : null}
      <YStack px="$2" py="$1.5" gap="$1">
        <XStack items="center" gap="$2">
          <YStack flex={1} minW={0}>
            <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={(event) => {
              event.stopPropagation();
              void copyText(title);
            }}>
              <Text fontWeight="600" fontSize="$footnote" color="$color12" style={placeColor ? { color: placeColor } : undefined} numberOfLines={1}>
                {title}
              </Text>
            </Pressable>
            {place?.englishName ? (
              <Pressable accessibilityRole="button" accessibilityLabel={place.englishName} onPress={(event) => {
                event.stopPropagation();
                void copyText(place.englishName!);
              }}>
                <Text fontSize="$caption" color="$color10" style={placeColor ? { color: placeColor } : undefined} opacity={placeColor ? 0.65 : 1} numberOfLines={1}>
                  {place.englishName}
                </Text>
              </Pressable>
            ) : null}
          </YStack>
          {place?.icon || place?.fallbackIcon ? (
            <NearbyPlaceIcon name={place.icon} fallbackName={place.fallbackIcon} color={placeColor || theme.color12.val} />
          ) : null}
        </XStack>
        <XStack items="center" justify="space-between" gap="$1">
          <Text flex={1} minW={0} fontWeight="600" fontSize="$caption" color="$color12" numberOfLines={2} selectable>
            {region}
          </Text>
          <PointNavigationButton mapCoordinate={geo} compact showLabel />
        </XStack>
      </YStack>
    </YStack>
  );
}
