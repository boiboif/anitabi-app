import { AppTabBarInsetContext } from '@/components/app-tab-bar-inset';
import { MAP_CONTROL_SIZE } from '@/lib/constants';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi } from '@/services/types';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { useMapBrowse } from '@/store/use-map-browse';
import type { MapViewportState } from '@/utils/map-viewport';
import { findViewportImagePoints, type ViewportImagePoint } from '@/utils/map-viewport-points';
import { Image } from 'expo-image';
import { use, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, type LayoutRectangle } from 'react-native';
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
  const listRef = useRef<FlatList<ViewportImagePoint>>(null);
  const items =
    openedBangumiDetailsId === null
      ? findViewportImagePoints(bangumis, viewport, filteredBangumiId, selectedBangumiIds)
      : [];
  const orderedKeys = JSON.stringify(items.map(pointKey));

  useEffect(() => {
    // A new viewport/filter starts with its closest point. Scrolling alone never resets the list.
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [orderedKeys]);

  useEffect(() => {
    if (tabBarInset === null || items.length === 0) onLayoutChange?.(null);
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
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={pointKey}
        renderItem={({ item }) => <PhotoTile item={item} onSelect={onSelect} />}
        ItemSeparatorComponent={PhotoGap}
        ListHeaderComponent={PhotoEdge}
        ListFooterComponent={PhotoEdge}
        getItemLayout={(_, index) => ({
          length: PHOTO_WIDTH + PHOTO_GAP,
          offset: EDGE_INSET + index * (PHOTO_WIDTH + PHOTO_GAP),
          index,
        })}
      />
    </View>
  );
}
