import {
  MAP_POINT_PRIORITY_ALL_VISIBLE_ZOOM,
  MAP_POINT_PRIORITY_ZOOM_STOPS,
  MAP_POINT_LAYER_ID,
  SELECTED_MAP_POINT_LAYER_ID,
} from '@/lib/constants';
import type { Bangumi, Point } from '@/services/types';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { useMapBrowse } from '@/store/use-map-browse';
import { SelectableCircleLayer } from './map-marker-selection';
import { getMapPointCircleStyle } from '@/utils/map-point-style';
import { CircleLayer, ShapeSource } from '@rnmapbox/maps';
import { ComponentProps, useCallback, useMemo } from 'react';

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

type PointLayerProps = Pick<
  Props,
  'selectedBangumiIds' | 'openedBangumiDetailsId' | 'showAllPoints' | 'maxVisualDiameter'
> & { sourceID?: string };

function PointMarkerLayer({
  sourceID,
  selectedBangumiIds,
  openedBangumiDetailsId,
  showAllPoints = false,
  maxVisualDiameter,
}: PointLayerProps) {
  const activeOpenedBangumiDetailsId = useMapBrowse((state) =>
    openedBangumiDetailsId === undefined ? state.openedBangumiDetailsId : openedBangumiDetailsId,
  );
  const activeSelectedBangumiIds = useMapBangumiFilter((state) => selectedBangumiIds ?? state.selectedBangumiIds);

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

  const circleStyle = useMemo(() => getMapPointCircleStyle(maxVisualDiameter), [maxVisualDiameter]);

  return (
    <SelectableCircleLayer
      id={MAP_POINT_LAYER_ID}
      sourceID={sourceID}
      belowLayerID={SELECTED_MAP_POINT_LAYER_ID}
      filter={pointFilter}
      style={circleStyle}
    />
  );
}

export default function MapMarkers({
  bangumis,
  onPointSelect,
  selectedBangumiIds,
  openedBangumiDetailsId,
  showAllPoints = false,
  maxVisualDiameter,
}: Props) {
  // Browse selection updates the child layer without making ShapeSource serialize the complete source again.
  const geoJSON = useMemo(() => toGeoJSON(bangumis), [bangumis]);

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

  return (
    <>
      <ShapeSource id="anitabi-points" shape={geoJSON} onPress={handlePress}>
        <PointMarkerLayer
          selectedBangumiIds={selectedBangumiIds}
          openedBangumiDetailsId={openedBangumiDetailsId}
          showAllPoints={showAllPoints}
          maxVisualDiameter={maxVisualDiameter}
        />
      </ShapeSource>
    </>
  );
}
