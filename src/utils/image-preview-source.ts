type Rect = { x: number; y: number; width: number; height: number };

export type PreviewTouchCoordinates = {
  pageX: number;
  pageY: number;
  locationX: number;
  locationY: number;
};

/** Native touch coordinates include sheet/annotation offsets missing from Fabric's layout tree. */
export function getPreviewContainerOrigin(touch?: PreviewTouchCoordinates) {
  if (!touch) return null;
  const { pageX, pageY, locationX, locationY } = touch;
  if (![pageX, pageY, locationX, locationY].every(Number.isFinite)) return null;
  // Accessibility activation may synthesize an event without a physical touch.
  if (pageX === 0 && pageY === 0 && locationX === 0 && locationY === 0) return null;
  return { x: pageX - locationX, y: pageY - locationY };
}

/** Window coordinates of a centered source image and its optional clipping view. */
export type ImagePreviewBounds = Rect & {
  contentFit?: 'contain' | 'cover';
  borderRadius?: number;
  clip?: Rect;
};

export function getPreviewSourceGeometry(
  image: { width: number; height: number },
  viewport: { width: number; height: number },
  source: ImagePreviewBounds | null | undefined,
) {
  if (!source) return null;
  const clip = source.clip ?? source;
  if (
    ![source.x, source.y, source.width, source.height, clip.x, clip.y, clip.width, clip.height].every(
      Number.isFinite,
    ) ||
    source.width <= 0 ||
    source.height <= 0 ||
    clip.width <= 0 ||
    clip.height <= 0 ||
    image.width <= 0 ||
    image.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    clip.x + clip.width <= 0 ||
    clip.y + clip.height <= 0 ||
    clip.x >= viewport.width ||
    clip.y >= viewport.height
  )
    return null;

  const fit = source.contentFit === 'cover' ? Math.max : Math.min;
  const sourceScale = fit(source.width / image.width, source.height / image.height);
  const previewScale = Math.min(viewport.width / image.width, viewport.height / image.height);
  return {
    transform: {
      x: source.x + source.width / 2 - viewport.width / 2,
      y: source.y + source.height / 2 - viewport.height / 2,
      scale: sourceScale / previewScale,
    },
    clip:
      source.contentFit === 'cover' || source.clip
        ? { x: clip.x, y: clip.y, width: clip.width, height: clip.height, borderRadius: source.borderRadius ?? 0 }
        : null,
  };
}
