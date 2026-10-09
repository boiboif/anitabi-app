type ZoomController = {
  readonly minZoom: number;
  readonly maxZoom: number;
  setZoom: (zoom: number) => Promise<void>;
};

export type CameraZoomState = {
  value: number;
  revision: number;
};

/** Restore saved zoom; a stop, reconfiguration, or newer request invalidates this result. */
export async function restoreCameraZoom(
  state: CameraZoomState,
  controller: ZoomController,
  isCurrent: () => boolean,
): Promise<number | undefined> {
  if (!isCurrent()) return;
  const revision = ++state.revision;
  const target = Math.min(controller.maxZoom, Math.max(controller.minZoom, state.value));
  const cancelled = () => revision !== state.revision || !isCurrent();
  try {
    await controller.setZoom(target);
    if (cancelled()) return;
    state.value = target;
    return target;
  } catch (error) {
    if (cancelled()) return;
    throw error;
  }
}
