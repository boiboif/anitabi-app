import {
  FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE,
  MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE,
  MAP_IMAGE_PRIORITY_BASE_ZOOM_OFFSET,
  SELECTED_MAP_POINT_LAYER_ID,
} from '@/lib/constants';
import { buildImageUrl } from '@/services/handlers';
import { logStartupDuration, startupNow } from '@/lib/startup-timing';
import type { Bangumi, Point } from '@/services/types';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { useMapBrowse } from '@/store/use-map-browse';
import { getStableMapImageSortKeys } from '@/utils/map-image-sort';
import { Images, ShapeSource } from '@rnmapbox/maps';
import { useDebounce } from 'ahooks';
import { memo, useMemo } from 'react';
import type { Bounds } from './map-container';
import { SelectableSymbolLayer } from './map-marker-selection';

const IMAGE_MARKER_UPDATE_DELAY_MS = 600;

type Props = {
  bangumis: Bangumi[];
  zoom: number;
  bounds: Bounds | null;
  onPointSelect?: (point: Point, bangumi: Bangumi, screenPoint: { x: number; y: number }) => void;
  selectedBangumiIds?: number[];
  openedBangumiDetailsId?: number | null;
  ignoreZoomThreshold?: boolean;
};

type ImageMarkerCandidate = {
  point: Point;
  bangumi: Bangumi;
  imageUrl: string;
  order: number;
};

type ImageMarkerIndex = {
  candidates: ImageMarkerCandidate[];
  byLatitude: ImageMarkerCandidate[];
  stableSortKeys: Uint32Array;
};

type LayerProps = {
  visible: ImageMarkerCandidate[];
  bangumis: Bangumi[];
  onPointSelect?: Props['onPointSelect'];
  stableSortKeys: Uint32Array;
};

/** 判断点位是否在可视区域内 */
function isInBounds(geo: [number, number], bounds: Bounds): boolean {
  const [lat, lng] = geo;
  const [swLng, swLat] = bounds.sw;
  const [neLng, neLat] = bounds.ne;
  return lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng;
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
): ImageMarkerCandidate[] {
  if (!bounds) return candidates;
  const south = bounds.sw[1];
  const north = bounds.ne[1];
  if (south > north) return [];

  // Keep the original full-scan path for unusual bounds and wide viewports.
  if (!Number.isFinite(south) || !Number.isFinite(north)) {
    return candidates.filter((item) => isInBounds(item.point.geo, bounds));
  }
  const start = firstLatitudeAtLeast(byLatitude, south);
  const end = firstLatitudeAbove(byLatitude, north);
  if (end - start >= candidates.length / 2) {
    return candidates.filter((item) => isInBounds(item.point.geo, bounds));
  }

  const visible: ImageMarkerCandidate[] = [];
  for (let index = start; index < end; index++) {
    const item = byLatitude[index];
    if (isInBounds(item.point.geo, bounds)) visible.push(item);
  }
  // Symbol order and duplicate image keys must match the original data order.
  return visible.sort((a, b) => a.order - b.order);
}

const imageMarkerIndexCache = new WeakMap<Bangumi[], ImageMarkerIndex>();

function getImageMarkerIndex(bangumis: Bangumi[]): ImageMarkerIndex {
  const cached = imageMarkerIndexCache.get(bangumis);
  if (cached) return cached;

  const startedAt = startupNow();

  const candidates: ImageMarkerCandidate[] = [];
  for (const bangumi of bangumis) {
    for (const point of bangumi.points) {
      if (!point.image || (point.geo[0] === 0 && point.geo[1] === 0)) continue;
      candidates.push({
        point,
        bangumi,
        imageUrl: buildImageUrl(point.image, 'plan=h160'),
        order: candidates.length,
      });
    }
  }

  const byLatitude = candidates
    .filter((item) => Number.isFinite(item.point.geo[0]))
    .sort((a, b) => a.point.geo[0] - b.point.geo[0] || a.order - b.order);
  const index = { candidates, byLatitude, stableSortKeys: getStableMapImageSortKeys(byLatitude, candidates.length) };
  imageMarkerIndexCache.set(bangumis, index);
  logStartupDuration('point-image-index', startedAt, { count: candidates.length });
  return index;
}

const PointImageLayer = memo(
  function PointImageLayer({ visible, bangumis, onPointSelect, stableSortKeys }: LayerProps) {
    const imagesMap: Record<string, { uri: string }> = {};
    const features: GeoJSON.Feature[] = [];
    for (const item of visible) {
      const key = `point_img_${item.point.id}`;
      const stableSortKey = stableSortKeys[item.order];
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
          sortKey: stableSortKey ? stableSortKey - 1 : -item.point.geo[0],
        },
      });
    }
    const geojson = { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection;

    const handlePress = (e: { features: GeoJSON.Feature[]; point: { x: number; y: number } }) => {
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
    };

    return (
      <>
        <Images images={imagesMap} />
        <ShapeSource id="point-images-source" shape={geojson} onPress={handlePress} hitbox={{ width: 0, height: 0 }}>
          <SelectableSymbolLayer
            id="point-images-layer"
            belowLayerID={SELECTED_MAP_POINT_LAYER_ID}
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
    previous.stableSortKeys === next.stableSortKeys &&
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
}: Props) {
  const storedOpenedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const storedSelectedMapBangumiIds = useMapBangumiFilter((state) => state.selectedBangumiIds);
  const activeOpenedBangumiDetailsId =
    openedBangumiDetailsId === undefined ? storedOpenedBangumiDetailsId : openedBangumiDetailsId;
  const activeSelectedBangumiIds = selectedBangumiIds ?? storedSelectedMapBangumiIds;
  const isFilterActive = activeOpenedBangumiDetailsId !== null || activeSelectedBangumiIds.length > 0;
  // useDebounce depends on reference identity. Keep zoom and bounds in one stable
  // snapshot so an update cannot combine a new zoom with an old viewport.
  const viewport = useMemo(() => ({ zoom, bounds }), [zoom, bounds]);
  const settledViewport = useDebounce(ignoreZoomThreshold ? null : viewport, { wait: IMAGE_MARKER_UPDATE_DELAY_MS });
  const imageZoom = ignoreZoomThreshold ? zoom : (settledViewport?.zoom ?? zoom);
  const imageBounds = ignoreZoomThreshold ? bounds : (settledViewport?.bounds ?? null);

  const zoomThreshold = isFilterActive
    ? FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE
    : MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE;
  // zoom >= threshold 开始出图；稀疏曲线以 threshold + 偏移 为基准级（最低 priority 门槛为 3），
  // 之后每降低一级 zoom，最低 priority 门槛翻倍。
  const imagePriorityBaseZoom = zoomThreshold + MAP_IMAGE_PRIORITY_BASE_ZOOM_OFFSET;
  const belowZoomThreshold = !ignoreZoomThreshold && (imageZoom < zoomThreshold || !imageBounds);
  const minimumImagePriority = ignoreZoomThreshold ? 0 : 3 * 2 ** (imagePriorityBaseZoom - imageZoom);

  // Cache by dataset identity so zoom, filtering and marker toggles reuse one index.
  const { candidates, byLatitude, stableSortKeys } = useMemo(() => getImageMarkerIndex(bangumis), [bangumis]);
  // Match the website's order: query the viewport first, then apply sparsity to
  // those points. Filtering preserves candidate references for PointImageLayer.
  // Selection must not rerun the viewport search or invalidate the source payload.
  const visible = useMemo(() => {
    const inBounds = belowZoomThreshold ? [] : getVisibleCandidates(candidates, byLatitude, imageBounds);
    const selectedIds = new Set(activeSelectedBangumiIds);
    return inBounds.filter((item) => {
      if (activeOpenedBangumiDetailsId !== null && item.bangumi.id !== activeOpenedBangumiDetailsId) return false;
      if (activeOpenedBangumiDetailsId === null && selectedIds.size > 0 && !selectedIds.has(item.bangumi.id))
        return false;
      return ignoreZoomThreshold || !(item.point.priority < minimumImagePriority);
    });
  }, [
    belowZoomThreshold,
    candidates,
    byLatitude,
    imageBounds,
    activeSelectedBangumiIds,
    activeOpenedBangumiDetailsId,
    ignoreZoomThreshold,
    minimumImagePriority,
  ]);

  if (visible.length === 0) return null;
  return (
    <PointImageLayer
      visible={visible}
      bangumis={bangumis}
      onPointSelect={onPointSelect}
      stableSortKeys={stableSortKeys}
    />
  );
}
