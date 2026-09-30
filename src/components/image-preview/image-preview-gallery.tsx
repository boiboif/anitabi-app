import {
  getPreviewDoubleTapTarget,
  getPreviewPageTarget,
  PREVIEW_BASE_SCALE_EPSILON,
  PREVIEW_MAX_SCALE,
} from '@/utils/image-preview-gestures';
import { type ReactNode, type Ref, useImperativeHandle, useRef, useState } from 'react';
import { GestureDetector, useExclusiveGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { type CommonZoomState, ResumableZoom, type ResumableZoomRefType } from 'react-native-zoom-toolkit';
import { YStack } from 'tamagui';

type PullEvent = { translateY: number; released: boolean; velocityY: number };
export type PreviewGalleryRef = { getState: () => CommonZoomState<number> | undefined };
type GalleryProps<T> = {
  ref?: Ref<PreviewGalleryRef>;
  data: T[];
  initialIndex: number;
  viewport: { width: number; height: number };
  isClosing: SharedValue<boolean>;
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onTap: () => void;
  onLongPress: (index: number) => void;
  onIndexChange: (index: number) => void;
  onUpdate: (state: CommonZoomState<number>) => void;
  onVerticalPull: (event: PullEvent) => boolean | void;
};

type PageProps = {
  children: ReactNode;
  pageIndex: number;
  activeIndex: SharedValue<number>;
  width: number;
  height: number;
  offsetX: SharedValue<number>;
  offsetY: SharedValue<number>;
  axis: SharedValue<'x' | 'y' | null>;
  settling: SharedValue<boolean>;
  isClosing: SharedValue<boolean>;
  count: number;
  onRef: (instance: ResumableZoomRefType | null) => void;
  onTap: () => void;
  onLongPress: () => void;
  onUpdate: (state: CommonZoomState<number>) => void;
  onVerticalPull: (event: PullEvent) => boolean | void;
  onPageSettled: (index: number) => void;
};

function PreviewGalleryPage({
  children,
  pageIndex,
  activeIndex,
  width,
  height,
  offsetX,
  offsetY,
  axis,
  settling,
  isClosing,
  count,
  onRef,
  onTap,
  onLongPress,
  onUpdate,
  onVerticalPull,
  onPageSettled,
}: PageProps) {
  const zoomRef = useRef<ResumableZoomRefType | null>(null);
  const scale = useSharedValue(1);
  const pinching = useSharedValue(false);
  const stride = width + 24;
  const pageStyle = useAnimatedStyle(() => {
    const active = activeIndex.get() === pageIndex;
    const closing = isClosing.get();
    return {
      position: 'absolute',
      width,
      height,
      opacity: closing && !active ? 0 : 1,
      transform: [
        { translateX: closing ? 0 : (pageIndex - activeIndex.get()) * stride + offsetX.get() },
        { translateY: !closing && active ? offsetY.get() : 0 },
      ],
    };
  });

  const handleDoubleTap = (x: number, y: number) => {
    if (settling.get() || isClosing.get() || activeIndex.get() !== pageIndex) return;
    const zoom = zoomRef.current;
    if (!zoom) return;
    const target = getPreviewDoubleTapTarget(zoom.getState(), x, y);
    if (target.scale === 1) zoom.reset(true);
    else zoom.setTransformState(target, true);
  };
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    maxDuration: 250,
    runOnJS: true,
    onDeactivate: (event) => {
      if (!event.canceled) handleDoubleTap(event.x, event.y);
    },
  });
  const singleTap = useTapGesture({
    maxDuration: 250,
    runOnJS: true,
    onDeactivate: (event) => {
      if (!event.canceled && !settling.get() && !isClosing.get() && activeIndex.get() === pageIndex) onTap();
    },
  });
  const taps = useExclusiveGestures(doubleTap, singleTap);

  const finishPan = (velocityX: number, velocityY: number) => {
    scheduleOnUI(() => {
      'worklet';
      if (isClosing.get() || settling.get() || pinching.get() || activeIndex.get() !== pageIndex) return;
      const direction = axis.get();
      axis.set(null);
      if (direction === 'y') {
        const dismiss = onVerticalPull({ translateY: offsetY.get(), released: true, velocityY });
        if (!dismiss) offsetY.set(withTiming(0, { duration: 240 }));
      } else if (direction === 'x') {
        const next = getPreviewPageTarget(pageIndex, count, offsetX.get(), velocityX, width);
        settling.set(true);
        offsetX.set(
          withTiming((pageIndex - next) * stride, { duration: 240 }, (finished) => {
            if (!finished) return;
            // The next page is already mounted; move the origin on the same UI frame.
            activeIndex.set(next);
            offsetX.set(0);
            scheduleOnRN(onPageSettled, next);
          }),
        );
      }
    });
  };

  return (
    <Animated.View style={pageStyle}>
      <GestureDetector gesture={taps}>
        <YStack flex={1} overflow="hidden" collapsable={false}>
          <ResumableZoom
            ref={(instance) => {
              zoomRef.current = instance;
              onRef(instance);
            }}
            extendGestures
            tapsEnabled={false}
            maxScale={PREVIEW_MAX_SCALE}
            panMode="clamp"
            onLongPress={() => {
              if (!settling.get() && !isClosing.get() && activeIndex.get() === pageIndex) onLongPress();
            }}
            onUpdate={(state) => {
              'worklet';
              scale.set(state.scale);
              if (activeIndex.get() === pageIndex) onUpdate(state);
            }}
            onPinchStart={() => {
              if (settling.get() || isClosing.get() || activeIndex.get() !== pageIndex) return;
              pinching.set(true);
              axis.set(null);
              offsetX.set(withTiming(0, { duration: 120 }));
              offsetY.set(withTiming(0, { duration: 120 }));
            }}
            onPinchEnd={() => {
              pinching.set(false);
            }}
            onOverPanning={(x, y) => {
              'worklet';
              if (settling.get() || isClosing.get() || pinching.get() || activeIndex.get() !== pageIndex) return;
              if (axis.get() === null) {
                if (Math.max(Math.abs(x), Math.abs(y)) < 8) return;
                if (Math.abs(x) > Math.abs(y)) axis.set('x');
                else if (scale.get() <= 1 + PREVIEW_BASE_SCALE_EPSILON) axis.set('y');
                else return;
              }
              if (axis.get() === 'x') {
                const atEdge = (pageIndex === 0 && x > 0) || (pageIndex === count - 1 && x < 0);
                offsetX.set(atEdge ? x * 0.25 : Math.max(-stride, Math.min(stride, x)));
              } else {
                offsetY.set(y);
              }
            }}
            onPanEnd={(event) => finishPan(event.velocityX, event.velocityY)}
          >
            {children}
          </ResumableZoom>
        </YStack>
      </GestureDetector>
    </Animated.View>
  );
}

/** ResumableZoom supplies pinch/pan; the app owns taps, paging and dismissal. */
export default function PreviewGallery<T>({
  ref,
  data,
  initialIndex,
  viewport,
  isClosing,
  keyExtractor,
  renderItem,
  onTap,
  onLongPress,
  onIndexChange,
  onUpdate,
  onVerticalPull,
}: GalleryProps<T>) {
  const [index, setIndex] = useState(initialIndex);
  const refs = useRef<Record<number, ResumableZoomRefType | null>>({});
  const activeIndex = useSharedValue(initialIndex);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const axis = useSharedValue<'x' | 'y' | null>(null);
  const settling = useSharedValue(false);

  useImperativeHandle(ref, () => ({
    getState: () => {
      const state = refs.current[activeIndex.get()]?.getState();
      return state
        ? { ...state, translateX: state.translateX + offsetX.get(), translateY: state.translateY + offsetY.get() }
        : undefined;
    },
  }));
  useAnimatedReaction(
    () => offsetY.get(),
    (translateY) => {
      onVerticalPull({ translateY, released: false, velocityY: 0 });
    },
  );

  const onPageSettled = (nextIndex: number) => {
    if (isClosing.get()) return;
    if (nextIndex !== index) {
      refs.current[index]?.reset(false);
      const state = refs.current[nextIndex]?.getState();
      if (state)
        scheduleOnUI(() => {
          'worklet';
          onUpdate(state);
        });
      setIndex(nextIndex);
      onIndexChange(nextIndex);
    }
    settling.set(false);
  };

  return (
    <YStack flex={1} overflow="hidden">
      {data.map((item, pageIndex) =>
        Math.abs(pageIndex - index) <= 1 ? (
          <PreviewGalleryPage
            key={keyExtractor(item)}
            pageIndex={pageIndex}
            activeIndex={activeIndex}
            width={viewport.width}
            height={viewport.height}
            count={data.length}
            offsetX={offsetX}
            offsetY={offsetY}
            axis={axis}
            settling={settling}
            isClosing={isClosing}
            onRef={(instance) => {
              refs.current[pageIndex] = instance;
            }}
            onTap={onTap}
            onLongPress={() => onLongPress(pageIndex)}
            onUpdate={onUpdate}
            onVerticalPull={onVerticalPull}
            onPageSettled={onPageSettled}
          >
            {renderItem(item, pageIndex)}
          </PreviewGalleryPage>
        ) : null,
      )}
    </YStack>
  );
}
