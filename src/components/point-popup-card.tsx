import FavoritePointButton from '@/components/favorite-point-button';
import PointCardActions from '@/components/point-card-actions';
import PointImage from '@/components/point-image';
import { formatDuration } from '@/lib/formatDuration';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import type { Bangumi, Point } from '@/services/types';
import { useMapBrowse } from '@/store/use-map-browse';
import { Linking, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getTokens, Text, useTheme, View } from 'tamagui';

type Props = {
  point: Point;
  bangumi: Bangumi;
  bangumiTitlePressEnabled?: boolean;
};

export default function PopupCard({ point, bangumi, bangumiTitlePressEnabled = true }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const openBangumiDetails = useMapBrowse((state) => state.openBangumiDetails);
  const openedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const pointTitle =
    getPointTitle(point, i18n.resolvedLanguage) || t('unnamedLocation', { defaultValue: '未命名点位' });
  const animeTitle = getBangumiTitle(bangumi, i18n.resolvedLanguage) || t('unknown', { defaultValue: '未知' });
  const epLabel =
    typeof point.ep === 'number' && point.ep > 0
      ? `EP${point.ep}`
      : typeof point.ep === 'string' && point.ep
        ? point.ep
        : undefined;
  const timeLabel = typeof point.s === 'number' && point.s >= 0 ? formatDuration(point.s) : undefined;

  const innerRadius = getTokens().radius['2'].val;

  return (
    <View bg="$color2" rounded="$3" boxShadow="0 2px 8px rgba(0,0,0,0.4)" width={220}>
      {/* 图片 + EP / 时间覆盖层 */}
      <PointImage
        image={point.image}
        cover={bangumi.cover}
        title={pointTitle}
        previewBorderRadius={innerRadius}
        maxPressDistance={8}
        rounded="$2"
        height={((point.image ? 250 : 220) * 9) / 16}
        imageStyle={{ width: point.image ? 250 : '100%', height: '100%', backgroundColor: theme.color9.val }}
      >
        {epLabel && (
          <View
            pointerEvents="none"
            position="absolute"
            l={0}
            b={0}
            bg="rgba(0,0,0,0.55)"
            px="$1.5"
            py="$0.5"
            style={{ borderTopRightRadius: innerRadius }}
          >
            <Text fontSize="$caption" fontWeight="700" color="white">
              {epLabel}
            </Text>
          </View>
        )}
        {timeLabel && (
          <View
            pointerEvents="none"
            position="absolute"
            r={0}
            b={0}
            bg="rgba(0,0,0,0.55)"
            px="$1.5"
            py="$0.5"
            style={{ borderTopLeftRadius: innerRadius }}
          >
            <Text fontSize="$caption" color="white">
              {timeLabel}
            </Text>
          </View>
        )}
        <FavoritePointButton point={point} bangumi={bangumi} overlay />
      </PointImage>

      {/* 文字内容 */}
      <View px="$2" py="$1.5">
        <Text fontWeight="600" fontSize="$footnote" color="$color12" numberOfLines={1} mt="$1">
          {pointTitle}
        </Text>
        {point.mark ? (
          <Text fontSize="$caption" color="$color11" numberOfLines={3} mt="$0.5" mb="$1.5">
            {point.mark}
          </Text>
        ) : null}
        {bangumiTitlePressEnabled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('filterWorkTitle', { defaultValue: '筛选番剧：{{title}}', title: animeTitle })}
            hitSlop={6}
            disabled={!!openedBangumiDetailsId}
            onPress={() => openBangumiDetails(bangumi.id)}
            style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
          >
            <Text fontSize="$footnote" color="$primary" numberOfLines={2}>
              {animeTitle}
            </Text>
          </Pressable>
        ) : (
          <Text fontSize="$footnote" color="$primary" numberOfLines={2}>
            {animeTitle}
          </Text>
        )}
        {point.origin ? (
          <Text
            onPress={() => point.originLink && Linking.openURL(point.originLink)}
            fontSize="$caption"
            color={point.originLink ? '$blue9' : '$color11'}
            style={{ textAlign: 'right', textDecorationLine: 'underline' }}
            mt="$1.5"
          >
            @{point.origin}
          </Text>
        ) : null}
        <View pt="$2">
          <PointCardActions point={point} bangumi={bangumi} showCamera showNavigation />
        </View>
      </View>
    </View>
  );
}
