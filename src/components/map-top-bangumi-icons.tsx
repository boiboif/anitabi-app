import { hexToRgba } from '@/lib/color';
import { MAP_ICON_ZOOM_THRESHOLD } from '@/lib/constants';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi } from '@/services/types';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { useSelectedBangumi } from '@/store/use-selected-bangumi';
import { X } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { GetThemeValueForKey, Text, useTheme, View } from 'tamagui';

// ===========================================================================
// Constants
// ===========================================================================

const MAX_ICONS = 8;
const ICON_SIZE = 24;
const BORDER_WIDTH = 2;

// ===========================================================================
// Helpers
// ===========================================================================

function isWithinBounds(lat: number, lng: number, bounds: { ne: [number, number]; sw: [number, number] }): boolean {
  const [swLng, swLat] = bounds.sw;
  const [neLng, neLat] = bounds.ne;
  return lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng;
}

function countVisiblePoints(points: Bangumi['points'], bounds: { ne: [number, number]; sw: [number, number] }): number {
  if (!points) return 0;
  return points.filter((p) => isWithinBounds(p.geo[0], p.geo[1], bounds)).length;
}

// ===========================================================================
// Component
// ===========================================================================

type Props = {
  bangumis: Bangumi[];
  zoom: number;
  bounds: { ne: [number, number]; sw: [number, number] } | null;
};

export default function MapTopBangumiIcons({ bangumis, zoom, bounds }: Props) {
  const scrollViewRef = useRef<ScrollView>(null);
  const theme = useTheme();
  const selectedBangumiId = useSelectedBangumi((state) => state.selectedBangumiId);
  const setSelectedBangumi = useSelectedBangumi((state) => state.setSelectedBangumi);
  const selectedMapBangumiIds = useMapBangumiFilter((state) => state.selectedBangumiIds);
  const toggleMapBangumi = useMapBangumiFilter((state) => state.toggleBangumi);
  const clearMapBangumiFilter = useMapBangumiFilter((state) => state.clear);
  const hasMapBangumiFilter = selectedMapBangumiIds.length > 0;
  const selectedBangumi = useMemo(
    () => bangumis.find((bangumi) => bangumi.id === selectedBangumiId) ?? null,
    [bangumis, selectedBangumiId],
  );

  const inViewBangumis = useMemo(() => {
    if (zoom < MAP_ICON_ZOOM_THRESHOLD || !bounds) return [];

    const inView = bangumis.filter((b) => {
      return b.points?.some((p) => isWithinBounds(p.geo[0], p.geo[1], bounds)) ?? false;
    });

    return inView
      .map((b) => ({
        bangumi: b,
        visibleCount: b.points?.filter((p) => isWithinBounds(p.geo[0], p.geo[1], bounds)).length ?? 0,
      }))
      .sort((a, b) => b.visibleCount - a.visibleCount)
      .map((entry) => entry.bangumi);
  }, [bangumis, zoom, bounds]);

  const displayedBangumis = useMemo(() => {
    const selectedIds = new Set(selectedMapBangumiIds);
    const inViewIds = new Set(inViewBangumis.map((bangumi) => bangumi.id));
    const selectedInView = inViewBangumis.filter((bangumi) => selectedIds.has(bangumi.id));
    const selectedOutOfView = selectedMapBangumiIds
      .filter((id) => !inViewIds.has(id))
      .map((id) => bangumis.find((bangumi) => bangumi.id === id))
      .filter((bangumi): bangumi is Bangumi => bangumi != null);
    const unselectedInView = inViewBangumis.filter((bangumi) => !selectedIds.has(bangumi.id));

    return [...selectedInView, ...selectedOutOfView, ...unselectedInView].slice(0, MAX_ICONS);
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
    const borderColor = b.color || theme.color12.val;
    const visibleCount = bounds ? countVisiblePoints(b.points, bounds) : 0;

    return (
      <View py="$3">
        <View
          style={{
            flexDirection: 'row',
            height: 32,
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
          }}
        >
          <View
            bg="$color2"
            gap="$2"
            rounded="$10"
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

            <Text maxW={80} color="$color11" fontSize={12} fontWeight="500" numberOfLines={1} style={{ flexShrink: 1 }}>
              {b.cn}
            </Text>

            <View
              rounded={999}
              mr="$1.5"
              height={22}
              items="center"
              justify="center"
              style={{
                width: 34,
                textAlign: 'center',
                backgroundColor: hexToRgba(borderColor, 0.2),
                borderRadius: 999,
              }}
            >
              <Text fontSize={12} fontWeight="600" numberOfLines={1} style={{ color: borderColor }}>
                {visibleCount}
              </Text>
            </View>
          </View>

          {/* <Pressable
            onPress={() => onOpenSheet?.()}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              justifyContent: 'center',
              alignItems: 'center',
            })}
          >
            <View
              bg="$color4"
              rounded="$10"
              items="center"
              justify="center"
              boxShadow="0 2px 6px rgba(0,0,0,0.15)"
              style={{ width: 40, height: 40 }}
            >
              <ChevronUp size={20} color={theme.color11.val as GetThemeValueForKey<'color'>} />
            </View>
          </Pressable> */}

          <Pressable
            onPress={() => setSelectedBangumi(null)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              justifyContent: 'center',
              alignItems: 'center',
            })}
          >
            <View
              bg="$color2"
              rounded="$10"
              items="center"
              justify="center"
              boxShadow="0 2px 6px rgba(0,0,0,0.15)"
              style={{ width: 32, height: 32 }}
            >
              <X size={18} color={theme.color11.val as GetThemeValueForKey<'color'>} />
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  if (displayedBangumis.length === 0) return null;

  return (
    <View py="$3">
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 14, height: 32 }}
      >
        {displayedBangumis.map((b) => {
          const visibleCount = bounds ? countVisiblePoints(b.points, bounds) : 0;
          const borderColor = b.color || theme.color12.val;
          const isSelected = selectedMapBangumiIds.includes(b.id);

          return (
            <Pressable
              key={b.id}
              onPress={() =>
                toggleMapBangumi(
                  b.id,
                  inViewBangumis.map((bangumi) => bangumi.id),
                )
              }
              style={({ pressed }) => ({ opacity: pressed ? 0.3 : !hasMapBangumiFilter || isSelected ? 1 : 0.5 })}
            >
              <View
                bg="$color2"
                gap="$2"
                rounded="$10"
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
                  color="$color11"
                  fontSize={12}
                  fontWeight="500"
                  numberOfLines={1}
                  style={{ flexShrink: 1 }}
                >
                  {b.cn || b.title}
                </Text>

                <View
                  rounded={999}
                  mr="$1.5"
                  height="70%"
                  items="center"
                  justify="center"
                  style={{
                    width: 34,
                    textAlign: 'center',
                    backgroundColor: hexToRgba(borderColor, 0.2),
                    borderRadius: 999,
                  }}
                >
                  <Text fontSize={12} fontWeight="600" numberOfLines={1} style={{ color: borderColor }}>
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
          onPress={clearMapBangumiFilter}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            marginTop: 8,
            marginLeft: 14,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View bg="$color2" px="$3" py="$1.5" rounded="$10" boxShadow="0 2px 4px rgba(0,0,0,0.05)">
            <Text color="$color11" fontSize={12} fontWeight="500">
              清除筛选
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
