import { MAP_POINT_PRIORITY_ALL_VISIBLE_ZOOM, MAP_POINT_PRIORITY_ZOOM_STOPS } from '@/lib/constants';
import type { Bangumi, Point } from '@/services/types';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { type MapPointReference, useMapBrowse } from '@/store/use-map-browse';
import { CircleLayer, ShapeSource } from '@rnmapbox/maps';
import { ComponentProps, useCallback, useMemo } from 'react';

type Props = {
  bangumis: Bangumi[];
  onPointSelect?: (point: Point, bangumi: Bangumi) => void;
  selectedBangumiIds?: number[];
  openedBangumiDetailsId?: number | null;
  showAllPoints?: boolean;
  selectedPoint?: MapPointReference | null;
  maxVisualDiameter?: number;
};

// ---------------------------------------------------------------------------
// 将所有点位展平为 GeoJSON FeatureCollection
// GeoJSON 坐标顺序为 [lng, lat]
// ---------------------------------------------------------------------------

function toGeoJSON(bangumis: Bangumi[], selectedPoint?: MapPointReference | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const b of bangumis) {
    for (const p of b.points) {
      if (p.geo[0] === 0 && p.geo[1] === 0) continue;
      if (selectedPoint?.bangumiId === b.id && selectedPoint.pointId === p.id) continue;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p.geo[1], p.geo[0]],
        },
        properties: {
          id: p.id,
          priority: p.priority,
          bangumiId: b.id,
          color: b.color,
        },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}

const POINT_PRIORITY_FILTER = [
  'step',
  ['zoom'],
  ['>', ['get', 'priority'], MAP_POINT_PRIORITY_ZOOM_STOPS[0][1]],
  ...MAP_POINT_PRIORITY_ZOOM_STOPS.slice(1).flatMap(([zoom, priority]) => [zoom, ['>', ['get', 'priority'], priority]]),
  MAP_POINT_PRIORITY_ALL_VISIBLE_ZOOM,
  ['has', 'priority'],
] as unknown as ComponentProps<typeof CircleLayer>['filter'];

export default function MapMarkers({
  bangumis,
  onPointSelect,
  selectedBangumiIds,
  openedBangumiDetailsId,
  showAllPoints = false,
  selectedPoint,
  maxVisualDiameter,
}: Props) {
  const storedOpenedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const storedSelectedMapBangumiIds = useMapBangumiFilter((state) => state.selectedBangumiIds);
  const activeOpenedBangumiDetailsId =
    openedBangumiDetailsId === undefined ? storedOpenedBangumiDetailsId : openedBangumiDetailsId;
  const activeSelectedBangumiIds = selectedBangumiIds ?? storedSelectedMapBangumiIds;

  // 始终用完整数据生成 GeoJSON，筛选通过 filter 表达式实现
  const geoJSON = useMemo(() => toGeoJSON(bangumis, selectedPoint), [bangumis, selectedPoint]);

  const pointFilter: ComponentProps<typeof CircleLayer>['filter'] = useMemo(() => {
    if (activeOpenedBangumiDetailsId !== null) {
      // 筛选模式：只显示选中番剧的点 + 不限制 density
      return ['all', ['==', ['get', 'bangumiId'], activeOpenedBangumiDetailsId]] satisfies ComponentProps<
        typeof CircleLayer
      >['filter'];
    }
    if (activeSelectedBangumiIds.length > 0) {
      return ['all', ['in', ['get', 'bangumiId'], ['literal', activeSelectedBangumiIds]]] satisfies ComponentProps<
        typeof CircleLayer
      >['filter'];
    }
    if (showAllPoints) return undefined;
    return POINT_PRIORITY_FILTER;
  }, [activeOpenedBangumiDetailsId, activeSelectedBangumiIds, showAllPoints]);

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
    // Mapbox draws the stroke outside the radius, so the original maximum diameter is 2 * (16 + 6) = 44.
    // Keep zoom as the top-level interpolation input; cap its stops instead of wrapping it in a min expression.
    const radiusCap = maxVisualDiameter === undefined ? Infinity : (maxVisualDiameter * 16) / 44;
    const strokeCap = maxVisualDiameter === undefined ? Infinity : (maxVisualDiameter * 6) / 44;
    return {
      circleSortKey: 90_001,
      circleColor: ['get', 'color'],
      circleRadius: [
        'interpolate',
        ['exponential', 1.75],
        ['zoom'],
        12,
        Math.min(4, radiusCap),
        18,
        Math.min(8, radiusCap),
        22,
        Math.min(16, radiusCap),
      ],
      circleStrokeWidth: [
        'interpolate',
        ['exponential', 1.75],
        ['zoom'],
        12,
        Math.min(1.5, strokeCap),
        18,
        Math.min(3, strokeCap),
        22,
        Math.min(6, strokeCap),
      ],
      circleStrokeColor: '#ffffff',
    };
  }, [maxVisualDiameter]);

  return (
    <>
      <ShapeSource id="anitabi-points" shape={geoJSON} onPress={handlePress}>
        <CircleLayer id="points" filter={pointFilter} style={circleStyle} />
      </ShapeSource>
    </>
  );
}
