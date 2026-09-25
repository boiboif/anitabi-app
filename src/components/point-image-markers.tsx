import {
  FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE,
  MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE,
  MAP_IMAGE_PRIORITY_BASE_ZOOM_OFFSET,
} from '@/lib/constants';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { type MapPointReference, useMapBrowse } from '@/store/use-map-browse';
import { Images, ShapeSource, SymbolLayer } from '@rnmapbox/maps';
import { useDebounce } from 'ahooks';
import { memo, useMemo } from 'react';
import type { Bounds } from './map-container';

const IMAGE_MARKER_UPDATE_DELAY_MS = 600;

type Props = {
  bangumis: Bangumi[];
  zoom: number;
  bounds: Bounds | null;
  onPointSelect?: (point: Point, bangumi: Bangumi) => void;
  selectedBangumiIds?: number[];
  openedBangumiDetailsId?: number | null;
  ignoreZoomThreshold?: boolean;
  selectedPoint?: MapPointReference | null;
};

type ImageMarkerCandidate = {
  point: Point;
  bangumi: Bangumi;
  imageUrl: string;
  order: number;
};

type LayerProps = {
  visible: ImageMarkerCandidate[];
  bangumis: Bangumi[];
  onPointSelect?: Props['onPointSelect'];
};

/** 判断点位是否在可视区域内 */
function isInBounds(geo: [number, number], bounds: Bounds): boolean {
  const [lat, lng] = geo;
  const [swLng, swLat] = bounds.sw;
  const [neLng, neLat] = bounds.ne;
  return lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng;
}

function isNotSelected(item: ImageMarkerCandidate, selectedPoint?: MapPointReference | null): boolean {
  return selectedPoint?.bangumiId !== item.bangumi.id || selectedPoint.pointId !== item.point.id;
}

function firstLatitudeAtLeast(items: ImageMarkerCandidate[], latitude: number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (items[middle].point.geo[0] < latitude) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstLatitudeAbove(items: ImageMarkerCandidate[], latitude: number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (items[middle].point.geo[0] <= latitude) low = middle + 1;
    else high = middle;
  }
  return low;
}

function getVisibleCandidates(
  candidates: ImageMarkerCandidate[],
  byLatitude: ImageMarkerCandidate[],
  bounds: Bounds | null,
  selectedPoint?: MapPointReference | null,
): ImageMarkerCandidate[] {
  if (!bounds) return selectedPoint ? candidates.filter((item) => isNotSelected(item, selectedPoint)) : candidates;
  const south = bounds.sw[1];
  const north = bounds.ne[1];
  if (south > north) return [];

  // Keep the original full-scan path for unusual bounds and wide viewports.
  if (!Number.isFinite(south) || !Number.isFinite(north)) {
    return candidates.filter((item) => isNotSelected(item, selectedPoint) && isInBounds(item.point.geo, bounds));
  }
  const start = firstLatitudeAtLeast(byLatitude, south);
  const end = firstLatitudeAbove(byLatitude, north);
  if (end - start >= candidates.length / 2) {
    return candidates.filter((item) => isNotSelected(item, selectedPoint) && isInBounds(item.point.geo, bounds));
  }

  const visible: ImageMarkerCandidate[] = [];
  for (let index = start; index < end; index++) {
    const item = byLatitude[index];
    if (isNotSelected(item, selectedPoint) && isInBounds(item.point.geo, bounds)) visible.push(item);
  }
  // Symbol order and duplicate image keys must match the original data order.
  return visible.sort((a, b) => a.order - b.order);
}

const PointImageLayer = memo(
  function PointImageLayer({ visible, bangumis, onPointSelect }: LayerProps) {
    const imagesMap: Record<string, { uri: string }> = {};
    const features: GeoJSON.Feature[] = [];
    for (const item of visible) {
      const key = `point_img_${item.point.id}`;
      imagesMap[key] = { uri: item.imageUrl };
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [item.point.geo[1], item.point.geo[0]],
        },
        properties: {
          id: item.point.id,
          bangumiId: item.bangumi.id,
          iconImage: key,
          sortKey: -item.point.geo[0],
        },
      });
    }
    const geojson = { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection;

    const handlePress = (e: { features: GeoJSON.Feature[] }) => {
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
    };

    return (
      <>
        <Images images={imagesMap} />
        <ShapeSource id="point-images-source" shape={geojson} onPress={handlePress}>
          <SymbolLayer
            id="point-images-layer"
            style={{
              iconImage: ['get', 'iconImage'],
              iconSize: 0.4,
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconAnchor: 'bottom',
              iconOffset: [0, -16],
              symbolSortKey: ['get', 'sortKey'],
            }}
          />
        </ShapeSource>
      </>
    );
  },
  (previous, next) =>
    previous.bangumis === next.bangumis &&
    previous.onPointSelect === next.onPointSelect &&
    previous.visible.length === next.visible.length &&
    previous.visible.every((item, index) => item === next.visible[index]),
);

export default function PointImageMarkers({
  bangumis,
  zoom,
  bounds,
  onPointSelect,
  selectedBangumiIds,
  openedBangumiDetailsId,
  ignoreZoomThreshold = false,
  selectedPoint,
}: Props) {
  const storedOpenedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const storedSelectedMapBangumiIds = useMapBangumiFilter((state) => state.selectedBangumiIds);
  const activeOpenedBangumiDetailsId =
    openedBangumiDetailsId === undefined ? storedOpenedBangumiDetailsId : openedBangumiDetailsId;
  const activeSelectedBangumiIds = selectedBangumiIds ?? storedSelectedMapBangumiIds;
  const isFilterActive = activeOpenedBangumiDetailsId !== null || activeSelectedBangumiIds.length > 0;
  const settledZoom = useDebounce(ignoreZoomThreshold ? 0 : zoom, { wait: IMAGE_MARKER_UPDATE_DELAY_MS });
  const settledBounds = useDebounce(ignoreZoomThreshold ? null : bounds, { wait: IMAGE_MARKER_UPDATE_DELAY_MS });
  const imageZoom = ignoreZoomThreshold ? zoom : settledZoom;
  const imageBounds = ignoreZoomThreshold ? bounds : settledBounds;

  const zoomThreshold = isFilterActive
    ? FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE
    : MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE;
  // zoom >= threshold 开始出图；稀疏曲线以 threshold + 偏移 为基准级（最低 priority 门槛为 3），
  // 之后每降低一级 zoom，最低 priority 门槛翻倍。
  const imagePriorityBaseZoom = zoomThreshold + MAP_IMAGE_PRIORITY_BASE_ZOOM_OFFSET;
  const belowZoomThreshold = !ignoreZoomThreshold && (imageZoom < zoomThreshold || !imageBounds);
  const minimumImagePriority = ignoreZoomThreshold ? 0 : 3 * 2 ** (imagePriorityBaseZoom - imageZoom);

  const candidates = useMemo(() => {
    if (belowZoomThreshold) return [];
    const items: ImageMarkerCandidate[] = [];
    const selectedIds = new Set(activeSelectedBangumiIds);

    for (const b of bangumis) {
      if (activeOpenedBangumiDetailsId !== null && b.id !== activeOpenedBangumiDetailsId) continue;
      if (activeOpenedBangumiDetailsId === null && selectedIds.size > 0 && !selectedIds.has(b.id)) continue;
      for (const p of b.points) {
        if (!p.image) continue;
        if (p.geo[0] === 0 && p.geo[1] === 0) continue;
        if (!ignoreZoomThreshold && p.priority < minimumImagePriority) continue;
        items.push({
          point: p,
          bangumi: b,
          imageUrl: buildImageUrl(p.image, 'plan=h160'),
          order: items.length,
        });
      }
    }

    return items;
  }, [activeOpenedBangumiDetailsId, activeSelectedBangumiIds, bangumis, belowZoomThreshold, ignoreZoomThreshold, minimumImagePriority]);
  const byLatitude = useMemo(
    () =>
      candidates.filter((item) => Number.isFinite(item.point.geo[0])).sort((a, b) => a.point.geo[0] - b.point.geo[0]),
    [candidates],
  );
  const visible = belowZoomThreshold ? [] : getVisibleCandidates(candidates, byLatitude, imageBounds, selectedPoint);

  if (visible.length === 0) return null;
  return <PointImageLayer visible={visible} bangumis={bangumis} onPointSelect={onPointSelect} />;
}
