import { isValidImageSize, type ImageSize } from '@/lib/comparison-camera-geometry';
import { prefetchImageWithRetry } from '@/utils/prefetch-image-with-retry';
import { useEffect, useState } from 'react';

type Options = {
  initialReferenceUri?: string;
  fullReferenceUri?: string;
  capturing: boolean;
};

/** Own the reference once so the camera and result share the same original-image request. */
export function useComparisonReferenceImage({ initialReferenceUri, fullReferenceUri, capturing }: Options) {
  const [referenceUri, setReferenceUri] = useState(initialReferenceUri);
  const [referenceDimensions, setReferenceDimensions] = useState<{ uri: string; size: ImageSize }>();
  const prefetchUri =
    !capturing && referenceUri === initialReferenceUri && fullReferenceUri !== initialReferenceUri
      ? fullReferenceUri
      : undefined;
  const [loading, setLoading] = useState({ uri: prefetchUri, visible: false });
  // Each request gets its own delay, including resuming after capture.
  if (loading.uri !== prefetchUri) setLoading({ uri: prefetchUri, visible: false });

  useEffect(() => {
    if (!prefetchUri) return;

    // Cached and quickly loaded images should not flash a loading indicator.
    const loadingTimer = setTimeout(() => setLoading({ uri: prefetchUri, visible: true }), 200);
    const cancelPrefetch = prefetchImageWithRetry(prefetchUri, {
      onLoad: () => {
        setReferenceUri((current) => (current === initialReferenceUri ? prefetchUri : current));
        setReferenceDimensions((current) =>
          current && current.uri === initialReferenceUri ? { ...current, uri: prefetchUri } : current,
        );
      },
      onSettled: () => {
        // Exhausted retries keep the usable thumbnail and its existing ratio.
        clearTimeout(loadingTimer);
        setLoading({ uri: prefetchUri, visible: false });
      },
    });

    return () => {
      cancelPrefetch();
      clearTimeout(loadingTimer);
    };
  }, [prefetchUri, initialReferenceUri]);

  const onReferenceLoad = (size: ImageSize) => {
    if (!referenceUri || !isValidImageSize(size)) return;
    setReferenceDimensions((current) =>
      current?.uri === referenceUri && current.size.width === size.width && current.size.height === size.height
        ? current
        : { uri: referenceUri, size },
    );
  };

  return {
    referenceUri,
    setReferenceUri,
    referenceDimensions,
    onReferenceLoad,
    loadingFullReference: !!prefetchUri && loading.visible,
  };
}
