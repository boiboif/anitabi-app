import type { Bangumi, Point } from '@/services/types';
import { useSelectedBangumi } from '@/store/use-selected-bangumi';
import { CircleLayer, ShapeSource } from '@rnmapbox/maps';
import { ComponentProps, useCallback, useMemo } from 'react';

type Props = {
  bangumis: Bangumi[];
  onPointSelect?: (point: Point, bangumi: Bangumi) => void;
};

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

export default function MapMarkers({ bangumis, onPointSelect }: Props) {
  const { selectedBangumi } = useSelectedBangumi();

  // 始终用完整数据生成 GeoJSON，筛选通过 filter 表达式实现
  const geoJSON = useMemo(() => toGeoJSON(bangumis), [bangumis]);

  const pointFilter: ComponentProps<typeof CircleLayer>['filter'] = useMemo(() => {
    if (selectedBangumi) {
      // 筛选模式：只显示选中番剧的点 + 不限制 density
      return [
        'all',
        ['==', ['get', 'bangumiId'], selectedBangumi.id],
        ['>=', ['get', 'density'], 0],
      ] satisfies ComponentProps<typeof CircleLayer>['filter'];
    }
    // 普通模式：zoom-density 动态阈值
    return [
      '>=',
      ['get', 'density'],
      ['interpolate', ['linear'], ['zoom'], ...DENSITY_STOPS.flat()],
    ] satisfies ComponentProps<typeof CircleLayer>['filter'];
  }, [selectedBangumi]);

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

  const circleStyle = useMemo((): ComponentProps<typeof CircleLayer>['style'] => {
    if (selectedBangumi) {
      // 筛选模式：放大、更不透明
      return {
        circleColor: ['get', 'color'],
        circleOpacity: ['interpolate', ['linear'], ['zoom'], 0, 0.7, 8, 0.85, 14, 0.95],
        circleStrokeWidth: 1,
        circleStrokeColor: '#ffffff',
        circleRadius: ['interpolate', ['linear'], ['zoom'], 0, 3, 8, 5, 14, 7, 16, 8, 17, 9, 18, 10],
      };
    }
    // 普通模式
    return {
      circleColor: ['get', 'color'],
      circleOpacity: ['interpolate', ['linear'], ['zoom'], 0, 0.5, 8, 0.6, 14, 0.8],
      circleStrokeWidth: 1,
      circleStrokeColor: '#ffffff',
      circleRadius: ['interpolate', ['linear'], ['zoom'], 0, 2, 8, 4, 14, 6, 16, 7, 17, 8, 18, 9],
    };
  }, [selectedBangumi]);

  return (
    <>
      <ShapeSource id="anitabi-points" shape={geoJSON} onPress={handlePress}>
        <CircleLayer id="points" filter={pointFilter} style={circleStyle} />
      </ShapeSource>
    </>
  );
}
