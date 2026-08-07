import FavoritePointButton from '@/components/favorite-point-button';
import { formatDuration } from '@/lib/formatDuration';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { useMapBrowse } from '@/store/use-map-browse';
import { useMapData } from '@/store/use-map-data';
import { type DetentChangeEvent, TrueSheet } from '@lodev09/react-native-true-sheet';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useIsFocused } from 'expo-router';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, Platform } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { getTokens, Text, useTheme, View } from 'tamagui';

const CARD_HEIGHT = 100;
const SECTION_HEADER_HEIGHT = 32;
const BANGUMI_DETAIL_SHEET_DETENTS = [0.25, 0.8];
const DEFAULT_BANGUMI_DETAIL_DETENT_INDEX = BANGUMI_DETAIL_SHEET_DETENTS.length - 1;

const PointCard = memo(
  function PointCard({ point, bangumi, onPress }: { point: Point; bangumi: Bangumi; onPress?: () => void }) {
    const theme = useTheme();
    const pointTitle = point.cn || point.name || '未命名点位';
    const epLabel =
      typeof point.ep === 'number' && point.ep > 0
        ? `EP${point.ep}`
        : typeof point.ep === 'string' && point.ep
          ? point.ep
          : undefined;
    const timeLabel = typeof point.s === 'number' && point.s >= 0 ? formatDuration(point.s) : undefined;

    return (
      <View
        bg="$color2"
        mb="$2"
        mx="$2"
        display="flex"
        flexDirection="row"
        rounded="$4"
        height={CARD_HEIGHT}
        overflow="hidden"
        boxShadow="0 1px 4px $shadowColor"
      >
        <Pressable onPress={onPress} style={{ flex: 1, flexDirection: 'row' }}>
          <View
            width={150}
            height={CARD_HEIGHT}
            style={{ borderRadius: getTokens().radius['4'].val, overflow: 'hidden' }}
          >
            <Image
              key={point.image}
              source={point.image ? buildImageUrl(point.image, 'plan=h160') : undefined}
              style={{ width: 150, height: CARD_HEIGHT, backgroundColor: theme.color9.val }}
              contentFit="cover"
            />
            {epLabel && (
              <View
                position="absolute"
                l={0}
                b={0}
                bg="rgba(0,0,0,0.55)"
                px="$1.5"
                py="$0.5"
                style={{ borderTopRightRadius: getTokens().radius['2'].val }}
              >
                <Text fontSize={11} fontWeight="700" color="white">
                  {epLabel}
                </Text>
              </View>
            )}
            {timeLabel && (
              <View
                position="absolute"
                r={0}
                b={0}
                bg="rgba(0,0,0,0.55)"
                px="$1.5"
                py="$0.5"
                style={{ borderTopLeftRadius: getTokens().radius['2'].val }}
              >
                <Text fontSize={11} color="white">
                  {timeLabel}
                </Text>
              </View>
            )}
          </View>
          <View flex={1} p="$2" style={{ justifyContent: 'space-between' }}>
            <View>
              <Text fontWeight="600" fontSize={14} color="$color12" numberOfLines={1} pr="$8">
                {pointTitle}
              </Text>
              <Text fontSize={11} color="$primary" mt="$1" numberOfLines={1}>
                {bangumi.cn || bangumi.title || bangumi.en || '未知'}
              </Text>
              {point.mark ? (
                <Text fontSize={11} lineHeight={11} color="$color11" mt="$0.5" numberOfLines={3}>
                  {point.mark}
                </Text>
              ) : null}
            </View>
            {point.folder && (
              <Text position="absolute" r="$2" b="$1.5" fontSize={11} color="$color10" style={{ textAlign: 'right' }}>
                {point.folder}
              </Text>
            )}
          </View>
        </Pressable>
        <FavoritePointButton point={point} bangumi={bangumi} overlay />
      </View>
    );
  },
  (prev, next) => prev.point.id === next.point.id && prev.bangumi.id === next.bangumi.id,
);

type AccordionMode = 'ep' | 'folder';

interface AccordionSection {
  key: string;
  title: string;
  data: Point[];
}

const ITEM_TYPE_HEADER = 'sectionHeader';
const ITEM_TYPE_POINT = 'point';

interface FlatSectionHeader {
  type: typeof ITEM_TYPE_HEADER;
  id: string;
  title: string;
  count: number;
}

interface FlatPointItem {
  type: typeof ITEM_TYPE_POINT;
  id: string;
  point: Point;
}

type FlatItem = FlatSectionHeader | FlatPointItem;

interface PendingModeScroll {
  offset: number;
  ready: boolean;
}

function SheetContent({ children }: { children: ReactNode }) {
  if (Platform.OS === 'android') {
    return <GestureHandlerRootView style={{ flexGrow: 1 }}>{children}</GestureHandlerRootView>;
  }

  return children;
}

function AccordionControls({
  accordionMode,
  hidden = false,
  onCollapseAll,
  onExpandAll,
  onLayout,
  onSelectMode,
}: {
  accordionMode: AccordionMode;
  hidden?: boolean;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onSelectMode: (mode: AccordionMode) => void;
}) {
  return (
    <View
      bg="$color1"
      opacity={hidden ? 0 : 1}
      flexDirection="row"
      items="center"
      px="$2"
      pb="$2"
      gap="$2"
      onLayout={onLayout}
    >
      <View flexDirection="row" gap="$1" flex={1}>
        <Pressable onPress={() => onSelectMode('ep')}>
          <View
            bg={accordionMode === 'ep' ? '$color3' : 'transparent'}
            p="$2"
            px="$3.5"
            rounded={accordionMode === 'ep' ? '$9' : undefined}
          >
            <Text
              fontWeight={accordionMode === 'ep' ? '600' : '400'}
              color={accordionMode === 'ep' ? '$primary' : '$color11'}
              fontSize={14}
            >
              话数
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={() => onSelectMode('folder')}>
          <View
            bg={accordionMode === 'folder' ? '$color3' : 'transparent'}
            p="$2"
            px="$3.5"
            rounded={accordionMode === 'folder' ? '$9' : undefined}
          >
            <Text
              fontWeight={accordionMode === 'folder' ? '600' : '400'}
              color={accordionMode === 'folder' ? '$primary' : '$color11'}
              fontSize={14}
            >
              分组
            </Text>
          </View>
        </Pressable>
      </View>
      <View flexDirection="row" gap="$2">
        <Pressable
          onPress={onCollapseAll}
          style={({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text fontSize={13} color="$primary">
            折叠全部
          </Text>
        </Pressable>
        <Pressable
          onPress={onExpandAll}
          style={({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text fontSize={13} color="$primary">
            展开全部
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function groupPoints(points: Point[], mode: AccordionMode, bangumi: Bangumi): AccordionSection[] {
  if (mode === 'ep') {
    const numericEpMap = new Map<number, Point[]>();
    const namedEpMap = new Map<string, Point[]>();
    const pointsWithoutEp: Point[] = [];
    for (const p of points) {
      if (typeof p.ep === 'number') {
        if (!numericEpMap.has(p.ep)) numericEpMap.set(p.ep, []);
        numericEpMap.get(p.ep)!.push(p);
      } else if (p.ep !== undefined) {
        if (!namedEpMap.has(p.ep)) namedEpMap.set(p.ep, []);
        namedEpMap.get(p.ep)!.push(p);
      } else {
        pointsWithoutEp.push(p);
      }
    }
    const sections: AccordionSection[] = [];
    const numericKeys = Array.from(numericEpMap.keys()).sort((a, b) => a - b);
    for (const k of numericKeys) {
      sections.push({ key: `${bangumi.id}-ep-${k}`, title: `EP${k}`, data: numericEpMap.get(k)! });
    }
    for (const [name, data] of namedEpMap) {
      sections.push({ key: `${bangumi.id}-ep-name-${name}`, title: name, data });
    }
    if (pointsWithoutEp.length > 0) {
      sections.push({ key: `${bangumi.id}-ep-other`, title: '其他', data: pointsWithoutEp });
    }
    return sections;
  }

  const pilgrimageGroups = new Map<string, { title: string; data: Point[] }>();
  for (const p of points) {
    if (p.isFolder) {
      pilgrimageGroups.set(p.id, { title: p.name || p.folder || '未命名合辑', data: [p] });
    }
  }

  const folderMap = new Map<string, Point[]>();
  const bangumiPoints: Point[] = [];

  for (const p of points) {
    if (p.isFolder) continue;

    if (p.fid && pilgrimageGroups.has(p.fid)) {
      pilgrimageGroups.get(p.fid)!.data.push(p);
    } else if (p.folder) {
      if (!folderMap.has(p.folder)) folderMap.set(p.folder, []);
      folderMap.get(p.folder)!.push(p);
    } else {
      bangumiPoints.push(p);
    }
  }

  const sections: AccordionSection[] = [];
  if (bangumiPoints.length > 0) {
    sections.push({
      key: 'folder-bangumi',
      title: bangumi.cn || bangumi.title || bangumi.en || '番剧',
      data: bangumiPoints,
    });
  }
  const pilgrimageGroupKeys = Array.from(pilgrimageGroups.keys()).sort((a, b) =>
    pilgrimageGroups.get(a)!.title.localeCompare(pilgrimageGroups.get(b)!.title),
  );
  for (const k of pilgrimageGroupKeys) {
    const group = pilgrimageGroups.get(k)!;
    sections.push({ key: `pilgrimage-${k}`, title: group.title, data: group.data });
  }
  const folderKeys = Array.from(folderMap.keys()).sort();
  for (const k of folderKeys) {
    sections.push({ key: `folder-${k}`, title: k, data: folderMap.get(k)! });
  }
  return sections;
}

function useBangumiDetailSheet(bangumiId: number | undefined, onDetailsDismiss: () => void) {
  const sheetRef = useRef<TrueSheet>(null);
  const flashListRef = useRef<FlashListRef<FlatItem>>(null);
  const isSheetOpenRef = useRef(false);
  const isSheetPresentedRef = useRef(false);
  const preserveDetailsAfterDismissRef = useRef(false);
  const activeBangumiIdRef = useRef<number | null>(null);
  const loadedBangumiIdRef = useRef<number | null>(null);
  const currentDetentIndexRef = useRef(DEFAULT_BANGUMI_DETAIL_DETENT_INDEX);
  const currentScrollOffsetRef = useRef(0);
  const pendingScrollRestoreOffsetRef = useRef<number | null>(null);
  const isRouteFocused = useIsFocused();

  const resetSavedSheetPosition = useCallback(() => {
    currentDetentIndexRef.current = DEFAULT_BANGUMI_DETAIL_DETENT_INDEX;
    currentScrollOffsetRef.current = 0;
    pendingScrollRestoreOffsetRef.current = null;
  }, []);

  const dismissSheet = useCallback((preserveDetails = false) => {
    if (!isSheetOpenRef.current) return;

    isSheetOpenRef.current = false;
    isSheetPresentedRef.current = false;
    preserveDetailsAfterDismissRef.current = preserveDetails;
    pendingScrollRestoreOffsetRef.current = preserveDetails ? currentScrollOffsetRef.current : null;
    void sheetRef.current?.dismiss();
  }, []);

  useEffect(() => {
    if (!isRouteFocused) {
      // 路由失焦仅关闭原生 sheet；store 中的地图上下文继续保留。
      dismissSheet(true);
      return;
    }

    if (bangumiId === undefined) {
      dismissSheet();
      return;
    }

    if (activeBangumiIdRef.current !== bangumiId) {
      activeBangumiIdRef.current = bangumiId;
      resetSavedSheetPosition();
    }

    if (isSheetOpenRef.current) {
      void sheetRef.current?.resize(currentDetentIndexRef.current);
    } else {
      isSheetOpenRef.current = true;
      isSheetPresentedRef.current = false;
      void sheetRef.current?.present(currentDetentIndexRef.current).catch(() => {
        isSheetOpenRef.current = false;
      });
    }
  }, [bangumiId, dismissSheet, isRouteFocused, resetSavedSheetPosition]);

  const handleSheetDismiss = useCallback(() => {
    isSheetOpenRef.current = false;
    isSheetPresentedRef.current = false;
    if (preserveDetailsAfterDismissRef.current) {
      preserveDetailsAfterDismissRef.current = false;
      return;
    }

    activeBangumiIdRef.current = null;
    resetSavedSheetPosition();
    onDetailsDismiss();
  }, [onDetailsDismiss, resetSavedSheetPosition]);

  const handleDetentChange = useCallback((event: DetentChangeEvent) => {
    const { index } = event.nativeEvent;
    if (Number.isInteger(index) && index >= 0 && index < BANGUMI_DETAIL_SHEET_DETENTS.length) {
      currentDetentIndexRef.current = index;
    }
  }, []);

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isSheetOpenRef.current) return;
    currentScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const restoreListScrollPosition = useCallback(() => {
    const offset = pendingScrollRestoreOffsetRef.current;
    if (offset === null || !isSheetPresentedRef.current || loadedBangumiIdRef.current !== activeBangumiIdRef.current) {
      return;
    }

    flashListRef.current?.scrollToOffset({ offset, animated: true });
    currentScrollOffsetRef.current = offset;
    pendingScrollRestoreOffsetRef.current = null;
  }, []);

  const handleListLoad = useCallback(() => {
    loadedBangumiIdRef.current = activeBangumiIdRef.current;
    restoreListScrollPosition();
  }, [restoreListScrollPosition]);

  const handleSheetPresent = useCallback(() => {
    isSheetOpenRef.current = true;
    isSheetPresentedRef.current = true;
    restoreListScrollPosition();
  }, [restoreListScrollPosition]);

  return {
    flashListRef,
    handleDetentChange,
    handleListLoad,
    handleListScroll,
    handleSheetDismiss,
    handleSheetPresent,
    sheetRef,
  };
}

function BangumiDetailSheet() {
  const bangumis = useMapData((state) => state.data)?.data.bangumis;
  const openedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const focusPointFromBangumiDetails = useMapBrowse((state) => state.focusPointFromBangumiDetails);
  const closeBangumiDetails = useMapBrowse((state) => state.closeBangumiDetails);
  const selectedBangumi = useMemo(
    () => bangumis?.find((bangumi) => bangumi.id === openedBangumiDetailsId),
    [bangumis, openedBangumiDetailsId],
  );
  const theme = useTheme();
  const {
    flashListRef,
    handleDetentChange,
    handleListLoad,
    handleListScroll,
    handleSheetDismiss,
    handleSheetPresent,
    sheetRef,
  } = useBangumiDetailSheet(selectedBangumi?.id, closeBangumiDetails);

  const [accordionMode, setAccordionMode] = useState<AccordionMode>('ep');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [controlsHeight, setControlsHeight] = useState(0);
  const [controlsOffset, setControlsOffset] = useState<number | null>(null);
  const [isControlsSticky, setIsControlsSticky] = useState(false);
  const [flashListViewportHeight, setFlashListViewportHeight] = useState(0);
  const allExpandedRef = useRef(true);
  const modeExpansionStateRef = useRef(true);
  const pendingModeScrollRef = useRef<PendingModeScroll | null>(null);
  const controlsOffsetRef = useRef(Number.POSITIVE_INFINITY);

  const sections = useMemo(() => {
    if (!selectedBangumi) return [];
    return groupPoints(selectedBangumi.points, accordionMode, selectedBangumi);
  }, [selectedBangumi, accordionMode]);

  const allExpanded = expandedKeys.size === sections.length && sections.length > 0;

  // 同步 ref
  useEffect(() => {
    allExpandedRef.current = allExpanded;
  }, [allExpanded]);

  // mode 切换时保持全部展开/折叠状态不变
  useEffect(() => {
    if (modeExpansionStateRef.current) {
      setExpandedKeys(new Set(sections.map((s) => s.key)));
    } else {
      setExpandedKeys(new Set());
    }
    if (pendingModeScrollRef.current) {
      pendingModeScrollRef.current.ready = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accordionMode]);

  // 番剧切换时重置为全部展开
  useEffect(() => {
    // A new selection must reset the user-controlled accordion state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedKeys(new Set(sections.map((s) => s.key)));
    setControlsHeight(0);
    setControlsOffset(null);
    setIsControlsSticky(false);
    controlsOffsetRef.current = Number.POSITIVE_INFINITY;
    allExpandedRef.current = true;
    modeExpansionStateRef.current = true;
    pendingModeScrollRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBangumi]);

  const setAllSectionsExpanded = useCallback(
    (expanded: boolean) => {
      allExpandedRef.current = expanded;
      setExpandedKeys(expanded ? new Set(sections.map((section) => section.key)) : new Set());
    },
    [sections],
  );

  const handleAccordionModeChange = useCallback(
    (mode: AccordionMode) => {
      if (mode === accordionMode) return;

      modeExpansionStateRef.current = allExpandedRef.current;
      const controlsOffset = controlsOffsetRef.current;
      if (Number.isFinite(controlsOffset)) {
        pendingModeScrollRef.current = { offset: controlsOffset, ready: false };
      }
      setAccordionMode(mode);
    },
    [accordionMode],
  );

  const toggleSection = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleControlsLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, y } = event.nativeEvent.layout;
    controlsOffsetRef.current = y;
    setControlsHeight((previousHeight) => (previousHeight === height ? previousHeight : height));
    setControlsOffset((previousOffset) => (previousOffset === y ? previousOffset : y));
  }, []);

  const handleFlashListViewportLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setFlashListViewportHeight((previousHeight) => (previousHeight === height ? previousHeight : height));
  }, []);

  const handleFlashListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleListScroll(event);
      const scrollOffset = event.nativeEvent.contentOffset.y;
      const shouldStick = scrollOffset >= controlsOffsetRef.current;
      setIsControlsSticky((wasSticky) => (wasSticky === shouldStick ? wasSticky : shouldStick));
    },
    [handleListScroll],
  );

  const handleFlashListLayoutCommit = useCallback(() => {
    const pendingScroll = pendingModeScrollRef.current;
    if (!pendingScroll?.ready) return;

    flashListRef.current?.scrollToOffset({ offset: pendingScroll.offset, animated: false });
    pendingModeScrollRef.current = null;
  }, [flashListRef]);

  const flatData: FlatItem[] = useMemo(() => {
    return sections.flatMap((section) => {
      const items: FlatItem[] = [
        {
          type: ITEM_TYPE_HEADER,
          id: `header-${section.key}`,
          title: section.title,
          count: section.data.length,
        },
      ];
      if (expandedKeys.has(section.key)) {
        items.push(
          ...section.data.map(
            (point): FlatPointItem => ({ type: ITEM_TYPE_POINT, id: `point-${point.id}-${point.name}`, point }),
          ),
        );
      }
      return items;
    });
  }, [sections, expandedKeys]);

  const stickyHeaderIndices = useMemo(
    () => flatData.map((item, index) => (item.type === ITEM_TYPE_HEADER ? index : -1)).filter((index) => index >= 0),
    [flatData],
  );

  const minimumContentHeight =
    flashListViewportHeight > 0 && controlsOffset !== null ? flashListViewportHeight + controlsOffset : undefined;

  const renderFlashItem = useCallback(
    ({ item }: { item: FlatItem }) => {
      if (item.type === ITEM_TYPE_HEADER) {
        const sectionKey = item.id.slice('header-'.length);
        return (
          <Pressable
            android_ripple={{ color: theme.color5.val }}
            style={{ height: SECTION_HEADER_HEIGHT, backgroundColor: theme.color1.val }}
            onPress={() => toggleSection(sectionKey)}
          >
            <View position="absolute" t={-1} l={0} r={0} height={2} bg="$color1" />
            <View flexDirection="row" style={{ alignItems: 'center' }} px="$2" py="$2">
              <Text fontWeight="600" fontSize={14} color="$color12" flex={1}>
                {item.title}
              </Text>
              <Text fontSize={11} color="$color10" mr="$1">
                {item.count}
              </Text>
              <Text fontSize={12} color="$color10">
                {expandedKeys.has(sectionKey) ? '▲' : '▼'}
              </Text>
            </View>
          </Pressable>
        );
      }
      return (
        <PointCard
          point={item.point}
          bangumi={selectedBangumi!}
          onPress={() => {
            focusPointFromBangumiDetails({ bangumiId: selectedBangumi!.id, pointId: item.point.id });
            void sheetRef.current?.resize(0);
          }}
        />
      );
    },
    [selectedBangumi, focusPointFromBangumiDetails, sheetRef, toggleSection, expandedKeys, theme],
  );

  return (
    <TrueSheet
      ref={sheetRef}
      detents={BANGUMI_DETAIL_SHEET_DETENTS}
      scrollable
      dimmed={false}
      backgroundColor={theme.color1.val}
      cornerRadius={getTokens().radius['4'].val}
      grabberOptions={{ color: theme.primary.val, adaptive: false, topMargin: 12 }}
      onDidPresent={handleSheetPresent}
      onDidDismiss={handleSheetDismiss}
      onDetentChange={handleDetentChange}
      style={{ paddingTop: 26 }}
    >
      <SheetContent>
        <View flex={1} onLayout={handleFlashListViewportLayout}>
          <View flex={1}>
            <FlashList
              ref={flashListRef}
              key={selectedBangumi?.id + accordionMode}
              data={flatData}
              renderItem={renderFlashItem}
              getItemType={(item) => item.type}
              keyExtractor={(item: FlatItem) => item.id}
              stickyHeaderIndices={stickyHeaderIndices}
              stickyHeaderConfig={{ offset: controlsHeight }}
              ListHeaderComponentStyle={{ marginBottom: -controlsHeight }}
              onCommitLayoutEffect={handleFlashListLayoutCommit}
              onLoad={handleListLoad}
              onScroll={handleFlashListScroll}
              ListHeaderComponent={
                <>
                  <View px="$2" mb="$4" display="flex" flexDirection="row" rounded="$4" gap="$2.5">
                    <Image
                      source={buildImageUrl(selectedBangumi?.cover ?? '')}
                      style={{
                        width: 180,
                        height: 140,
                        borderRadius: getTokens().radius['4'].val,
                        backgroundColor: selectedBangumi?.color || '$color9',
                      }}
                      contentFit="cover"
                    />
                    <View flex={1}>
                      {selectedBangumi?.cn ? (
                        <Text fontWeight="600" fontSize={16} color="$color12" pr="$8" numberOfLines={2}>
                          {selectedBangumi?.cn}
                        </Text>
                      ) : null}
                      <Text fontSize={12} color="$color11" mt="$1" mb="$1" numberOfLines={1}>
                        {selectedBangumi?.title}
                      </Text>
                      <View flexDirection="row">
                        {selectedBangumi?.city && (
                          <Text fontSize={12} color="$color11">
                            {selectedBangumi?.city} {'· '}
                          </Text>
                        )}
                        <Text fontSize={12} color="$color11">
                          <Text color="$primary" fontWeight="bold">
                            {selectedBangumi?.points.length}
                          </Text>
                          个巡礼点
                        </Text>
                      </View>
                      <Text fontSize={10} color="$color11" position="absolute" r="$0" b="$0">
                        最近更新：{dayjs(selectedBangumi?.modified).format('YYYY-MM-DD HH:mm')}
                      </Text>
                    </View>
                    {selectedBangumi?.cat?.trim() ? (
                      <View
                        position="absolute"
                        t="$2"
                        r="$2"
                        px="$2"
                        py="$1"
                        rounded="$2"
                        style={{ backgroundColor: selectedBangumi?.color || '$color9' }}
                      >
                        <Text fontSize={10} color="white" fontWeight="500">
                          {selectedBangumi?.cat}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <AccordionControls
                    accordionMode={accordionMode}
                    hidden={isControlsSticky}
                    onSelectMode={handleAccordionModeChange}
                    onCollapseAll={() => setAllSectionsExpanded(false)}
                    onExpandAll={() => setAllSectionsExpanded(true)}
                    onLayout={handleControlsLayout}
                  />
                </>
              }
              contentContainerStyle={{ paddingBottom: 12, minHeight: minimumContentHeight }}
            />
          </View>
          {isControlsSticky ? (
            <View position="absolute" t={0} l={0} r={0} style={{ zIndex: 3 }}>
              <AccordionControls
                accordionMode={accordionMode}
                onSelectMode={handleAccordionModeChange}
                onCollapseAll={() => setAllSectionsExpanded(false)}
                onExpandAll={() => setAllSectionsExpanded(true)}
              />
            </View>
          ) : null}
        </View>
      </SheetContent>
    </TrueSheet>
  );
}

export default BangumiDetailSheet;
