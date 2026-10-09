import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { CameraPhotoOutput } from 'react-native-vision-camera';
import { getCaptureCrop } from './comparison-camera-geometry';

// This is a native HybridObject setter, not a mutation of React state.
export function setComparisonPhotoOrientation(output: CameraPhotoOutput, rotation: string) {
  output.outputOrientation =
    rotation === '90deg' ? 'right' : rotation === '270deg' ? 'left' : rotation === '180deg' ? 'down' : 'up';
}

export async function prepareComparisonPhoto(
  uri: string,
  ratio: number,
  sharedSensorRatio: number,
  landscapeOutput: boolean,
) {
  // Render first so EXIF rotation/mirroring has been applied before using pixel coordinates.
  const context = ImageManipulator.manipulate(uri);
  try {
    const upright = await context.renderAsync();
    try {
      const cropContext = ImageManipulator.manipulate(upright);
      try {
        cropContext.crop(getCaptureCrop(upright, ratio, sharedSensorRatio, landscapeOutput));
        const cropped = await cropContext.renderAsync();
        try {
          return await cropped.saveAsync({ compress: 1, format: SaveFormat.JPEG });
        } finally {
          cropped.release();
        }
      } finally {
        cropContext.release();
      }
    } finally {
      upright.release();
    }
  } finally {
    context.release();
  }
}
