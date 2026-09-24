import ComparisonCameraButton from '@/components/comparison-camera-button';
import GoogleMapsNavigationButton from '@/components/google-maps-navigation-button';
import PlanMapPointCardPage from '@/components/plan-map-point-card-page';
import type { PlanMapResolvedPoint } from '@/components/plan-map-point-types';
import SwipeableCardCarousel, { type SwipeableCardCarouselHandle } from '@/components/swipeable-card-carousel';
import { CheckCircle2, ChevronLeft, ChevronRight, Flag } from '@tamagui/lucide-icons-2';
import { memo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, type LayoutChangeEvent } from 'react-native';
import { useTheme, useThemeName, View, XStack, YStack } from 'tamagui';

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
