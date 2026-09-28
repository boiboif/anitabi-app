import type { PlanMapResolvedPoint } from '@/components/plan-map-point-types';
import PointSequenceBadge from '@/components/point-sequence-badge';
import PointImage from '@/components/point-image';
import { formatDuration } from '@/lib/formatDuration';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { getTokens, Text, View, XStack, YStack } from 'tamagui';

function PlanMapPointCardPage({ resolved, total }: { resolved: PlanMapResolvedPoint; total: number }) {
  const { t, i18n } = useTranslation();
  const { point, bangumi, planIndex } = resolved;
  const pointTitle =
    getPointTitle(point, i18n.resolvedLanguage) || t('unnamedLocation', { defaultValue: '未命名点位' });
  const bangumiTitle =
    getBangumiTitle(bangumi, i18n.resolvedLanguage) || t('unknownWork', { defaultValue: '未知作品' });
  const epLabel =
    typeof point.ep === 'number' && point.ep > 0
      ? `EP${point.ep}`
      : typeof point.ep === 'string' && point.ep
        ? point.ep
        : undefined;
  const timeLabel = typeof point.s === 'number' && point.s >= 0 ? formatDuration(point.s) : undefined;
  const innerRadius = getTokens().radius['3'].val;

  return (
    <YStack gap="$1.5" px="$2.5">
      <XStack minH={44} items="center" justify="center" px={40}>
        <YStack flex={1} items="center" justify="center" minW={0}>
          <Text fontSize="$caption" color="$color10" style={{ fontVariant: ['tabular-nums'] }}>
            {planIndex + 1} / {total}
          </Text>
          <Text fontSize="$body" lineHeight={20} fontWeight="700" color="$color12" numberOfLines={1}>
            {pointTitle}
          </Text>
        </YStack>
      </XStack>

      <XStack gap="$2" items="center">
        <PointImage
          image={point.image}
          cover={bangumi.cover}
          title={pointTitle}
          previewBorderRadius={innerRadius}
          width={190}
          aspectRatio={16 / 10}
          rounded="$3"
        >
          <YStack fullscreen pointerEvents="none">
            <PointSequenceBadge sequenceNumber={planIndex + 1} />
          </YStack>
          {epLabel ? (
            <View
              pointerEvents="none"
              position="absolute"
              l={0}
              b={0}
              bg="rgba(0,0,0,0.58)"
              px="$1.5"
              py="$0.5"
              style={{ borderTopRightRadius: innerRadius }}
            >
              <Text fontSize="$caption" fontWeight="700" color="white">
                {epLabel}
              </Text>
            </View>
          ) : null}
          {timeLabel ? (
            <View
              pointerEvents="none"
              position="absolute"
              r={0}
              b={0}
              bg="rgba(0,0,0,0.58)"
              px="$1.5"
              py="$0.5"
              style={{ borderTopLeftRadius: innerRadius }}
            >
              <Text fontSize="$caption" color="white">
                {timeLabel}
              </Text>
            </View>
          ) : null}
        </PointImage>

        <YStack flex={1} minW={0} self="stretch" justify="flex-start" gap="$0.5" pt="$0.5">
          <Text fontSize="$footnote" lineHeight={18} fontWeight="600" color="$primary" numberOfLines={1}>
            {bangumiTitle}
          </Text>
          {point.mark ? (
            <Text fontSize="$caption" lineHeight={16} color="$color11" numberOfLines={6}>
              {point.mark}
            </Text>
          ) : null}
        </YStack>
      </XStack>
    </YStack>
  );
}

export default memo(PlanMapPointCardPage);
