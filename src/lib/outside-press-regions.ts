export type WindowRect = { x: number; y: number; width: number; height: number };

// Four non-overlapping rectangles cover the viewport except for the inline control.
// All returned coordinates are relative to the Portal's viewport, not the window.
export function getOutsidePressRegions(viewport: WindowRect, content: WindowRect): WindowRect[] {
  const clampX = (x: number) => Math.max(0, Math.min(viewport.width, x - viewport.x));
  const clampY = (y: number) => Math.max(0, Math.min(viewport.height, y - viewport.y));
  const left = clampX(content.x);
  const top = clampY(content.y);
  const right = clampX(content.x + content.width);
  const bottom = clampY(content.y + content.height);
  return [
    { x: 0, y: 0, width: viewport.width, height: top },
    { x: 0, y: bottom, width: viewport.width, height: viewport.height - bottom },
    { x: 0, y: top, width: left, height: bottom - top },
    { x: right, y: top, width: viewport.width - right, height: bottom - top },
  ].filter((rect) => rect.width > 0 && rect.height > 0);
}
