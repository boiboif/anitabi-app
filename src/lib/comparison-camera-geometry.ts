export type ImageSize = { width: number; height: number };
export type CameraRatioPreference = 'auto' | '4:3' | '16:9' | '3:4' | '9:16' | '1:1';
export const CAMERA_RATIO_OPTIONS: CameraRatioPreference[] = ['auto', '4:3', '16:9', '3:4', '9:16', '1:1'];

const COMMON_RATIOS = [4 / 3, 16 / 9, 1];
const RATIO_TOLERANCE = 0.02;

export function isValidImageSize(size?: ImageSize): size is ImageSize {
  return Boolean(
    size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0,
  );
}

function landscapeRatio(ratio: number) {
  return Math.max(ratio, 1 / ratio);
}

export function ratiosMatch(first: number, second: number) {
  return Math.abs(first / second - 1) < RATIO_TOLERANCE;
}

export function selectCameraRatio(preference: CameraRatioPreference, referenceRatio: number, sizes: ImageSize[]) {
  if (preference !== 'auto') {
    const [width, height] = preference.split(':').map(Number);
    return width / height;
  }
  const target = landscapeRatio(referenceRatio);
  const supported = sizes.filter(isValidImageSize).map((size) => landscapeRatio(size.width / size.height));
  if (supported.some((ratio) => ratiosMatch(ratio, target))) return referenceRatio;

  const common = COMMON_RATIOS.filter((ratio) => supported.some((value) => ratiosMatch(value, ratio)));
  const candidates = common.length ? common : supported.length ? supported : COMMON_RATIOS;
  const closest = candidates.reduce((best, ratio) =>
    Math.abs(Math.log(ratio / target)) < Math.abs(Math.log(best / target)) ? ratio : best,
  );
  return referenceRatio < 1 ? 1 / closest : closest;
}

export function selectPhotoResolution(sizes: ImageSize[], ratio: number): ImageSize | undefined {
  const valid = sizes.filter(isValidImageSize);
  const target = landscapeRatio(ratio);
  const matching = valid.filter((size) => ratiosMatch(landscapeRatio(size.width / size.height), target));
  const candidates = matching.length ? matching : valid;
  return [...candidates].sort((a, b) => {
    if (!matching.length) {
      const distance =
        Math.abs(Math.log(landscapeRatio(a.width / a.height) / target)) -
        Math.abs(Math.log(landscapeRatio(b.width / b.height) / target));
      if (Math.abs(distance) > 0.0001) return distance;
    }
    return b.width * b.height - a.width * a.height;
  })[0];
}

export function formatCameraRatio(ratio: number) {
  for (const label of CAMERA_RATIO_OPTIONS) {
    if (label === 'auto') continue;
    const [width, height] = label.split(':').map(Number);
    if (ratiosMatch(ratio, width / height)) return label;
  }
  return `${Number(ratio.toFixed(2))}:1`;
}

export function fitImageSize(available: ImageSize, ratio: number): ImageSize {
  const width = Math.max(0, Math.min(available.width, available.height * ratio));
  return { width, height: width / ratio };
}

// Both panels share a width and scale down together instead of being split into equal-height boxes.
export function fitComparisonPanels(available: ImageSize, referenceRatio: number, photoRatio: number, gap = 2) {
  const width = Math.max(
    0,
    Math.min(available.width, (available.height - gap) / (1 / referenceRatio + 1 / photoRatio)),
  );
  return { width, referenceHeight: width / referenceRatio, photoHeight: width / photoRatio };
}

export function getCenterCrop(size: ImageSize, ratio: number) {
  const width = Math.max(1, Math.min(Math.floor(size.width), Math.round(size.height * ratio)));
  const height = Math.max(1, Math.min(Math.floor(size.height), Math.round(size.width / ratio)));
  return {
    originX: Math.floor((size.width - width) / 2),
    originY: Math.floor((size.height - height) / 2),
    width,
    height,
  };
}

// Estimate the shared field of view for centered sensor streams. Native stabilization or lens
// corrections can still differ; this needs device validation, not just equal aspect ratios.
export function getSharedSensorRatio(photoSize: ImageSize, previewSize: ImageSize, sensorSize = photoSize) {
  const sensorRatio = landscapeRatio(sensorSize.width / sensorSize.height);
  const region = (size: ImageSize) => {
    const ratio = landscapeRatio(size.width / size.height);
    return { width: Math.min(1, ratio / sensorRatio), height: Math.min(1, sensorRatio / ratio) };
  };
  const photo = region(photoSize);
  const preview = region(previewSize);
  return (sensorRatio * Math.min(photo.width, preview.width)) / Math.min(photo.height, preview.height);
}

export function getCaptureCrop(
  size: ImageSize,
  targetRatio: number,
  sharedSensorRatio: number,
  landscapeOutput = size.width > size.height,
) {
  const sharedRatio = landscapeOutput ? sharedSensorRatio : 1 / sharedSensorRatio;
  const shared = getCenterCrop(size, sharedRatio);
  const crop = getCenterCrop(shared, targetRatio);
  return { ...crop, originX: shared.originX + crop.originX, originY: shared.originY + crop.originY };
}

export function getCameraPreviewLayout(frame: ImageSize, previewSize: ImageSize, sharedSensorRatio: number) {
  // The interface is locked to portrait. The native PreviewView orients its stream to the
  // interface, while the photo and reference follow the settled device rotation separately.
  const source = {
    width: Math.min(previewSize.width, previewSize.height),
    height: Math.max(previewSize.width, previewSize.height),
  };
  const crop = getCaptureCrop(source, frame.width / frame.height, sharedSensorRatio, false);
  const width = (frame.width * source.width) / crop.width;
  const height = (frame.height * source.height) / crop.height;
  return {
    position: 'absolute' as const,
    width,
    height,
    left: (frame.width - width) / 2,
    top: (frame.height - height) / 2,
  };
}
