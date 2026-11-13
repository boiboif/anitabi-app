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
import { use, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { LayoutRectangle } from 'react-native';
import { type GetThemeValueForKey, styled, View, XStack } from 'tamagui';

const PHOTO_COUNT = 5;
const PHOTO_ASPECT_RATIO = 80 / 60;
const PHOTO_GAP = 4;
const PHOTO_BORDER_WIDTH = 1.5;
const EDGE_INSET = 6;
const Photo = styled(Image, { width: '100%', height: '100%' });

function pointKey({ bangumi, point }: ViewportImagePoint) {
  return JSON.stringify([bangumi.id, point.id]);
}

function PhotoTile({ item, onSelect }: { item: ViewportImagePoint; onSelect: (item: ViewportImagePoint) => void }) {
  const { i18n } = useTranslation();
  const { point, bangumi } = item;
  return (
    <View
      flex={1}
      aspectRatio={PHOTO_ASPECT_RATIO}
      rounded="$3"
      overflow="hidden"
      bg="$color3"
      borderWidth={PHOTO_BORDER_WIDTH}
      borderColor={(bangumi.color || '$color8') as GetThemeValueForKey<'borderColor'>}
      pressStyle={{ opacity: 0.7 }}
      onPress={() => onSelect(item)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${getPointTitle(point, i18n.resolvedLanguage) || point.id} · ${getBangumiTitle(bangumi, i18n.resolvedLanguage)}`}
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
  const items =
    openedBangumiDetailsId === null
      ? findViewportImagePoints(bangumis, viewport, filteredBangumiId, selectedBangumiIds).slice(0, PHOTO_COUNT)
      : [];

  useEffect(() => {
    if (tabBarInset === null || items.length === 0) {
      onLayoutChange?.(null);
    }
  }, [items.length, onLayoutChange, tabBarInset]);

  if (tabBarInset === null || items.length === 0) return null;

  return (
    <XStack
      position="absolute"
      l={0}
      r={MAP_CONTROL_SIZE + 12}
      b={tabBarInset + 12}
      pl="$3"
      pr={EDGE_INSET}
      gap={PHOTO_GAP}
      z={10}
      pointerEvents="box-none"
      testID="map-viewport-photos"
      onLayout={({ nativeEvent: { layout } }) => onLayoutChange?.(layout)}
    >
      {items.map((item) => <PhotoTile key={pointKey(item)} item={item} onSelect={onSelect} />)}
      {Array.from({ length: PHOTO_COUNT - items.length }, (_, index) => (
        <View key={`empty-${index}`} flex={1} aspectRatio={PHOTO_ASPECT_RATIO} borderWidth={PHOTO_BORDER_WIDTH} borderColor="transparent" pointerEvents="none" />
      ))}
    </XStack>
  );
}
