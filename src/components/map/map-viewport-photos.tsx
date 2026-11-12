import { AppTabBarInsetContext } from '@/components/app-tab-bar-inset';
import { MAP_CONTROL_SIZE } from '@/lib/constants';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi } from '@/services/types';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { useMapBrowse } from '@/store/use-map-browse';
import type { MapViewportState } from '@/utils/map-viewport';
import { findViewportImagePoints, type ViewportImagePoint } from '@/utils/map-viewport-points';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { use, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { LayoutRectangle } from 'react-native';
import { type GetThemeValueForKey, styled, View } from 'tamagui';

const PHOTO_WIDTH = 80;
const PHOTO_HEIGHT = 54;
const PHOTO_GAP = 6;
const EDGE_INSET = 12;
const Photo = styled(Image, { width: '100%', height: '100%' });

function pointKey({ bangumi, point }: ViewportImagePoint) {
  return JSON.stringify([bangumi.id, point.id]);
}

function PhotoTile({ item, onSelect }: { item: ViewportImagePoint; onSelect: (item: ViewportImagePoint) => void }) {
  const { i18n } = useTranslation();
  const { point, bangumi } = item;
  const selected = useMapBrowse(
    (state) => state.selectedMapPoint?.bangumiId === bangumi.id && state.selectedMapPoint.pointId === point.id,
  );

  return (
    <View
      width={PHOTO_WIDTH}
      height={PHOTO_HEIGHT}
      rounded="$3"
      overflow="hidden"
      bg="$color3"
      borderWidth={2}
      borderColor={(selected ? '$primary' : bangumi.color || '$color8') as GetThemeValueForKey<'borderColor'>}
      pressStyle={{ opacity: 0.7 }}
      onPress={() => onSelect(item)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${getPointTitle(point, i18n.resolvedLanguage) || point.id} · ${getBangumiTitle(bangumi, i18n.resolvedLanguage)}`}
      accessibilityState={{ selected }}
      testID={`viewport-photo-${bangumi.id}-${point.id}`}
    >
      <Photo
        source={point.image ? buildImageUrl(point.image, 'plan=h160') : undefined}
        recyclingKey={pointKey(item)}
        contentFit="cover"
        cachePolicy="memory-disk"
        accessible={false}
      />
    </View>
  );
}

function PhotoGap() {
  return <View width={PHOTO_GAP} />;
}

function PhotoEdge() {
  return <View width={EDGE_INSET} />;
}

type Props = {
  bangumis: Bangumi[];
  viewport: MapViewportState;
  onSelect: (item: ViewportImagePoint) => void;
  onLayoutChange?: (layout: LayoutRectangle | null) => void;
};

export default function MapViewportPhotos({ bangumis, viewport, onSelect, onLayoutChange }: Props) {
  const tabBarInset = use(AppTabBarInsetContext);
  const openedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const filteredBangumiId = useMapBrowse((state) => state.filteredBangumiId);
  const selectedBangumiIds = useMapBangumiFilter((state) => state.selectedBangumiIds);
  const listRef = useRef<FlashListRef<ViewportImagePoint>>(null);
  const handledViewportRef = useRef<{ keys: string; viewport: MapViewportState } | null>(null);
  const committedViewportRef = useRef<{ keys: string; viewport: MapViewportState } | null>(null);
  const isDraggingRef = useRef(false);
  const isMomentumScrollingRef = useRef(false);
  const contentWidthRef = useRef<number | null>(null);
  const items =
    openedBangumiDetailsId === null
      ? findViewportImagePoints(bangumis, viewport, filteredBangumiId, selectedBangumiIds)
      : [];
  const orderedKeys = JSON.stringify(items.map(pointKey));

  const keepSelectionVisible = () => {
    const list = listRef.current;
    const previous = handledViewportRef.current;
    const committed = committedViewportRef.current;
    if (!list || committed?.keys !== orderedKeys || committed.viewport !== viewport ||
      (previous?.keys === orderedKeys && previous.viewport === viewport)) return;
    // A user's drag or fling takes priority over repositioning the list.
    if (isDraggingRef.current || isMomentumScrollingRef.current) {
      handledViewportRef.current = { keys: orderedKeys, viewport };
      return;
    }
    const viewportWidth = list.getWindowSize().width;
    if (!(viewportWidth > 0)) return;

    const selected = useMapBrowse.getState().selectedMapPoint;
    const selectedIndex = selected
      ? items.findIndex(({ bangumi, point }) => bangumi.id === selected.bangumiId && point.id === selected.pointId)
      : -1;
    if (selectedIndex < 0) {
      // Preserve the existing closest-point reset when there is no selected item.
      handledViewportRef.current = { keys: orderedKeys, viewport };
      if (previous?.keys !== orderedKeys) list.scrollToOffset({ offset: 0, animated: false });
      return;
    }

    // Photo tiles and their separators have fixed dimensions, including the
    // leading header. This remains exact even for unmeasured recycled cells.
    const left = EDGE_INSET + selectedIndex * (PHOTO_WIDTH + PHOTO_GAP);
    const right = left + PHOTO_WIDTH;
    const maxOffset = Math.max(0, EDGE_INSET * 2 + items.length * PHOTO_WIDTH +
      Math.max(0, items.length - 1) * PHOTO_GAP - viewportWidth);
    const offset = Math.max(0, Math.min(maxOffset, list.getAbsoluteLastScrollOffset()));
    const target = left < offset ? left : right > offset + viewportWidth ? right - viewportWidth : offset;
    const nextOffset = Math.max(0, Math.min(maxOffset, target));
    if (nextOffset !== offset) {
      // FlashList can commit cells before its native scroll view reports the
      // expanded content width. Avoid having native clamp a still-valid target.
      if (contentWidthRef.current === null || nextOffset > Math.max(0, contentWidthRef.current - viewportWidth)) return;
      handledViewportRef.current = { keys: orderedKeys, viewport };
      list.scrollToOffset({ offset: nextOffset, animated: false });
    } else {
      handledViewportRef.current = { keys: orderedKeys, viewport };
    }
  };

  useLayoutEffect(() => {
    // Native callbacks from a prior render must not scroll a newer viewport.
    const committed = { keys: orderedKeys, viewport };
    committedViewportRef.current = committed;
    keepSelectionVisible();
    return () => {
      if (committedViewportRef.current === committed) committedViewportRef.current = null;
    };
  });

  useEffect(() => {
    if (tabBarInset === null || items.length === 0) {
      handledViewportRef.current = null;
      contentWidthRef.current = null;
      onLayoutChange?.(null);
    }
  }, [items.length, onLayoutChange, tabBarInset]);

  if (tabBarInset === null || items.length === 0) return null;

  return (
    <View
      position="absolute"
      l={0}
      r={MAP_CONTROL_SIZE + 24}
      b={tabBarInset + 12}
      height={PHOTO_HEIGHT}
      z={10}
      pointerEvents="box-none"
      testID="map-viewport-photos"
      onLayout={({ nativeEvent: { layout } }) => onLayoutChange?.(layout)}
    >
      <FlashList
        ref={listRef}
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={pointKey}
        renderItem={({ item }) => <PhotoTile item={item} onSelect={onSelect} />}
        ItemSeparatorComponent={PhotoGap}
        ListHeaderComponent={PhotoEdge}
        ListFooterComponent={PhotoEdge}
        maintainVisibleContentPosition={{ disabled: true }}
        onCommitLayoutEffect={keepSelectionVisible}
        onContentSizeChange={(width) => {
          const committed = committedViewportRef.current;
          if (committed?.keys !== orderedKeys || committed.viewport !== viewport) return;
          contentWidthRef.current = width;
          keepSelectionVisible();
        }}
        onScrollBeginDrag={() => {
          isDraggingRef.current = true;
          // Cancel a pending correction even if the drag ends before content
          // size or another layout callback arrives.
          handledViewportRef.current = committedViewportRef.current;
        }}
        onScrollEndDrag={() => { isDraggingRef.current = false; }}
        onMomentumScrollBegin={() => {
          isMomentumScrollingRef.current = true;
          handledViewportRef.current = committedViewportRef.current;
        }}
        onMomentumScrollEnd={() => { isMomentumScrollingRef.current = false; }}
      />
    </View>
  );
}
