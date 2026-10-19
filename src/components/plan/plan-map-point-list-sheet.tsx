import type { PlanMapResolvedPoint } from '@/components/plan/plan-map-point-types';
import PointListCard from '@/components/point/point-list-card';
import CardListItem from '@/components/ui/card-list-item';
import { getCardListItemHeight } from '@/lib/card-list-layout';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Check, ListTodo } from '@tamagui/lucide-icons-2';
import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, type ScrollViewInstance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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

const PLAN_POINT_CARD_HEIGHT = 96;
const PLAN_POINT_ROW_SIZE = getCardListItemHeight(PLAN_POINT_CARD_HEIGHT);
const SCROLL_IDLE_DELAY = 140;
const LOCATE_BUTTON_HIDE_DELAY = 2500;

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
    <CardListItem>
      <PointListCard
        point={point}
        bangumi={bangumi}
        title={getPointTitle(point, i18n.resolvedLanguage) || t('unnamedLocation', { defaultValue: '未命名点位' })}
        subtitle={getBangumiTitle(bangumi, i18n.resolvedLanguage) || t('unknownWork', { defaultValue: '未知作品' })}
        description={point.mark}
        showMediaLabels
        sequenceNumber={planIndex + 1}
        height={PLAN_POINT_CARD_HEIGHT}
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
    </CardListItem>
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
  const listRef = useRef<FlashListRef<PlanMapResolvedPoint>>(null);
  const listReadyRef = useRef(false);
  const contentReadyRef = useRef(false);
  const openingPositionReadyRef = useRef(false);
  const sheetPresentedRef = useRef(false);
  const pendingScrollRef = useRef(false);
  const pendingFilterScrollRef = useRef(false);
  const filterTransitionRef = useRef(false);
  const filterTransitionIdRef = useRef(0);
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
  const selectedIndex = useMemo(
    () => visiblePoints.findIndex((resolved) => resolved.item.key === selectedKey),
    [selectedKey, visiblePoints],
  );
  const scrollToSelectedNative = useCallback(
    (animated: boolean) => {
      const scrollView = listRef.current?.getNativeScrollRef() as ScrollViewInstance | undefined;
      if (!scrollView || selectedIndex < 0) return false;
      const precedingIndex = Math.max(0, selectedIndex - 1);
      const measuredOffset = listRef.current?.getLayout(precedingIndex)?.y;
      // TrueSheet adds native scroll padding at the 0.6 detent. The list's
      // JS scroll limit does not include it, so let Android clamp this offset.
      // Use FlashList's layout coordinates, which account for native row
      // measurements, rather than accumulating the estimated row height.
      scrollView.scrollTo({ y: Math.max(0, measuredOffset ?? precedingIndex * PLAN_POINT_ROW_SIZE), animated });
      return true;
    },
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
    },
    [clearHideLocateTimer, clearScrollIdleTimer],
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
    clearScrollIdleTimer();
    clearHideLocateTimer();
    programmaticScrollRef.current = false;
    isDraggingRef.current = true;
    isScrollingRef.current = true;
    setIsScrolling(true);
    if (selectedIndex >= 0) setShowLocateButton(true);
  }, [clearHideLocateTimer, clearScrollIdleTimer, selectedIndex]);

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

  const handleMomentumScrollEnd = useCallback(() => {
    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false;
      lastScrollOffsetRef.current = null;
    }
    finishScrolling();
  }, [finishScrolling]);

  const handleLocateSelected = useCallback(() => {
    if (isScrollingRef.current || selectedIndex < 0) return;
    resetLocateButton();
    programmaticScrollRef.current = true;
    if (!scrollToSelectedNative(true)) programmaticScrollRef.current = false;
  }, [resetLocateButton, scrollToSelectedNative, selectedIndex]);

  const scrollToSelected = useCallback(() => {
    if (selectedIndex < 0) {
      pendingScrollRef.current = false;
      programmaticScrollRef.current = false;
      return;
    }
    if (scrollToSelectedNative(false)) {
      pendingScrollRef.current = false;
      programmaticScrollRef.current = true;
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
        lastScrollOffsetRef.current = null;
      });
    }
  }, [scrollToSelectedNative, selectedIndex]);

  const scrollDuringPresentation = useCallback(() => {
    if (
      pendingScrollRef.current &&
      openingPositionReadyRef.current &&
      (contentReadyRef.current || listReadyRef.current)
    ) {
      scrollToSelected();
    }
  }, [scrollToSelected]);

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

    const scrollView = listRef.current?.getNativeScrollRef() as ScrollViewInstance | undefined;
    if (!scrollView) {
      filterTransitionRef.current = false;
      programmaticScrollRef.current = false;
      return;
    }
    programmaticScrollRef.current = true;
    if (selectedIndex >= 0) scrollToSelectedNative(false);
    else scrollView.scrollTo({ y: 0, animated: false });
    requestAnimationFrame(() => {
      if (transitionId !== filterTransitionIdRef.current) return;
      filterTransitionRef.current = false;
      programmaticScrollRef.current = false;
      lastScrollOffsetRef.current = null;
    });
  }, [scrollToSelectedNative, selectedIndex, visiblePoints.length]);

  const handleListReady = useCallback(() => {
    listReadyRef.current = true;
    // The layout-commit callback positions filtered rows immediately. The
    // first-load callback shares the same readiness and opening fallback.
    if (pendingFilterScrollRef.current) scrollToFilteredSelection();
    else if (sheetPresentedRef.current && pendingScrollRef.current) scrollToSelected();
    else scrollDuringPresentation();
  }, [scrollDuringPresentation, scrollToFilteredSelection, scrollToSelected]);

  const toggleIncompleteFilter = useCallback(() => {
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
  }, [clearHideLocateTimer, clearScrollIdleTimer]);

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
      onWillPresent={() => {
        pendingScrollRef.current = true;
        openingPositionReadyRef.current = false;
      }}
      onPositionChange={() => {
        openingPositionReadyRef.current = true;
        scrollDuringPresentation();
      }}
      onDidPresent={() => {
        sheetPresentedRef.current = true;
        resetLocateButton();
        if (pendingScrollRef.current && (contentReadyRef.current || listReadyRef.current)) scrollToSelected();
      }}
      onDidDismiss={() => {
        sheetPresentedRef.current = false;
        listReadyRef.current = false;
        contentReadyRef.current = false;
        openingPositionReadyRef.current = false;
        pendingScrollRef.current = false;
        pendingFilterScrollRef.current = false;
        filterTransitionIdRef.current += 1;
        filterTransitionRef.current = false;
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
      <GestureHandlerRootView style={{ flexGrow: 1 }}>
        <FlashList
          ref={listRef}
          data={visiblePoints}
          keyExtractor={(resolved) => resolved.item.key}
          renderItem={renderPoint}
          maintainVisibleContentPosition={{ disabled: true }}
          onContentSizeChange={(_, height) => {
            if (height <= 0) return;
            contentReadyRef.current = true;
            if (!openingPositionReadyRef.current && !sheetPresentedRef.current) scrollToSelectedNative(false);
            if (sheetPresentedRef.current && pendingScrollRef.current) scrollToSelected();
            else scrollDuringPresentation();
          }}
          onLoad={handleListReady}
          onCommitLayoutEffect={handleListReady}
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollBegin={handleMomentumScrollBegin}
          onMomentumScrollEnd={handleMomentumScrollEnd}
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
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: 28,
          }}
        />
      </GestureHandlerRootView>
    </TrueSheet>
  );
});

export default PlanMapPointListSheet;
