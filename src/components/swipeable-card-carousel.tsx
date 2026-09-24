/* eslint-disable react-hooks/immutability -- Reanimated SharedValues are mutable UI-thread state. */
import {
  type ReactNode,
  type Ref,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { GestureDetector, type PanGestureConfig, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

type Direction = 'previous' | 'next';
type PagePositions = Record<string, number>;

export type SwipeableCardCarouselHandle = {
  previous: () => void;
  next: () => void;
};

type Props = {
  currentKey: string;
  current: ReactNode;
  previousKey?: string;
  previous?: ReactNode;
  nextKey?: string;
  next?: ReactNode;
  onPrevious: () => void;
  onNext: () => void;
  estimatedHeight?: number;
  ref?: Ref<SwipeableCardCarouselHandle>;
};

type PageProps = {
  pageKey: string;
  role: 'previous' | 'current' | 'next';
  duplicateNeighbour: boolean;
  width: number;
  content: ReactNode;
  positions: SharedValue<PagePositions>;
  activeDirection: SharedValue<Direction>;
  awaitingCommit: SharedValue<boolean>;
  onHeight: (key: string, height: number) => void;
};

const SWIPE_DISTANCE_RATIO = 0.25;
const SWIPE_VELOCITY = 650;
const SWIPE_MIN_FAST_DISTANCE = 18;
const MAX_MEASURED_PAGES = 12;

const CarouselPage = memo(function CarouselPage({
  pageKey,
  role,
  duplicateNeighbour,
  width,
  content,
  positions,
  activeDirection,
  awaitingCommit,
  onHeight,
}: PageProps) {
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => onHeight(pageKey, Math.ceil(event.nativeEvent.layout.height)),
    [onHeight, pageKey],
  );
  const animatedStyle = useAnimatedStyle(() => {
    const rolePosition = role === 'previous' ? -width : role === 'next' ? width : 0;
    // With two items the same neighbour is shown on whichever side is being swiped.
    const base =
      duplicateNeighbour && role !== 'current' && !awaitingCommit.value
        ? activeDirection.value === 'previous'
          ? -width
          : width
        : (positions.value[pageKey] ?? rolePosition);
    return { transform: [{ translateX: base }] };
  }, [duplicateNeighbour, pageKey, role, width]);

  return (
    <Animated.View
      onLayout={onLayout}
      pointerEvents={role === 'current' ? 'auto' : 'none'}
      importantForAccessibility={role === 'current' ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={role !== 'current'}
      style={[{ position: 'absolute', top: 0, left: 0, width }, animatedStyle]}
    >
      {content}
    </Animated.View>
  );
});

/** Keeps adjacent page instances mounted while rotating them, so loaded images remain visible. */
export default function SwipeableCardCarousel({
  currentKey,
  current,
  previousKey,
  previous,
  nextKey,
  next,
  onPrevious,
  onNext,
  estimatedHeight = 0,
  ref,
}: Props) {
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState(() => new Map<string, number>());
  const drag = useSharedValue(0);
  const positions = useSharedValue<PagePositions>({});
  const activeDirection = useSharedValue<Direction>('next');
  const awaitingCommit = useSharedValue(false);
  const transitioning = useSharedValue(false);
  const lastKey = useRef(currentKey);
  const expectedKey = useRef<string | null>(null);
  const hasPrevious = previous != null && previousKey != null;
  const hasNext = next != null && nextKey != null;
  const duplicateNeighbour = hasPrevious && hasNext && previousKey === nextKey;
  // Only the strip moves while dragging; page offsets change at the transition boundary.
  const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: drag.value }] }));

  const commit = useCallback(
    (direction: Direction) => {
      expectedKey.current = direction === 'previous' ? previousKey! : nextKey!;
      if (direction === 'previous') onPrevious();
      else onNext();
    },
    [nextKey, onNext, onPrevious, previousKey],
  );

  const transition = useCallback(
    (direction: Direction) => {
      'worklet';
      if (transitioning.value || width <= 0) return;
      if (direction === 'previous' ? !hasPrevious : !hasNext) return;
      activeDirection.value = direction;
      awaitingCommit.value = false;
      transitioning.value = true;
      drag.value = withTiming(direction === 'previous' ? width : -width, { duration: 220 }, (finished) => {
        if (!finished) {
          transitioning.value = false;
          return;
        }

        // Rebase positions and drag together on the UI thread before React changes
        // selection. The entering page stays at x=0 with the same native Image view.
        positions.value =
          direction === 'previous'
            ? { [previousKey!]: 0, [currentKey]: width }
            : { [nextKey!]: 0, [currentKey]: -width };
        drag.value = 0;
        awaitingCommit.value = true;
        scheduleOnRN(commit, direction);
      });
    },
    [
      activeDirection,
      awaitingCommit,
      commit,
      currentKey,
      drag,
      hasNext,
      hasPrevious,
      nextKey,
      positions,
      previousKey,
      transitioning,
      width,
    ],
  );

  useImperativeHandle(
    ref,
    () => ({
      previous: () => scheduleOnUI(transition, 'previous'),
      next: () => scheduleOnUI(transition, 'next'),
    }),
    [transition],
  );

  useLayoutEffect(() => {
    if (lastKey.current === currentKey) return;
    if (expectedKey.current !== currentKey) {
      // A map marker or list selection did not pass through this carousel.
      cancelAnimation(drag);
      positions.value = {};
      drag.value = 0;
    }
    awaitingCommit.value = false;
    transitioning.value = false;
    lastKey.current = currentKey;
    expectedKey.current = null;
  }, [awaitingCommit, currentKey, drag, positions, transitioning]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth <= 0) return;
    setWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
  }, []);
  const onPageHeight = useCallback((key: string, height: number) => {
    setHeights((currentHeights) => {
      if (currentHeights.get(key) === height) return currentHeights;
      // Keep nearby measurements without copying every point ever visited.
      const nextHeights = new Map(currentHeights);
      nextHeights.delete(key);
      nextHeights.set(key, height);
      if (nextHeights.size > MAX_MEASURED_PAGES) nextHeights.delete(nextHeights.keys().next().value!);
      return nextHeights;
    });
  }, []);

  const panConfig = useMemo<PanGestureConfig>(
    () => ({
      enabled: hasPrevious || hasNext,
      activeOffsetX: [-12, 12],
      failOffsetY: [-10, 10],
      onUpdate: (event) => {
        'worklet';
        if (transitioning.value) return;
        const translation = event.translationX;
        const direction = translation > 0 ? 'previous' : 'next';
        if (activeDirection.value !== direction) activeDirection.value = direction;
        drag.value =
          translation > 0 && !hasPrevious
            ? 0
            : translation < 0 && !hasNext
              ? 0
              : Math.max(-width, Math.min(width, translation));
      },
      onDeactivate: (event) => {
        'worklet';
        if (transitioning.value) return;
        const translation = event.translationX;
        const distanceReached = Math.abs(translation) >= width * SWIPE_DISTANCE_RATIO;
        const fastSwipe =
          Math.abs(translation) >= SWIPE_MIN_FAST_DISTANCE && Math.abs(event.velocityX) >= SWIPE_VELOCITY;
        if (!event.canceled && (distanceReached || fastSwipe)) {
          const direction = translation > 0 ? 'previous' : 'next';
          if (direction === 'previous' ? hasPrevious : hasNext) {
            transition(direction);
            return;
          }
        }
        const distance = Math.abs(drag.value);
        if (distance === 0 || width <= 0) return;
        drag.value = withTiming(0, {
          duration: Math.min(280, 200 + (distance / width) * 240),
          easing: Easing.inOut(Easing.quad),
        });
      },
    }),
    [activeDirection, drag, hasNext, hasPrevious, transition, transitioning, width],
  );
  const gesture = usePanGesture(panConfig);
  const viewportHeight = Math.max(
    estimatedHeight,
    heights.get(currentKey) ?? 0,
    previousKey ? (heights.get(previousKey) ?? 0) : 0,
    nextKey ? (heights.get(nextKey) ?? 0) : 0,
  );
  const pages = [
    ...(hasPrevious && !duplicateNeighbour
      ? [{ key: previousKey!, role: 'previous' as const, content: previous, duplicateNeighbour: false }]
      : []),
    { key: currentKey, role: 'current' as const, content: current, duplicateNeighbour: false },
    ...(hasNext || (hasPrevious && duplicateNeighbour)
      ? [{ key: (nextKey ?? previousKey)!, role: 'next' as const, content: next ?? previous, duplicateNeighbour }]
      : []),
  ].sort((a, b) => a.key.localeCompare(b.key));

  return (
    <GestureDetector gesture={gesture}>
      <View onLayout={onLayout} style={{ height: width > 0 ? viewportHeight : undefined, overflow: 'hidden' }}>
        {width > 0 ? (
          <Animated.View style={[{ width, height: viewportHeight }, stripStyle]}>
            {pages.map((page) => (
              <CarouselPage
                key={page.key}
                pageKey={page.key}
                role={page.role}
                duplicateNeighbour={page.duplicateNeighbour}
                width={width}
                content={page.content}
                positions={positions}
                activeDirection={activeDirection}
                awaitingCommit={awaitingCommit}
                onHeight={onPageHeight}
              />
            ))}
          </Animated.View>
        ) : (
          current
        )}
      </View>
    </GestureDetector>
  );
}
