import ComparisonCameraButton from '@/components/comparison-camera/comparison-camera-button';
import GoogleMapsNavigationButton from '@/components/point/google-maps-navigation-button';
import type { PlanMapResolvedPoint } from '@/components/plan/plan-map-point-types';
import PointImage from '@/components/point/point-image';
import PointSequenceBadge from '@/components/point/point-sequence-badge';
import SwipeableCardCarousel, { type SwipeableCardCarouselHandle } from '@/components/ui/swipeable-card-carousel';
import { formatDuration } from '@/lib/formatDuration';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import { CheckCircle2, ChevronLeft, ChevronRight, Flag } from '@tamagui/lucide-icons-2';
import { memo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, type LayoutChangeEvent } from 'react-native';
import { getTokens, Text, useTheme, useThemeName, View, XStack, YStack } from 'tamagui';

export const PLAN_MAP_POINT_CARD_FALLBACK_HEIGHT = 231;
export const PLAN_MAP_POINT_CARD_BOTTOM_OFFSET = 24;

type Props = {
  resolved: PlanMapResolvedPoint;
  previous: PlanMapResolvedPoint | null;
  next: PlanMapResolvedPoint | null;
  total: number;
  bottomInset: number;
  onPrevious: () => void;
  onNext: () => void;
  onRefocus: () => void;
  onToggleCompleted: () => void;
  onHeightChange?: (height: number) => void;
};

type IconButtonProps = {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
};

const PlanMapPointCardPage = memo(function PlanMapPointCardPage({
  resolved,
  total,
}: {
  resolved: PlanMapResolvedPoint;
  total: number;
}) {
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
});

function IconButton({ label, disabled = false, onPress, children }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: disabled ? 0.28 : pressed ? 0.58 : 1 })}
    >
      <View width={40} height={40} items="center" justify="center">
        {children}
      </View>
    </Pressable>
  );
}

function PlanMapPointCard({
  resolved,
  previous,
  next,
  total,
  bottomInset,
  onPrevious,
  onNext,
  onRefocus,
  onToggleCompleted,
  onHeightChange,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const themeName = useThemeName();
  const carouselRef = useRef<SwipeableCardCarouselHandle>(null);
  const { point, bangumi, item } = resolved;
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onHeightChange?.(Math.ceil(event.nativeEvent.layout.height)),
    [onHeightChange],
  );

  return (
    <YStack
      position="absolute"
      l="$3"
      r="$3"
      b={bottomInset + PLAN_MAP_POINT_CARD_BOTTOM_OFFSET}
      z={30}
      bg="$color2"
      rounded="$4"
      boxShadow={
        themeName === 'dark'
          ? '0 6px 24px rgba(0,0,0,0.58), 0 0 0 1px rgba(255,255,255,0.08)'
          : '0 6px 24px rgba(0,0,0,0.3)'
      }
      py="$1.5"
      gap="$1.5"
      onLayout={handleLayout}
    >
      <View position="relative">
        <SwipeableCardCarousel
          ref={carouselRef}
          currentKey={item.key}
          current={<PlanMapPointCardPage resolved={resolved} total={total} />}
          previousKey={previous?.item.key}
          previous={previous ? <PlanMapPointCardPage resolved={previous} total={total} /> : undefined}
          nextKey={next?.item.key}
          next={next ? <PlanMapPointCardPage resolved={next} total={total} /> : undefined}
          onPrevious={onPrevious}
          onNext={onNext}
          estimatedHeight={169}
        />
        <XStack
          position="absolute"
          t={0}
          l="$2.5"
          r="$2.5"
          height={44}
          items="center"
          justify="space-between"
          pointerEvents="box-none"
        >
          <IconButton
            label={t('previousPlanLocation', { defaultValue: '上一个点位' })}
            disabled={!previous}
            onPress={() => carouselRef.current?.previous()}
          >
            <ChevronLeft size={24} strokeWidth={2.25} color={theme.primary.val} />
          </IconButton>
          <IconButton
            label={t('nextPlanLocation', { defaultValue: '下一个点位' })}
            disabled={!next}
            onPress={() => carouselRef.current?.next()}
          >
            <ChevronRight size={24} strokeWidth={2.25} color={theme.primary.val} />
          </IconButton>
        </XStack>
      </View>

      <XStack height={38} items="center" px="$2.5">
        <XStack flex={1} items="center" justify="center">
          <IconButton label={t('refocusSelectedLocation', { defaultValue: '回到当前点位' })} onPress={onRefocus}>
            <Flag size={22} strokeWidth={2.15} color="$primary" />
          </IconButton>
        </XStack>
        <View width="$0.25" height={16} bg="$color5" opacity={0.3} />
        <XStack flex={1} items="center" justify="center">
          <ComparisonCameraButton point={point} bangumi={bangumi} compact compactSize={42} bare />
        </XStack>
        <View width="$0.25" height={16} bg="$color5" opacity={0.3} />
        <XStack flex={1} items="center" justify="center">
          <GoogleMapsNavigationButton point={point} compact compactSize={42} bare />
        </XStack>
        <View width="$0.25" height={16} bg="$color5" opacity={0.3} />
        <XStack flex={1} items="center" justify="center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              item.completed
                ? t('markIncomplete', { defaultValue: '取消完成' })
                : t('markComplete', { defaultValue: '标记完成' })
            }
            hitSlop={6}
            onPress={onToggleCompleted}
            style={({ pressed }) => ({ opacity: pressed ? 0.58 : 1 })}
          >
            <View width={42} height={42} items="center" justify="center">
              <CheckCircle2
                size={25}
                strokeWidth={item.completed ? 2.7 : 2.15}
                color={item.completed ? theme.primary.val : theme.color10.val}
              />
            </View>
          </Pressable>
        </XStack>
      </XStack>
    </YStack>
  );
}

export default memo(PlanMapPointCard);
