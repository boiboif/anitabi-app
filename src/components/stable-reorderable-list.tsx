/* eslint-disable react-hooks/immutability -- Reanimated SharedValues are mutable UI-thread state. */
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import {
  memo,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, type PanGestureConfig, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  scrollTo,
  type FrameInfo,
  type SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const DEFAULT_AUTOSCROLL_THRESHOLD = 72;
const DEFAULT_AUTOSCROLL_MAX_SPEED = 840;
const DEFAULT_MAX_FRAME_DURATION_MS = 34;

type PositionMap = Record<string, number>;

export type StableReorderableListRenderItem<T> = {
  item: T;
  dragHandle: ReactNode;
};

type StableReorderableListProps<T> = {
  data: T[];
  enabled: boolean;
  itemHeight: number;
  keyExtractor: (item: T) => string;
  renderItem: (params: StableReorderableListRenderItem<T>) => ReactElement;
  renderDragHandle: () => ReactElement;
  renderDragPreview: (item: T) => ReactElement;
  onReorder: (orderedKeys: string[]) => void;
  dragPreviewHeight: number;
  dragPreviewHorizontalInset?: number;
  indicatorColor?: string;
  indicatorInsetStart?: number;
  contentPaddingHorizontal?: number;
  contentPaddingBottom?: number;
  drawDistance?: number;
  maxItemsInRecyclePool?: number;
  autoscrollThreshold?: number;
  autoscrollMaxSpeed?: number;
  maxFrameDurationMs?: number;
  style?: StyleProp<ViewStyle>;
};

type PositionedRowProps<T> = {
  item: T;
  itemKey: string;
  itemCount: number;
  enabled: boolean;
  itemHeight: number;
  positions: SharedValue<PositionMap>;
  order: SharedValue<string[]>;
  activeKey: SharedValue<string | null>;
  dragSessionKey: SharedValue<string | null>;
  dragStartIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  previewTop: SharedValue<number>;
  dragStartPreviewTop: SharedValue<number>;
  scrollOffset: SharedValue<number>;
  autoscrollSpeed: SharedValue<number>;
  viewportTop: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  renderItem: (params: StableReorderableListRenderItem<T>) => ReactElement;
  renderDragHandle: () => ReactElement;
  onReorder: (orderedKeys: string[]) => void;
  dragPreviewHeight: number;
  autoscrollThreshold: number;
  autoscrollMaxSpeed: number;
  onDraggingChange: (itemKey: string | null) => void;
  onPreviewChange: (itemKey: string | null) => void;
};

function clamp(value: number, minimum: number, maximum: number): number {
  'worklet';
  return Math.min(Math.max(value, minimum), maximum);
}

function smoothstep(value: number): number {
  'worklet';
  return value * value * (3 - 2 * value);
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

function positionsFromOrder(keys: string[]): PositionMap {
  'worklet';
  const next: PositionMap = {};
  keys.forEach((key, index) => {
    next[key] = index;
  });
  return next;
}

function moveKey(keys: string[], from: number, to: number): string[] {
  'worklet';
  if (from === to) return keys;
  const next = [...keys];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function updateTargetIndex(
  itemHeight: number,
  itemCount: number,
  dragPreviewHeight: number,
  previewTop: SharedValue<number>,
  scrollOffset: SharedValue<number>,
  targetIndex: SharedValue<number>,
) {
  'worklet';
  const previewCenter = previewTop.value + scrollOffset.value + dragPreviewHeight / 2;
  targetIndex.value = clamp(Math.floor(previewCenter / itemHeight), 0, itemCount - 1);
}

function PositionedRowInner<T>({
  item,
  itemKey,
  itemCount,
  enabled,
  itemHeight,
  positions,
  order,
  activeKey,
  dragSessionKey,
  dragStartIndex,
  targetIndex,
  previewTop,
  dragStartPreviewTop,
  scrollOffset,
  autoscrollSpeed,
  viewportTop,
  viewportHeight,
  renderItem,
  renderDragHandle,
  onReorder,
  dragPreviewHeight,
  autoscrollThreshold,
  autoscrollMaxSpeed,
  onDraggingChange,
  onPreviewChange,
}: PositionedRowProps<T>) {
  // FlashList can recycle this component for another item while its gesture is
  // still active. Keep the key captured at touch-down independent from props.
  const gestureItemKey = useSharedValue<string | null>(null);
  const gestureWasActive = useSharedValue(false);

  const animatedStyle = useAnimatedStyle(() => {
    const isActive = activeKey.value === itemKey;
    return {
      opacity: isActive ? 0.55 : 1,
    };
  }, [itemKey]);

  const panConfig = useMemo<PanGestureConfig>(
    () => ({
      enabled,
      activateAfterLongPress: 180,
      onBegin: () => {
        'worklet';
        gestureItemKey.value = itemKey;
        gestureWasActive.value = false;
        if (dragSessionKey.value === null) {
          dragSessionKey.value = itemKey;
          scheduleOnRN(onPreviewChange, itemKey);
        }
      },
      onActivate: () => {
        'worklet';
        const sessionKey = gestureItemKey.value;
        if (!sessionKey || dragSessionKey.value !== sessionKey) return;
        const index = positions.value[sessionKey];
        if (index === undefined) return;
        gestureWasActive.value = true;
        activeKey.value = sessionKey;
        dragStartIndex.value = index;
        targetIndex.value = index;
        dragStartPreviewTop.value = clamp(
          index * itemHeight - scrollOffset.value + (itemHeight - dragPreviewHeight) / 2,
          0,
          Math.max(0, viewportHeight.value - dragPreviewHeight),
        );
        previewTop.value = dragStartPreviewTop.value;
        scheduleOnRN(onDraggingChange, sessionKey);
      },
      onUpdate: (event) => {
        'worklet';
        const sessionKey = gestureItemKey.value;
        if (!sessionKey || activeKey.value !== sessionKey) return;
        previewTop.value = clamp(
          dragStartPreviewTop.value + event.translationY,
          0,
          Math.max(0, viewportHeight.value - dragPreviewHeight),
        );
        updateTargetIndex(
          itemHeight,
          itemCount,
          dragPreviewHeight,
          previewTop,
          scrollOffset,
          targetIndex,
        );

        const pointerY = event.absoluteY - viewportTop.value;
        if (pointerY < autoscrollThreshold) {
          const intensity = 1 - clamp(pointerY / autoscrollThreshold, 0, 1);
          autoscrollSpeed.value = -autoscrollMaxSpeed * smoothstep(intensity);
        } else if (pointerY > viewportHeight.value - autoscrollThreshold) {
          const distanceToBottom = viewportHeight.value - pointerY;
          const intensity = 1 - clamp(distanceToBottom / autoscrollThreshold, 0, 1);
          autoscrollSpeed.value = autoscrollMaxSpeed * smoothstep(intensity);
        } else {
          autoscrollSpeed.value = 0;
        }
      },
      onDeactivate: (event) => {
        'worklet';
        const sessionKey = gestureItemKey.value;
        if (!sessionKey || activeKey.value !== sessionKey) return;
        const finalIndex = targetIndex.value;
        if (!event.canceled && finalIndex !== dragStartIndex.value) {
          const nextOrder = moveKey(order.value, dragStartIndex.value, finalIndex);
          order.value = nextOrder;
          positions.value = positionsFromOrder(nextOrder);
          scheduleOnRN(onReorder, [...nextOrder]);
        }

        // Stop on the UI thread as soon as the finger is released. Waiting for
        // JS state or onFinalize leaves FlashList recycling races open.
        autoscrollSpeed.value = 0;
        activeKey.value = null;
        dragSessionKey.value = null;
        gestureItemKey.value = null;
        gestureWasActive.value = false;
        scheduleOnRN(onDraggingChange, null);
        scheduleOnRN(onPreviewChange, null);
      },
      onFinalize: () => {
        'worklet';
        const sessionKey = gestureItemKey.value;
        const ownsPendingSession = Boolean(sessionKey && dragSessionKey.value === sessionKey);
        if (gestureWasActive.value || ownsPendingSession) {
          autoscrollSpeed.value = 0;
          activeKey.value = null;
          dragSessionKey.value = null;
          scheduleOnRN(onDraggingChange, null);
          scheduleOnRN(onPreviewChange, null);
        }
        gestureItemKey.value = null;
        gestureWasActive.value = false;
      },
    }),
    [
      activeKey,
      autoscrollMaxSpeed,
      autoscrollSpeed,
      autoscrollThreshold,
      dragSessionKey,
      dragPreviewHeight,
      dragStartIndex,
      dragStartPreviewTop,
      enabled,
      itemCount,
      itemHeight,
      itemKey,
      gestureItemKey,
      gestureWasActive,
      onDraggingChange,
      onPreviewChange,
      onReorder,
      order,
      positions,
      previewTop,
      scrollOffset,
      targetIndex,
      viewportHeight,
      viewportTop,
    ],
  );

  const gesture = usePanGesture(panConfig);

  const dragHandle = enabled ? (
    <GestureDetector gesture={gesture}>
      <Animated.View collapsable={false} style={styles.dragHandle}>
        {renderDragHandle()}
      </Animated.View>
    </GestureDetector>
  ) : null;

  return (
    <Animated.View style={[styles.row, { height: itemHeight }, animatedStyle]}>
      {renderItem({ item, dragHandle })}
    </Animated.View>
  );
}

const PositionedRow = memo(PositionedRowInner) as typeof PositionedRowInner;

export default function StableReorderableList<T>({
  data,
  enabled,
  itemHeight,
  keyExtractor,
  renderItem,
  renderDragHandle,
  renderDragPreview,
  onReorder,
  dragPreviewHeight,
  dragPreviewHorizontalInset = 48,
  indicatorColor = '#ffffff',
  indicatorInsetStart = 44,
  contentPaddingHorizontal = 0,
  contentPaddingBottom = 0,
  drawDistance,
  maxItemsInRecyclePool = 24,
  autoscrollThreshold = DEFAULT_AUTOSCROLL_THRESHOLD,
  autoscrollMaxSpeed = DEFAULT_AUTOSCROLL_MAX_SPEED,
  maxFrameDurationMs = DEFAULT_MAX_FRAME_DURATION_MS,
  style,
}: StableReorderableListProps<T>) {
  const keys = useMemo(() => data.map(keyExtractor), [data, keyExtractor]);
  const itemByKey = useMemo(() => new Map(data.map((item) => [keyExtractor(item), item])), [data, keyExtractor]);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const viewportRef = useRef<View>(null);
  const scrollRef = useAnimatedRef<ScrollView>();
  const positions = useSharedValue<PositionMap>(positionsFromOrder(keys));
  const order = useSharedValue<string[]>(keys);
  const activeKey = useSharedValue<string | null>(null);
  const dragSessionKey = useSharedValue<string | null>(null);
  const dragStartIndex = useSharedValue(0);
  const targetIndex = useSharedValue(0);
  const previewTop = useSharedValue(0);
  const dragStartPreviewTop = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const autoscrollSpeed = useSharedValue(0);
  const viewportTop = useSharedValue(0);
  const viewportHeight = useSharedValue(0);

  useLayoutEffect(() => {
    order.value = keys;
    positions.value = positionsFromOrder(keys);
    activeKey.value = null;
    dragSessionKey.value = null;
    autoscrollSpeed.value = 0;
  }, [activeKey, autoscrollSpeed, dragSessionKey, keys, order, positions]);

  const handleAutoscrollFrame = useCallback(
    ({ timeSincePreviousFrame }: FrameInfo) => {
      'worklet';
      if (!activeKey.value || autoscrollSpeed.value === 0) return;
      const elapsedSeconds = Math.min(timeSincePreviousFrame ?? 16.67, maxFrameDurationMs) / 1000;
      const maximumOffset = Math.max(0, data.length * itemHeight + contentPaddingBottom - viewportHeight.value);
      const nextOffset = clamp(scrollOffset.value + autoscrollSpeed.value * elapsedSeconds, 0, maximumOffset);
      const delta = nextOffset - scrollOffset.value;
      if (delta === 0) return;
      scrollOffset.value = nextOffset;
      updateTargetIndex(itemHeight, data.length, dragPreviewHeight, previewTop, scrollOffset, targetIndex);
      scrollTo(scrollRef, 0, nextOffset, false);
    },
    [
      activeKey,
      autoscrollSpeed,
      contentPaddingBottom,
      data.length,
      dragPreviewHeight,
      itemHeight,
      maxFrameDurationMs,
      previewTop,
      scrollOffset,
      scrollRef,
      targetIndex,
      viewportHeight,
    ],
  );

  const autoscrollFrame = useFrameCallback(handleAutoscrollFrame, false);

  const indicatorStyle = useAnimatedStyle(() => {
    const from = dragStartIndex.value;
    const to = targetIndex.value;
    const insertionIndex = to <= from ? to : to + 1;
    return {
      opacity: activeKey.value && from !== to ? 1 : 0,
      transform: [{ translateY: insertionIndex * itemHeight - scrollOffset.value - 1 }],
    };
  }, [itemHeight]);

  const previewStyle = useAnimatedStyle(() => ({
    opacity: activeKey.value ? 1 : 0,
    transform: [{ translateY: previewTop.value }],
  }));

  const measureViewport = useCallback(() => {
    viewportRef.current?.measureInWindow((_x, y, _width, height) => {
      viewportTop.value = y;
      viewportHeight.value = height;
    });
  }, [viewportHeight, viewportTop]);

  const handleLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      measureViewport();
    },
    [measureViewport],
  );

  const handleDraggingChange = useCallback(
    (nextKey: string | null) => {
      autoscrollFrame.setActive(nextKey !== null);
      setDraggingKey(nextKey);
      if (nextKey) measureViewport();
    },
    [autoscrollFrame, measureViewport],
  );

  const handlePreviewChange = useCallback((nextKey: string | null) => {
    setPreviewKey(nextKey);
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (autoscrollFrame.isActive) return;
      scrollOffset.value = event.nativeEvent.contentOffset.y;
    },
    [autoscrollFrame, scrollOffset],
  );

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => {
      const flashListScrollRef = (props as ScrollViewProps & { ref?: Ref<ScrollView> }).ref;
      return (
        <Animated.ScrollView
          {...props}
          ref={(node: ScrollView | null) => {
            scrollRef(node);
            assignRef(flashListScrollRef, node);
          }}
        />
      );
    },
    [scrollRef],
  );

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<T>) => {
      const itemKey = keyExtractor(item);
      return (
        <PositionedRow
          item={item}
          itemKey={itemKey}
          itemCount={data.length}
          enabled={enabled}
          itemHeight={itemHeight}
          positions={positions}
          order={order}
          activeKey={activeKey}
          dragSessionKey={dragSessionKey}
          dragStartIndex={dragStartIndex}
          targetIndex={targetIndex}
          previewTop={previewTop}
          dragStartPreviewTop={dragStartPreviewTop}
          scrollOffset={scrollOffset}
          autoscrollSpeed={autoscrollSpeed}
          viewportTop={viewportTop}
          viewportHeight={viewportHeight}
          renderItem={renderItem}
          renderDragHandle={renderDragHandle}
          onReorder={onReorder}
          dragPreviewHeight={dragPreviewHeight}
          autoscrollThreshold={autoscrollThreshold}
          autoscrollMaxSpeed={autoscrollMaxSpeed}
          onDraggingChange={handleDraggingChange}
          onPreviewChange={handlePreviewChange}
        />
      );
    },
    [
      activeKey,
      autoscrollMaxSpeed,
      autoscrollSpeed,
      autoscrollThreshold,
      data.length,
      dragPreviewHeight,
      dragSessionKey,
      dragStartIndex,
      dragStartPreviewTop,
      enabled,
      handleDraggingChange,
      handlePreviewChange,
      itemHeight,
      keyExtractor,
      onReorder,
      order,
      positions,
      previewTop,
      renderDragHandle,
      renderItem,
      scrollOffset,
      targetIndex,
      viewportHeight,
      viewportTop,
    ],
  );

  return (
    <View ref={viewportRef} style={[styles.viewport, style]} onLayout={handleLayout}>
      <FlashList
        data={data}
        renderItem={renderRow}
        keyExtractor={keyExtractor}
        renderScrollComponent={renderScrollComponent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        scrollEnabled={!draggingKey}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        drawDistance={drawDistance ?? itemHeight * 8}
        maxItemsInRecyclePool={maxItemsInRecyclePool}
        maintainVisibleContentPosition={{ disabled: true }}
        style={styles.list}
        contentContainerStyle={{
          paddingHorizontal: contentPaddingHorizontal,
          paddingBottom: contentPaddingBottom,
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            backgroundColor: indicatorColor,
            left: contentPaddingHorizontal + indicatorInsetStart,
            right: contentPaddingHorizontal,
          },
          indicatorStyle,
        ]}
      />
      {previewKey && itemByKey.has(previewKey) ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dragPreview,
            {
              height: dragPreviewHeight,
              left: dragPreviewHorizontalInset,
              right: dragPreviewHorizontalInset,
            },
            previewStyle,
          ]}
        >
          {renderDragPreview(itemByKey.get(previewKey)!)}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  list: {
    flex: 1,
  },
  row: {
    width: '100%',
  },
  dragHandle: {
    alignSelf: 'stretch',
  },
  dragPreview: {
    elevation: 16,
    position: 'absolute',
    top: 0,
    zIndex: 2000,
  },
  indicator: {
    height: 2,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1500,
  },
});
