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
