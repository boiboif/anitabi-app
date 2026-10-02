import {
  MAP_INITIAL_POINT_PRIORITY,
  MAP_POINT_PRIORITY_ALL_VISIBLE_ZOOM,
  MAP_POINT_PRIORITY_ZOOM_STOPS,
  SELECTED_MAP_POINT_LAYER_ID,
} from '@/lib/constants';
import type { Bangumi, Point } from '@/services/types';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { useMapBrowse } from '@/store/use-map-browse';
import { SelectableCircleLayer } from './map-marker-selection';
import { getMapPointCircleStyle } from '@/utils/map-point-style';
import { CircleLayer, ShapeSource } from '@rnmapbox/maps';
import { ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';

type Props = {
  bangumis: Bangumi[];
  onPointSelect?: (point: Point, bangumi: Bangumi, screenPoint: { x: number; y: number }) => void;
  selectedBangumiIds?: number[];
  openedBangumiDetailsId?: number | null;
  showAllPoints?: boolean;
  maxVisualDiameter?: number;
};

// ---------------------------------------------------------------------------
// 将所有点位展平为 GeoJSON FeatureCollection
// GeoJSON 坐标顺序为 [lng, lat]
// ---------------------------------------------------------------------------

function toGeoJSON(bangumis: Bangumi[], minimumPriority: number | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const b of bangumis) {
    for (const p of b.points) {
      if (p.geo[0] === 0 && p.geo[1] === 0) continue;
      if (minimumPriority !== null && !(p.priority > minimumPriority)) continue;

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

const FULL_POINT_SOURCE_DELAY_MS = 900;
let fullPointSourceLoaded = false;

export default function MapMarkers({
  bangumis,
  onPointSelect,
  selectedBangumiIds,
  openedBangumiDetailsId,
  showAllPoints = false,
  maxVisualDiameter,
}: Props) {
  const storedOpenedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const storedSelectedMapBangumiIds = useMapBangumiFilter((state) => state.selectedBangumiIds);
  const activeOpenedBangumiDetailsId =
    openedBangumiDetailsId === undefined ? storedOpenedBangumiDetailsId : openedBangumiDetailsId;
  const activeSelectedBangumiIds = selectedBangumiIds ?? storedSelectedMapBangumiIds;
  const [showFullPointSource, setShowFullPointSource] = useState(fullPointSourceLoaded);

  useEffect(() => {
    if (showFullPointSource || bangumis.length === 0) return;
    const timeout = setTimeout(() => {
      fullPointSourceLoaded = true;
      setShowFullPointSource(true);
    }, FULL_POINT_SOURCE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [bangumis, showFullPointSource]);

  const minimumPriority =
    showFullPointSource || showAllPoints || activeOpenedBangumiDetailsId !== null || activeSelectedBangumiIds.length > 0
      ? null
      : MAP_INITIAL_POINT_PRIORITY;

  // At the default zoom, lower-priority points cannot render; send the visible subset first.
  // Restore the complete source shortly afterward so zooming and filtering keep their usual behavior.
  const geoJSON = useMemo(() => toGeoJSON(bangumis, minimumPriority), [bangumis, minimumPriority]);

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
    (e: { features: GeoJSON.Feature[]; point: { x: number; y: number } }) => {
      const feature = e.features?.[0];
      if (!feature?.properties) return;
      const pointId = feature.properties.id as string | undefined;
      const bangumiId = feature.properties.bangumiId as number | undefined;
      if (!pointId || bangumiId == null) return;

      for (const b of bangumis) {
        if (b.id !== bangumiId) continue;
        for (const p of b.points) {
          if (p.id === pointId) {
            onPointSelect?.(p, b, e.point);
            return;
          }
        }
      }
    },
    [bangumis, onPointSelect],
  );

  const circleStyle = useMemo(() => getMapPointCircleStyle(maxVisualDiameter), [maxVisualDiameter]);

  return (
    <>
      <ShapeSource id="anitabi-points" shape={geoJSON} onPress={handlePress}>
        <SelectableCircleLayer
          id="points"
          belowLayerID={SELECTED_MAP_POINT_LAYER_ID}
          filter={pointFilter}
          style={circleStyle}
        />
      </ShapeSource>
    </>
  );
}
