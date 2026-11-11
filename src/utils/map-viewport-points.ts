import { MAP_ICON_ZOOM_THRESHOLD } from '@/lib/constants';
import type { Bangumi, Point } from '@/services/types';

import { createMapViewportContainsPoint, type MapViewportState } from './map-viewport';
import { distanceMeters, isValidCoordinate } from './plan-point-distances';

export type ViewportImagePoint = { point: Point; bangumi: Bangumi; distanceMeters: number };

/** Keep image candidates aligned with the map's work filter and visible footprint. */
export function findViewportImagePoints(
  bangumis: readonly Bangumi[],
  viewport: MapViewportState,
  filteredBangumiId: number | null,
  selectedBangumiIds: readonly number[],
): ViewportImagePoint[] {
  const { center, bounds, footprint, zoom } = viewport;
  // World copies may report an unwrapped camera longitude; keep viewport geometry intact.
  const centerLongitude = center ? ((center[0] + 180) % 360 + 360) % 360 - 180 : NaN;
  if (
    !center ||
    !bounds ||
    !Number.isFinite(zoom) ||
    zoom < MAP_ICON_ZOOM_THRESHOLD ||
    !isValidCoordinate(center[1], centerLongitude)
  ) return [];

  const containsPoint = createMapViewportContainsPoint(bounds, footprint);
  const selectedIds = new Set(selectedBangumiIds);
  const candidates: ViewportImagePoint[] = [];
  for (const bangumi of bangumis) {
    if (filteredBangumiId !== null ? bangumi.id !== filteredBangumiId : selectedIds.size > 0 && !selectedIds.has(bangumi.id)) {
      continue;
    }
    for (const point of bangumi.points) {
      const geo = point.geo;
      if (
        !point.image ||
        !Array.isArray(geo) ||
        geo.length !== 2 ||
        !isValidCoordinate(geo[0], geo[1]) ||
        (geo[0] === 0 && geo[1] === 0) ||
        !containsPoint(geo)
      ) continue;

      candidates.push({ point, bangumi, distanceMeters: distanceMeters(center[1], centerLongitude, geo[0], geo[1]) });
    }
  }
  return candidates.sort((a, b) => {
    const distance = a.distanceMeters - b.distanceMeters;
    if (distance !== 0) return distance;
    if (a.point.id !== b.point.id) return a.point.id < b.point.id ? -1 : 1;
    return a.bangumi.id - b.bangumi.id;
  });
}
