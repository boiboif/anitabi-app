import type { Bangumi, Point } from '@/services/types';

import { distanceMeters, isValidCoordinate } from './plan-point-distances';

export type NearbyPoint = { point: Point; bangumi: Bangumi; distanceMeters: number };

/** Find up to three screenshot-bearing points within the map's active work filter. */
export function findNearbyPoints(
  bangumis: readonly Bangumi[],
  geo: readonly [number, number],
  filteredBangumiId: number | null,
  selectedBangumiIds: readonly number[],
): NearbyPoint[] {
  const [latitude, longitude] = geo;
  if (!isValidCoordinate(latitude, longitude)) return [];

  const selectedIds = new Set(selectedBangumiIds);
  const nearest: NearbyPoint[] = [];
  for (const bangumi of bangumis) {
    if (filteredBangumiId !== null ? bangumi.id !== filteredBangumiId : selectedIds.size > 0 && !selectedIds.has(bangumi.id)) {
      continue;
    }
    for (const point of bangumi.points) {
      if (!point.image?.trim()) continue;
      const pointGeo = point.geo;
      if (
        !Array.isArray(pointGeo) ||
        pointGeo.length !== 2 ||
        !isValidCoordinate(pointGeo[0], pointGeo[1]) ||
        (pointGeo[0] === 0 && pointGeo[1] === 0)
      ) continue;

      const distance = distanceMeters(latitude, longitude, pointGeo[0], pointGeo[1]);
      // Insert after equal distances to preserve the order of the map data.
      const index = nearest.findIndex((entry) => entry.distanceMeters > distance);
      if (index < 0) {
        if (nearest.length < 3) nearest.push({ point, bangumi, distanceMeters: distance });
      } else {
        nearest.splice(index, 0, { point, bangumi, distanceMeters: distance });
        if (nearest.length > 3) nearest.pop();
      }
    }
  }
  return nearest;
}

export function formatNearbyDistance(distance: number): string {
  return distance < 1000 ? `${Math.floor(distance)}m` : `${(distance / 1000).toFixed(1)}km`;
}
