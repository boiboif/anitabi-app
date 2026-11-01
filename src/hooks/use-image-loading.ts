import { createImageLoadController } from '@/utils/image-load-controller';
import type { Image } from 'expo-image';
import { useEffect, useState, useSyncExternalStore } from 'react';

/** The caller keys the owning component by source identity so changing images cancels pending work. */
export function useImageLoading() {
  const [{ controller, imageRef }] = useState(() => {
    let image: Image | null = null;
    return {
      controller: createImageLoadController({
        reload: () => {
          if (!image) throw new Error('Image is no longer mounted');
          return image.reloadAsync();
        },
      }),
      imageRef: (instance: Image | null) => {
        image = instance;
      },
    };
  });
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);

  return { ...snapshot, controller, imageRef };
}
