export function getPointFlyToZoom(density: number | undefined): number {
  if (density == null || density > 64) return 15;
  if (density > 32) return 16;
  if (density > 16) return 17;
  if (density > 8) return 18;
  if (density > 4) return 19;
  if (density > 2) return 20;
  if (density > 1) return 21;
  return 22;
}

/** Preserve the detail overview's bounds while excluding unusable coordinates. */
export function getBangumiOverviewBounds(points: readonly { geo: [number, number] }[]): {
  ne: [number, number];
  sw: [number, number];
} | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const {
    geo: [lat, lng],
  } of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  return minLat === Infinity ? null : { ne: [maxLng, maxLat], sw: [minLng, minLat] };
}
