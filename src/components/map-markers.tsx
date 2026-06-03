import { formatDuration } from '@/lib/formatDuration';
import { baseUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { CircleLayer, MarkerView, ShapeSource } from '@rnmapbox/maps';
import { Image } from 'expo-image';
import { useCallback, useMemo } from 'react';
import { getTokens, Text, useTheme, View } from 'tamagui';

type Props = {
  bangumis: Bangumi[];
  selectedPopupPoint?: { point: Point; bangumi: Bangumi } | null;
  onPointSelect?: (point: Point, bangumi: Bangumi) => void;
};

// ---------------------------------------------------------------------------
// 弹窗卡片
// ---------------------------------------------------------------------------
function PopupCard({ point, bangumi }: { point: Point; bangumi: Bangumi }) {
  const theme = useTheme();
  const pointTitle = point.cn || point.name || '未命名点位';
  const animeTitle = bangumi.cn || bangumi.title || bangumi.en || '未知';
  const epLabel =
    typeof point.ep === 'number' && point.ep > 0
      ? `EP${point.ep}`
      : typeof point.ep === 'string' && point.ep
        ? point.ep
        : undefined;
  const timeLabel = typeof point.s === 'number' && point.s >= 0 ? formatDuration(point.s) : undefined;

  const innerRadius = getTokens().radius['2'].val;
  console.log(`${baseUrl}${point.image}?plan=h360`);

  return (
    <View bg="$color2" rounded="$3" boxShadow="0 2px 8px rgba(0,0,0,0.12)" width={200}>
      {/* 图片 + EP / 时间覆盖层 */}
      <View
        style={{
          borderRadius: innerRadius,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Image
          source={point.image ? { uri: `${baseUrl}${point.image}?plan=h360` } : undefined}
          style={{
            height: 120,
            aspectRatio: 16 / 9,
            backgroundColor: theme.color9.val,
          }}
          contentFit="contain"
          contentPosition="center"
          transition={0}
        />
        {epLabel && (
          <View
            position="absolute"
            l={0}
            b={0}
            bg="rgba(0,0,0,0.55)"
            px="$1.5"
            py="$0.5"
            style={{ borderTopRightRadius: innerRadius }}
          >
            <Text fontSize={10} fontWeight="700" color="white">
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
            style={{ borderTopLeftRadius: innerRadius }}
          >
            <Text fontSize={10} color="white">
              {timeLabel}
            </Text>
          </View>
        )}
      </View>

      {/* 文字内容 */}
      <View px="$2" py="$1.5">
        <Text fontWeight="600" fontSize={13} color="$color12" numberOfLines={1} mt="$1">
          {pointTitle}
        </Text>
        {point.mark ? (
          <Text fontSize={11} color="$color11" numberOfLines={2} mt="$0.5">
            {point.mark}
          </Text>
        ) : null}
        <Text fontSize={11} color="$primary" numberOfLines={1} mt="$0.5">
          {animeTitle}
        </Text>
        {point.origin ? (
          <Text fontSize={10} color="$color10" style={{ textAlign: 'right' }} mt="$0.5">
            {point.origin}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 将所有点位展平为 GeoJSON FeatureCollection
// GeoJSON 坐标顺序为 [lng, lat]
// ---------------------------------------------------------------------------

function toGeoJSON(bangumis: Bangumi[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const b of bangumis) {
    for (const p of b.points) {
      if (p.geo[0] === 0 && p.geo[1] === 0) continue;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p.geo[1], p.geo[0]],
        },
        properties: {
          id: p.id,
          density: p.density ?? 0,
          priority: p.priority,
          bangumiId: b.id,
          color: b.color,
        },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------------------
// Zoom-Density 动态阈值
//
// density = 到最近邻点的距离（米）
// 每个 stop 表示：在 zoom 级别下，只显示 density >= 该阈值的点
// zoom 越低 → 阈值越高（只显示稀疏点）
// zoom 越高 → 阈值越低（逐渐放开密集点）
// zoom >= 16 → 显示所有点
// ---------------------------------------------------------------------------

const DENSITY_STOPS: [number, number][] = [
  [0, 100000],
  [4, 30000],
  [7, 5000],
  [10, 500],
  [12, 50],
  [14, 5],
  [16, 0],
];

export default function MapMarkers({ bangumis, selectedPopupPoint, onPointSelect }: Props) {
  const geoJSON = useMemo(() => toGeoJSON(bangumis), [bangumis]);

  /** 点击圆点标记 → 查找完整点/番数据 → 弹出详情 */
  const handlePress = useCallback(
    (e: { features: GeoJSON.Feature[] }) => {
      const feature = e.features?.[0];
      if (!feature?.properties) return;
      const pointId = feature.properties.id as string | undefined;
      const bangumiId = feature.properties.bangumiId as number | undefined;
      if (!pointId || bangumiId == null) return;

      for (const b of bangumis) {
        if (b.id !== bangumiId) continue;
        for (const p of b.points) {
          if (p.id === pointId) {
            onPointSelect?.(p, b);
            return;
          }
        }
      }
    },
    [bangumis, onPointSelect],
  );

  return (
    <>
      <ShapeSource id="anitabi-points" shape={geoJSON} onPress={handlePress}>
        <CircleLayer
          id="points"
          filter={['>=', ['get', 'density'], ['interpolate', ['linear'], ['zoom'], ...DENSITY_STOPS.flat()]]}
          style={{
            circleColor: ['get', 'color'],
            circleOpacity: ['interpolate', ['linear'], ['zoom'], 0, 0.5, 8, 0.6, 14, 0.75],
            circleStrokeWidth: 1,
            circleStrokeColor: '#ffffff',
            circleRadius: ['interpolate', ['linear'], ['zoom'], 0, 2, 8, 4, 14, 6, 16, 7, 17, 8, 18, 9],
          }}
        />
      </ShapeSource>

      {/* 选中点位弹窗 */}
      {selectedPopupPoint && (
        <MarkerView
          coordinate={[selectedPopupPoint.point.geo[1], selectedPopupPoint.point.geo[0]]}
          anchor={{ x: 0.5, y: 1 }}
          allowOverlap
        >
          <PopupCard point={selectedPopupPoint.point} bangumi={selectedPopupPoint.bangumi} />
        </MarkerView>
      )}
    </>
  );
}
