import type { PlanMapResolvedPoint } from '@/components/plan-map-point-types';
import PointListCard from '@/components/point-list-card';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import { LegendList, type LegendListRef } from '@legendapp/list/react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Check, ListTodo } from '@tamagui/lucide-icons-2';
import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text, useTheme, useThemeName, View, XStack, YStack } from 'tamagui';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

type Props = {
  points: PlanMapResolvedPoint[];
  selectedKey?: string;
  onSelect: (resolved: PlanMapResolvedPoint) => void;
  onToggleCompleted: (resolved: PlanMapResolvedPoint) => void;
};

const PLAN_POINT_ROW_SIZE = 104;
const PINNED_POINT_ROWS = 8;
const SCROLL_IDLE_DELAY = 140;
const LOCATE_BUTTON_HIDE_DELAY = 2500;

function getPlanPointRowSize() {
  return PLAN_POINT_ROW_SIZE;
}

function ScrollToSelectedIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} strokeLinecap="round" strokeDasharray="11 3.14" />
      <Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

type SelectedPointStore = StoreApi<{ key?: string }>;

type PointRowProps = {
  resolved: PlanMapResolvedPoint;
  selectionStore: SelectedPointStore;
  onSelect: (resolved: PlanMapResolvedPoint) => void;
  onToggleCompleted: (resolved: PlanMapResolvedPoint) => void;
};

const PlanMapPointRow = memo(function PlanMapPointRow({
  resolved,
  selectionStore,
  onSelect,
  onToggleCompleted,
}: PointRowProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { point, bangumi, item, planIndex } = resolved;
  const selected = useStore(selectionStore, (state) => state.key === item.key);

  return (
    <View>
      <PointListCard
        point={point}
        bangumi={bangumi}
        title={getPointTitle(point, i18n.resolvedLanguage) || t('unnamedLocation', { defaultValue: '未命名点位' })}
        subtitle={getBangumiTitle(bangumi, i18n.resolvedLanguage) || t('unknownWork', { defaultValue: '未知作品' })}
        description={point.mark}
        showMediaLabels
        sequenceNumber={planIndex + 1}
        height={96}
        imageWidth={132}
        opacity={item.completed ? 0.58 : 1}
        selected={selected}
        onPress={() => onSelect(resolved)}
        accessibilityState={{ selected }}
        accessibilityLabel={t('showLocationOnMap', {
          defaultValue: '在地图中查看{{title}}',
          title: getPointTitle(point, i18n.resolvedLanguage),
        })}
        statusAction={
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={
              item.completed
                ? t('markIncomplete', { defaultValue: '取消完成' })
                : t('markComplete', { defaultValue: '标记完成' })
            }
            accessibilityState={{ checked: item.completed }}
            hitSlop={12}
            onPress={(event) => {
              event.stopPropagation();
              onToggleCompleted(resolved);
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <View width={30} height={30} items="center" justify="center">
              <Check
                size={20}
                strokeWidth={item.completed ? 3.5 : 3}
                color={item.completed ? theme.primary.val : theme.color8.val}
              />
            </View>
          </Pressable>
        }
      />
    </View>
  );
});

const PlanMapPointListSheet = forwardRef<TrueSheet, Props>(function PlanMapPointListSheet(
  { points, selectedKey, onSelect, onToggleCompleted },
  ref,
) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = useThemeName() === 'dark';
  const [selectionStore] = useState(() => createStore<{ key?: string }>()(() => ({ key: selectedKey })));
  const callbacksRef = useRef({ onSelect, onToggleCompleted });
  const listRef = useRef<LegendListRef>(null);
  const listReadyRef = useRef(false);
  const sheetPresentedRef = useRef(false);
  const pendingScrollRef = useRef(false);
  const pendingFilterScrollRef = useRef(false);
  const filterTransitionRef = useRef(false);
  const filterTransitionIdRef = useRef(0);
  const filterScrollFrameRef = useRef<number | null>(null);
  const lastScrollOffsetRef = useRef<number | null>(null);
  const programmaticScrollRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isScrollingRef = useRef(false);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideLocateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [showLocateButton, setShowLocateButton] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const completed = points.filter((resolved) => resolved.item.completed).length;
  const visiblePoints = useMemo(
    () => (showIncompleteOnly ? points.filter((resolved) => !resolved.item.completed) : points),
    [points, showIncompleteOnly],
  );
  useLayoutEffect(() => {
    callbacksRef.current = { onSelect, onToggleCompleted };
    selectionStore.setState({ key: selectedKey });
  }, [onSelect, onToggleCompleted, selectedKey, selectionStore]);
  const selectPoint = useCallback((resolved: PlanMapResolvedPoint) => callbacksRef.current.onSelect(resolved), []);
  const togglePointCompleted = useCallback(
    (resolved: PlanMapResolvedPoint) => callbacksRef.current.onToggleCompleted(resolved),
    [],
  );
  const pinnedPointKeys = useMemo(() => {
    const incomplete = points.filter((resolved) => !resolved.item.completed);
    const keys = new Set<string>();
    for (const list of [points, incomplete]) {
      const selectedPosition = list.findIndex((resolved) => resolved.item.key === selectedKey);
      const start = Math.max(0, selectedPosition - 1);
      for (const resolved of list.slice(start, start + PINNED_POINT_ROWS)) keys.add(resolved.item.key);
    }
    return { keys: [...keys] };
  }, [points, selectedKey]);
  const previousVisibleCountRef = useRef(visiblePoints.length);
  const selectedIndex = useMemo(
    () => visiblePoints.findIndex((resolved) => resolved.item.key === selectedKey),
    [selectedKey, visiblePoints],
  );
  const initialScrollIndex = useMemo(
    () => (selectedIndex >= 0 ? { index: selectedIndex, viewOffset: 4, viewPosition: 0 } : undefined),
    [selectedIndex],
  );

  const clearScrollIdleTimer = useCallback(() => {
    if (scrollIdleTimerRef.current) {
      clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = null;
    }
  }, []);

  const clearHideLocateTimer = useCallback(() => {
    if (hideLocateTimerRef.current) {
      clearTimeout(hideLocateTimerRef.current);
      hideLocateTimerRef.current = null;
    }
  }, []);

  const cancelFilterScrollFrame = useCallback(() => {
    if (filterScrollFrameRef.current !== null) {
      cancelAnimationFrame(filterScrollFrameRef.current);
      filterScrollFrameRef.current = null;
    }
  }, []);

  const finishScrolling = useCallback(() => {
    clearScrollIdleTimer();
    clearHideLocateTimer();
    scrollIdleTimerRef.current = setTimeout(() => {
      scrollIdleTimerRef.current = null;
      if (isDraggingRef.current) return;
      isScrollingRef.current = false;
      setIsScrolling(false);
    }, SCROLL_IDLE_DELAY);
    hideLocateTimerRef.current = setTimeout(() => {
      hideLocateTimerRef.current = null;
      if (!isDraggingRef.current && !isScrollingRef.current) setShowLocateButton(false);
    }, LOCATE_BUTTON_HIDE_DELAY);
  }, [clearHideLocateTimer, clearScrollIdleTimer]);

  const resetLocateButton = useCallback(() => {
    clearScrollIdleTimer();
    clearHideLocateTimer();
    lastScrollOffsetRef.current = null;
    programmaticScrollRef.current = false;
    isDraggingRef.current = false;
    isScrollingRef.current = false;
    setIsScrolling(false);
    setShowLocateButton(false);
  }, [clearHideLocateTimer, clearScrollIdleTimer]);

  useEffect(
    () => () => {
      clearScrollIdleTimer();
      clearHideLocateTimer();
      cancelFilterScrollFrame();
    },
    [cancelFilterScrollFrame, clearHideLocateTimer, clearScrollIdleTimer],
  );

  const handleScroll = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = nativeEvent.contentOffset.y;
      const previousOffset = lastScrollOffsetRef.current;
      lastScrollOffsetRef.current = offset;
      if (
        filterTransitionRef.current ||
        programmaticScrollRef.current ||
        !sheetPresentedRef.current ||
        previousOffset === null
      )
        return;
      if (Math.abs(offset - previousOffset) < 1) return;

      isScrollingRef.current = true;
      setIsScrolling(true);
      if (selectedIndex >= 0) setShowLocateButton(true);
      if (!isDraggingRef.current) finishScrolling();
    },
    [finishScrolling, selectedIndex],
  );

  const handleScrollBeginDrag = useCallback(() => {
    filterTransitionIdRef.current += 1;
    filterTransitionRef.current = false;
    pendingFilterScrollRef.current = false;
    cancelFilterScrollFrame();
    clearScrollIdleTimer();
    clearHideLocateTimer();
    programmaticScrollRef.current = false;
    isDraggingRef.current = true;
    isScrollingRef.current = true;
    setIsScrolling(true);
    if (selectedIndex >= 0) setShowLocateButton(true);
  }, [cancelFilterScrollFrame, clearHideLocateTimer, clearScrollIdleTimer, selectedIndex]);

  const handleScrollEndDrag = useCallback(() => {
    isDraggingRef.current = false;
    finishScrolling();
  }, [finishScrolling]);

  const handleMomentumScrollBegin = useCallback(() => {
    if (filterTransitionRef.current) return;
    clearScrollIdleTimer();
    clearHideLocateTimer();
    isScrollingRef.current = true;
    setIsScrolling(true);
  }, [clearHideLocateTimer, clearScrollIdleTimer]);

  const handleLocateSelected = useCallback(() => {
    if (isScrollingRef.current || selectedIndex < 0) return;
    resetLocateButton();
    programmaticScrollRef.current = true;
    void listRef.current?.scrollIndexIntoView({ index: selectedIndex, animated: true }).then(
      () => {
        programmaticScrollRef.current = false;
        lastScrollOffsetRef.current = null;
      },
      () => {
        programmaticScrollRef.current = false;
      },
    );
  }, [resetLocateButton, selectedIndex]);

  const scrollToSelected = useCallback(() => {
    if (!listReadyRef.current || selectedIndex < 0) {
      pendingScrollRef.current = false;
      programmaticScrollRef.current = false;
      return;
    }
    pendingScrollRef.current = false;
    programmaticScrollRef.current = true;
    void listRef.current?.scrollIndexIntoView({ index: selectedIndex, animated: false }).then(
      () => {
        programmaticScrollRef.current = false;
        lastScrollOffsetRef.current = null;
      },
      () => {
        programmaticScrollRef.current = false;
      },
    );
  }, [selectedIndex]);

  const scrollToFilteredSelection = useCallback(() => {
    if (!pendingFilterScrollRef.current || !sheetPresentedRef.current || !listReadyRef.current) return;
    const transitionId = filterTransitionIdRef.current;
    pendingFilterScrollRef.current = false;
    pendingScrollRef.current = false;
    if (visiblePoints.length === 0) {
      filterTransitionRef.current = false;
      programmaticScrollRef.current = false;
      return;
    }

    programmaticScrollRef.current = true;
    const scroll =
      selectedIndex >= 0
        ? listRef.current?.scrollIndexIntoView({ index: selectedIndex, animated: false })
        : listRef.current?.scrollToOffset({ offset: 0, animated: false });
    if (!scroll) {
      filterTransitionRef.current = false;
      programmaticScrollRef.current = false;
      return;
    }
    void scroll.then(
      () => {
        if (transitionId !== filterTransitionIdRef.current) return;
        filterTransitionRef.current = false;
        programmaticScrollRef.current = false;
        lastScrollOffsetRef.current = null;
      },
      () => {
        if (transitionId !== filterTransitionIdRef.current) return;
        filterTransitionRef.current = false;
        programmaticScrollRef.current = false;
      },
    );
  }, [selectedIndex, visiblePoints.length]);

  const scheduleFilteredScroll = useCallback(() => {
    cancelFilterScrollFrame();
    filterScrollFrameRef.current = requestAnimationFrame(() => {
      filterScrollFrameRef.current = null;
      scrollToFilteredSelection();
    });
  }, [cancelFilterScrollFrame, scrollToFilteredSelection]);

  useLayoutEffect(() => {
    const wasEmpty = previousVisibleCountRef.current === 0;
    previousVisibleCountRef.current = visiblePoints.length;
    if (pendingFilterScrollRef.current && (!wasEmpty || visiblePoints.length === 0)) scheduleFilteredScroll();
  }, [scheduleFilteredScroll, showIncompleteOnly, visiblePoints.length]);

  const handleListReady = useCallback(() => {
    listReadyRef.current = true;
    if (pendingFilterScrollRef.current) scheduleFilteredScroll();
    else if (sheetPresentedRef.current && pendingScrollRef.current) scrollToSelected();
  }, [scheduleFilteredScroll, scrollToSelected]);

  const toggleIncompleteFilter = useCallback(() => {
    cancelFilterScrollFrame();
    clearScrollIdleTimer();
    clearHideLocateTimer();
    filterTransitionIdRef.current += 1;
    filterTransitionRef.current = true;
    lastScrollOffsetRef.current = null;
    isScrollingRef.current = false;
    setIsScrolling(false);
    setShowLocateButton(false);
    pendingFilterScrollRef.current = true;
    setShowIncompleteOnly((current) => !current);
  }, [cancelFilterScrollFrame, clearHideLocateTimer, clearScrollIdleTimer]);

  const renderPoint = useCallback(
    ({ item: resolved }: { item: PlanMapResolvedPoint }) => (
      <PlanMapPointRow
        resolved={resolved}
        selectionStore={selectionStore}
        onSelect={selectPoint}
        onToggleCompleted={togglePointCompleted}
      />
    ),
    [selectPoint, selectionStore, togglePointCompleted],
  );

  return (
    <TrueSheet
      ref={ref}
      detents={[0.6, 0.9]}
      scrollable
      scrollableOptions={{ scrollingExpandsSheet: false }}
      cornerRadius={22}
      backgroundColor={theme.color2.val}
      grabberOptions={{ color: theme.primary.val, adaptive: false, topMargin: 8, width: 42, height: 5 }}
      onDidPresent={() => {
        sheetPresentedRef.current = true;
        resetLocateButton();
        if (listReadyRef.current) {
          scrollToSelected();
        } else {
          pendingScrollRef.current = true;
        }
      }}
      onDidDismiss={() => {
        sheetPresentedRef.current = false;
        pendingScrollRef.current = false;
        pendingFilterScrollRef.current = false;
        filterTransitionIdRef.current += 1;
        filterTransitionRef.current = false;
        cancelFilterScrollFrame();
        resetLocateButton();
      }}
      header={
        <YStack bg="$color2" px="$4" pt="$5" pb="$2" gap="$0.5">
          <XStack items="center" justify="space-between">
            <Text fontSize="$subtitle" fontWeight="700" color="$color12">
              {t('planLocations', { defaultValue: '计划点位' })}
            </Text>
            <XStack items="center" gap="$1">
              <Text fontSize="$footnote" color="$color10" style={{ fontVariant: ['tabular-nums'] }}>
                {completed} / {points.length}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showIncompleteOnly
                    ? t('showAllLocations', { defaultValue: '显示全部点位' })
                    : t('showIncompleteLocationsOnly', { defaultValue: '仅显示未完成点位' })
                }
                accessibilityState={{ selected: showIncompleteOnly }}
                hitSlop={8}
                onPress={toggleIncompleteFilter}
                style={({ pressed }) => ({ opacity: pressed ? 0.58 : 1 })}
              >
                <View width={36} height={32} items="center" justify="center">
                  {showIncompleteOnly ? (
                    <ListTodo size={20} strokeWidth={2.2} color="$primary" />
                  ) : (
                    <ListTodo size={20} strokeWidth={2.2} color="$color10" />
                  )}
                </View>
              </Pressable>
            </XStack>
          </XStack>
          <Text fontSize="$caption" color="$color10">
            {t('tapALocationToShowItOnTheMap', { defaultValue: '点击点位即可在地图中定位' })}
          </Text>
        </YStack>
      }
      footer={
        <View height={60} pr={40} pb={80} items="flex-end" justify="center" pointerEvents="box-none">
          {showLocateButton && selectedIndex >= 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('scrollToSelectedLocation', { defaultValue: '定位到选中点位' })}
              accessibilityState={{ disabled: isScrolling }}
              disabled={isScrolling}
              hitSlop={12}
              onPress={handleLocateSelected}
              style={({ pressed }) => ({ opacity: isScrolling ? 0.4 : pressed ? 0.6 : 0.8 })}
            >
              <View
                width={30}
                height={30}
                rounded={18}
                bg={isDark ? '$color5' : '$color2'}
                borderWidth={1}
                borderColor={isDark ? '$color8' : '$color5'}
                boxShadow={isDark ? '0 3px 12px rgba(0,0,0,0.55)' : '0 2px 8px $shadowColor'}
                items="center"
                justify="center"
              >
                <ScrollToSelectedIcon color={theme.color12.val} />
              </View>
            </Pressable>
          )}
        </View>
      }
    >
      <LegendList
        ref={listRef}
        data={visiblePoints}
        recycleItems
        alwaysRender={pinnedPointKeys}
        keyExtractor={(resolved) => resolved.item.key}
        renderItem={renderPoint}
        getFixedItemSize={getPlanPointRowSize}
        initialScrollIndex={initialScrollIndex}
        onReady={handleListReady}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={finishScrolling}
        scrollEventThrottle={16}
        ListEmptyComponent={
          <YStack minH={180} items="center" justify="center" px="$4">
            <Text color="$color11">
              {showIncompleteOnly
                ? t('noIncompleteLocations', { defaultValue: '没有未完成点位' })
                : t('noLocationsInThisPlanYet', { defaultValue: '计划里还没有点位' })}
            </Text>
          </YStack>
        }
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 28 }}
      />
    </TrueSheet>
  );
});

export default PlanMapPointListSheet;
