import { createImageLoadController } from '@/utils/image-load-controller';
import { Image } from 'expo-image';

type Callbacks = {
  onLoad: () => void;
  onSettled: () => void;
};

/** Prefetch with the same bounded retry policy as displayed images. */
export function prefetchImageWithRetry(uri: string, { onLoad, onSettled }: Callbacks): () => void {
  let active = true;
  const controller = createImageLoadController({ reload: loadImage });
  const unsubscribe = controller.subscribe(() => {
    if (controller.getSnapshot().phase === 'error') finish(false);
  });

  function finish(loaded: boolean) {
    if (!active) return;
    active = false;
    controller.dispose();
    unsubscribe();
    try {
      if (loaded) onLoad();
    } finally {
      onSettled();
    }
  }

  function loadImage(): void {
    if (!active) return;
    controller.onLoadStart();
    try {
      void Image.prefetch(uri, 'memory-disk').then(
        (loaded) => {
          if (!active) return;
          if (loaded === true) {
            controller.onLoad();
            finish(true);
          } else controller.onError();
        },
        () => {
          if (active) controller.onError();
        },
      );
    } catch {
      if (active) controller.onError();
    }
  }

  loadImage();
  return () => {
    active = false;
    controller.dispose();
    unsubscribe();
  };
}
