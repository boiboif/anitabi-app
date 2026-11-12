export type MapScreenRect = { x: number; y: number; width: number; height: number };

const POPUP_CLEARANCE = 16;

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

  // Apply clearance only when a move is already needed. If the available
  // space is too small, retain the original full-visibility fallback below.
  const minX = half + POPUP_CLEARANCE;
  const maxX = map.width - half - POPUP_CLEARANCE;
  const minY = popup.height + POPUP_CLEARANCE;
  const maxY = map.height - POPUP_CLEARANCE;
  if (minX <= maxX && minY <= maxY) {
    const expanded = obstacles.map((rect) => ({
      x: rect.x - POPUP_CLEARANCE,
      y: rect.y - POPUP_CLEARANCE,
      width: rect.width + POPUP_CLEARANCE * 2,
      height: rect.height + POPUP_CLEARANCE * 2,
    }));
    const xs = [anchor.x, minX, maxX];
    const ys = [anchor.y, minY, maxY];
    for (const rect of expanded) {
      xs.push(rect.x - half, rect.x + rect.width + half);
      ys.push(rect.y, rect.y + rect.height + popup.height);
    }
    let best: { x: number; y: number } | null = null;
    let bestDistance = Infinity;
    for (const candidateX of xs) for (const candidateY of ys) {
      const x = clamp(candidateX, minX, maxX);
      const y = clamp(candidateY, minY, maxY);
      const intersects = expanded.some((rect) =>
        x + half > rect.x && x - half < rect.x + rect.width &&
        y > rect.y && y - popup.height < rect.y + rect.height);
      if (intersects) continue;
      const distance = (x - anchor.x) ** 2 + (y - anchor.y) ** 2;
      if (distance < bestDistance) {
        best = { x: x - anchor.x, y: y - anchor.y };
        bestDistance = distance;
      }
    }
    if (best) return best;
  }

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
