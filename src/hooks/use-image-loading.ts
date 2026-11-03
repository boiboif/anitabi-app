import { createImageLoadController } from '@/utils/image-load-controller';
import type { Image } from 'expo-image';
import { useEffect, useState, useSyncExternalStore } from 'react';

function createLoadingState(uri?: string) {
  let image: Image | null = null;
  return {
    uri,
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
}

/** Pass the URI when the mounted Image can change sources. */
export function useImageLoading(uri?: string) {
  const [loading, setLoading] = useState(() => createLoadingState(uri));
  // Reset request state before committing the new source, without remounting Image.
  if (loading.uri !== uri) setLoading(createLoadingState(uri));

  const { controller, imageRef } = loading;
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);

  return { ...snapshot, controller, imageRef };
}
