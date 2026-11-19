import { hexToRgba } from '@/lib/color';
import { MAP_ICON_ZOOM_THRESHOLD } from '@/lib/constants';
import { getBangumiMapLabel } from '@/lib/localized-data';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi } from '@/services/types';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { useMapBrowse } from '@/store/use-map-browse';
import { createMapViewportContainsPoint, type MapViewportState } from '@/utils/map-viewport';
import { X } from '@/components/icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, type ScrollViewInstance } from 'react-native';
import { Text, useTheme, View } from 'tamagui';

// ===========================================================================
// Constants
// ===========================================================================

const MAX_ICONS = 8;
const ICON_SIZE = 24;
const BORDER_WIDTH = 2;

// ===========================================================================
// Helpers
// ===========================================================================

function countVisiblePoints(
  points: Bangumi['points'],
  containsPoint: ReturnType<typeof createMapViewportContainsPoint>,
): number {
  let count = 0;
  for (const point of points ?? []) {
    if (containsPoint(point.geo)) count++;
  }
  return count;
}

// ===========================================================================
// Component
// ===========================================================================

type Props = {
  bangumis: Bangumi[];
  zoom: number;
  bounds: MapViewportState['bounds'];
  footprint?: MapViewportState['footprint'];
  filter?: {
    selectedBangumiIds: number[];
    onToggleBangumi: (bangumiId: number) => void;
    onClear: () => void;
  };
  alwaysVisible?: boolean;
  showOpenedBangumiDetails?: boolean;
};

export default function MapTopBangumiIcons({
  bangumis,
  zoom,
  bounds,
  footprint,
  filter,
  alwaysVisible = false,
  showOpenedBangumiDetails = true,
}: Props) {
  const { t, i18n } = useTranslation();
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const [contentWidth, setContentWidth] = useState<number | null>(null);
  const theme = useTheme();
  const openedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const closeBangumiDetails = useMapBrowse((state) => state.closeBangumiDetails);
  const storedSelectedMapBangumiIds = useMapBangumiFilter((state) => state.selectedBangumiIds);
  const toggleMapBangumi = useMapBangumiFilter((state) => state.toggleBangumi);
  const clearMapBangumiFilter = useMapBangumiFilter((state) => state.clear);
  const selectedMapBangumiIds = filter?.selectedBangumiIds ?? storedSelectedMapBangumiIds;
  const hasMapBangumiFilter = selectedMapBangumiIds.length > 0;
  const selectedBangumi = useMemo(
    () =>
      showOpenedBangumiDetails ? (bangumis.find((bangumi) => bangumi.id === openedBangumiDetailsId) ?? null) : null,
    [bangumis, openedBangumiDetailsId, showOpenedBangumiDetails],
  );

  const { inViewBangumis, visibleCounts, containsPoint } = useMemo(() => {
    const containsPoint = createMapViewportContainsPoint(bounds, footprint);
    const visibleCounts = new Map<number, number>();
    if (selectedBangumi) return { inViewBangumis: [], visibleCounts, containsPoint };
    if (!bounds) return { inViewBangumis: alwaysVisible ? bangumis : [], visibleCounts, containsPoint };
    if (!alwaysVisible && zoom < MAP_ICON_ZOOM_THRESHOLD) return { inViewBangumis: [], visibleCounts, containsPoint };

    const inView: { bangumi: Bangumi; visibleCount: number }[] = [];
    for (const bangumi of bangumis) {
      const visibleCount = countVisiblePoints(bangumi.points, containsPoint);
      if (visibleCount === 0) continue;
      visibleCounts.set(bangumi.id, visibleCount);
      inView.push({ bangumi, visibleCount });
    }
    inView.sort((a, b) => b.visibleCount - a.visibleCount);
    return { inViewBangumis: inView.map((entry) => entry.bangumi), visibleCounts, containsPoint };
  }, [alwaysVisible, bangumis, bounds, footprint, selectedBangumi, zoom]);

  const displayedBangumis = useMemo(() => {
    const selectedIds = new Set(selectedMapBangumiIds);
    const selectedBangumis = selectedMapBangumiIds
      .map((id) => bangumis.find((bangumi) => bangumi.id === id))
      .filter((bangumi): bangumi is Bangumi => bangumi != null);
    const unselectedInView = inViewBangumis.filter((bangumi) => !selectedIds.has(bangumi.id));

    return [...selectedBangumis, ...unselectedInView.slice(0, MAX_ICONS)];
  }, [bangumis, inViewBangumis, selectedMapBangumiIds]);

  const displayedBangumiIds = useMemo(
    () => displayedBangumis.map((bangumi) => bangumi.id).join(','),
    [displayedBangumis],
  );

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: 0,
        y: 0,
        animated: false,
      });
    }
  }, [displayedBangumiIds]);

  // 筛选模式：只显示选中的番剧 + X 取消按钮
  if (selectedBangumi) {
    const b = selectedBangumi;
    const borderColor = b.color || theme['color-12'].val;
    const visibleCount = bounds ? countVisiblePoints(b.points, containsPoint) : 0;

    return (
      <View py="13px" pointerEvents="box-none">
        <View
          pointerEvents="box-none"
          flexDirection="row"
          h={32}
          items="center"
          gap={8}
          px={14}
        >
          <View
            bg="color-2"
            gap="7px"
            rounded={34}
            flexDirection="row"
            items="center"
            boxShadow="0 2px 6px rgba(0,0,0,0.15)"
          >
            <View style={[styles.iconWrapper, { borderColor }]}>
              <Image
                key={`top-icon-${b.id}`}
                source={buildImageUrl(b.icon || b.cover || '')}
                style={styles.icon}
                contentFit="cover"
              />
            </View>

            <Text
              maxW={80}
              color="color-11"
              fontSize="footnote"
              fontWeight="500"
              numberOfLines={1}
              shrink={1}
            >
              {getBangumiMapLabel(b, i18n.resolvedLanguage)}
            </Text>

            <View
              rounded={999}
              mr="1"
              w={34}
              h={22}
              items="center"
              justify="center"
              style={{ backgroundColor: hexToRgba(borderColor, 0.2) }}
            >
              <Text fontSize="footnote" fontWeight="600" numberOfLines={1} style={{ color: borderColor }}>
                {visibleCount}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={closeBangumiDetails}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              justifyContent: 'center',
              alignItems: 'center',
            })}
          >
            <View
              bg="color-2"
              rounded={34}
              w={32}
              h={32}
              items="center"
              justify="center"
              boxShadow="0 2px 6px rgba(0,0,0,0.15)"
            >
              <X size={18} color="color-11" />
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  if (displayedBangumis.length === 0) return null;

  return (
    <View py="13px" pointerEvents="box-none">
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={(width) => setContentWidth(width)}
        style={{ width: contentWidth ?? '100%', maxWidth: '100%' }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 14, height: 32 }}
      >
        {displayedBangumis.map((b) => {
          const isSelected = selectedMapBangumiIds.includes(b.id);
          const visibleCount = bounds
            ? (visibleCounts.get(b.id) ??
              (isSelected && !alwaysVisible && zoom < MAP_ICON_ZOOM_THRESHOLD
                ? countVisiblePoints(b.points, containsPoint)
                : 0))
            : 0;
          const borderColor = b.color || theme['color-12'].val;

          if (visibleCount === 0 && !isSelected) return null;

          return (
            <Pressable
              key={b.id}
              onPress={() => (filter?.onToggleBangumi ?? toggleMapBangumi)(b.id)}
              style={({ pressed }) => ({ opacity: pressed ? 0.3 : !hasMapBangumiFilter || isSelected ? 1 : 0.5 })}
            >
              <View
                bg="color-2"
                gap="7px"
                rounded={34}
                flexDirection="row"
                items="center"
                boxShadow="0 2px 4px rgba(0,0,0,0.05)"
              >
                <View style={[styles.iconWrapper, { borderColor }]}>
                  <Image
                    key={`top-icon-${b.id}`}
                    source={buildImageUrl(b.icon || b.cover || '')}
                    style={styles.icon}
                    contentFit="cover"
                  />
                </View>

                <Text
                  maxW={80}
                  color="color-11"
                  fontSize="footnote"
                  fontWeight="500"
                  numberOfLines={1}
                  shrink={1}
                >
                  {getBangumiMapLabel(b, i18n.resolvedLanguage)}
                </Text>

                <View
                  rounded={999}
                  mr="1"
                  w={34}
                  h="70%"
                  items="center"
                  justify="center"
                  style={{ backgroundColor: hexToRgba(borderColor, 0.2) }}
                >
                  <Text fontSize="footnote" fontWeight="600" numberOfLines={1} style={{ color: borderColor }}>
                    {visibleCount}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {hasMapBangumiFilter && (
        <Pressable
          onPress={filter?.onClear ?? clearMapBangumiFilter}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            marginTop: 8,
            marginLeft: 14,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View bg="color-2" px="13px" py="1" rounded={34} boxShadow="0 2px 4px rgba(0,0,0,0.05)">
            <Text color="color-11" fontSize="footnote" fontWeight="500">
              {t('clearFilters', { defaultValue: '清除筛选' })}
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

// ===========================================================================
// Styles
// ===========================================================================

const styles = StyleSheet.create({
  iconWrapper: {
    width: ICON_SIZE + BORDER_WIDTH * 2,
    height: ICON_SIZE + BORDER_WIDTH * 2,
    borderRadius: (ICON_SIZE + BORDER_WIDTH * 2) / 2,
    borderWidth: BORDER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
  },
});
