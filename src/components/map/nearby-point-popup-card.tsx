import PointImage from '@/components/point/point-image';
import PointNavigationButton from '@/components/point/point-navigation-button';
import NearbyPlaceIcon from '@/components/map/nearby-place-icon';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import type { Bangumi, Point } from '@/services/types';
import type { PreparedPlaceIcon } from '@/services/nearby-place-sprite';
import { formatNearbyDistance, type NearbyPoint } from '@/utils/nearby-points';
import { useMapPlaceColor, type MapPlaceFeature } from '@/hooks/use-map-place-color';
import { getReadableMapTextColor } from '@/utils/map-text-contrast';
import { Toast } from '@boiboif/react-native-toast';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { Text, useTheme, View, XStack, YStack } from 'tamagui';

export type NearbyPlace = {
  name: string;
  englishName?: string | null;
  icon?: string;
  fallbackIcon?: string;
  iconAsset?: PreparedPlaceIcon | null;
  category?: string;
  mapFeature?: MapPlaceFeature;
};

type Props = {
  /** Coordinates in the point data's [latitude, longitude] order. */
  geo: [number, number];
  nearbyPoints: NearbyPoint[];
  place: NearbyPlace | null;
  region: string | null;
  mapStyleURL: string;
  mapZoom: number;
  onPointPress: (point: Point, bangumi: Bangumi) => void;
};

export default function NearbyPointPopupCard({ geo, nearbyPoints, place, region, mapStyleURL, mapZoom, onPointPress }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const mapColor = useMapPlaceColor(mapStyleURL, place?.mapFeature, mapZoom);
  const sourceColor = place?.iconAsset?.color ?? mapColor;
  const placeColor = sourceColor ? getReadableMapTextColor(sourceColor, theme.background.val) : null;
  const title = place?.name || `${geo[1].toFixed(6)}, ${geo[0].toFixed(6)}`;

  const copyText = async (text: string) => {
    try {
      if (await Clipboard.setStringAsync(text)) Toast.show(t('copiedToClipboard'));
    } catch {
      // Do not report success when the clipboard is unavailable.
    }
  };

  return (
    <YStack width={220} items="center">
      <YStack bg="$background" rounded="$3" boxShadow="0 2px 8px rgba(0,0,0,0.4)" width="100%">
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
          <XStack items="center" gap="$2" minH={22}>
            <YStack flex={1} minW={0}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={title}
                onPress={(event) => {
                  event.stopPropagation();
                  void copyText(title);
                }}
              >
                <Text
                  fontWeight="600"
                  fontSize="$footnote"
                  color="$color12"
                  style={placeColor ? { color: placeColor } : undefined}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              </Pressable>
              {place?.englishName ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={place.englishName}
                  onPress={(event) => {
                    event.stopPropagation();
                    void copyText(place.englishName!);
                  }}
                >
                  <Text
                    fontSize="$caption"
                    color="$color10"
                    style={placeColor ? { color: placeColor } : undefined}
                    numberOfLines={1}
                  >
                    {place.englishName}
                  </Text>
                </Pressable>
              ) : null}
            </YStack>
            {place?.icon || place?.fallbackIcon ? (
              <View width={22} height={22} items="center" justify="center" pointerEvents="none">
                <NearbyPlaceIcon
                  name={place.icon}
                  fallbackName={place.fallbackIcon}
                  asset={place.iconAsset}
                  color={placeColor || theme.color12.val}
                />
              </View>
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
      {/* The tip is included in the marker bounds, so anchor y=1 points at the tap. */}
      <View
        width={0}
        height={0}
        borderLeftWidth={7}
        borderRightWidth={7}
        borderTopWidth={7}
        borderLeftColor="transparent"
        borderRightColor="transparent"
        borderTopColor="$background"
        pointerEvents="none"
      />
    </YStack>
  );
}
