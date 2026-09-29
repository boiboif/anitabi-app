export const PREVIEW_MAX_SCALE = 6;
export const PREVIEW_BASE_SCALE_EPSILON = 0.001;

type ZoomState = {
  scale: number;
  translateX: number;
  translateY: number;
  containerSize: { width: number; height: number };
  childSize: { width: number; height: number };
};

/** Tap coordinates are relative to the full, untransformed preview viewport. */
export function getPreviewDoubleTapTarget(state: ZoomState, x: number, y: number) {
  if (state.scale > 1 + PREVIEW_BASE_SCALE_EPSILON) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }
  const scale = PREVIEW_MAX_SCALE;
  const currentScale = Math.max(state.scale, PREVIEW_BASE_SCALE_EPSILON);
  const focalX = (x - state.containerSize.width / 2 - state.translateX) / currentScale;
  const focalY = (y - state.containerSize.height / 2 - state.translateY) / currentScale;
  const boundX = Math.max(0, state.childSize.width * scale - state.containerSize.width) / 2;
  const boundY = Math.max(0, state.childSize.height * scale - state.containerSize.height) / 2;
  return {
    scale,
    translateX: Math.max(-boundX, Math.min(boundX, state.translateX - focalX * (scale - currentScale))),
    translateY: Math.max(-boundY, Math.min(boundY, state.translateY - focalY * (scale - currentScale))),
  };
}

export function getPreviewPageTarget(index: number, count: number, distance: number, velocity: number, width: number) {
  'worklet';
  const projected = distance + velocity * 0.15;
  const shouldAdvance = Math.abs(distance) > width * 0.25 || (Math.abs(distance) > 18 && Math.abs(velocity) > 650);
  const direction = shouldAdvance ? (projected < 0 ? 1 : -1) : 0;
  return Math.max(0, Math.min(count - 1, index + direction));
}
