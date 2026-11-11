export type MapScreenRect = { x: number; y: number; width: number; height: number };

/** Find the closest position for a bottom-centred popup, avoiding opaque UI. */
export function getPopupAdjustment(
  anchor: { x: number; y: number },
  popup: { width: number; height: number },
  map: { width: number; height: number },
  obstacles: readonly MapScreenRect[],
): { x: number; y: number } {
  const half = popup.width / 2;
  const overlaps = (x: number, y: number) => obstacles.reduce((sum, rect) => sum +
    Math.max(0, Math.min(x + half, rect.x + rect.width) - Math.max(x - half, rect.x)) *
    Math.max(0, Math.min(y, rect.y + rect.height) - Math.max(y - popup.height, rect.y)), 0);
  if (anchor.x - half >= 0 && anchor.x + half <= map.width && anchor.y - popup.height >= 0 &&
    anchor.y <= map.height && overlaps(anchor.x, anchor.y) === 0) return { x: 0, y: 0 };
  const clamp = (value: number, min: number, max: number) =>
    min <= max ? Math.max(min, Math.min(max, value)) : (min + max) / 2;
  // Leave a little room for pixel rounding when moving to a boundary.
  const xs = [anchor.x, half + 1, map.width - half - 1];
  const ys = [anchor.y, popup.height + 1, map.height - 1];
  for (const rect of obstacles) {
    xs.push(rect.x - half - 1, rect.x + rect.width + half + 1);
    ys.push(rect.y - 1, rect.y + rect.height + popup.height + 1);
  }
  let best = { x: 0, y: 0 };
  let bestOverlap = Infinity;
  let bestDistance = Infinity;
  for (const candidateX of xs) for (const candidateY of ys) {
    const x = clamp(candidateX, half, map.width - half);
    const y = clamp(candidateY, popup.height, map.height);
    const overlap = overlaps(x, y);
    const distance = (x - anchor.x) ** 2 + (y - anchor.y) ** 2;
    if (overlap < bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
      best = { x: x - anchor.x, y: y - anchor.y };
      bestOverlap = overlap;
      bestDistance = distance;
    }
  }
  return best;
}
