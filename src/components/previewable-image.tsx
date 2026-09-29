import ImagePreview, { type ImagePreviewBounds, type PreviewImage } from '@/components/image-preview';
import { getPreviewContainerOrigin, type PreviewTouchCoordinates } from '@/utils/image-preview-source';
import { Image, type ImageProps, type ImageSource } from 'expo-image';
import { memo, type ComponentProps, useEffect, useRef, useState } from 'react';
import type { LayoutRectangle, StyleProp, View as NativeView, ViewStyle } from 'react-native';
import { GestureDetector, Pressable, useTapGesture } from 'react-native-gesture-handler';
import { View } from 'tamagui';

export type PreviewableImageProps = Omit<ImageProps, 'source' | 'contentFit' | 'contentPosition' | 'children'> & {
  source: ImageSource & { uri: string };
  /** Full-size image URI. Omit for a non-interactive placeholder image. */
  previewUri?: string;
  /** Lower-resolution fallback while the displayed thumbnail is still loading. */
  previewFallbackUri?: string;
  contentFit?: 'cover' | 'contain';
  /** Layout of the measuring wrapper; `style` still belongs to the Image. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Radius of the surrounding card's clipping view, used during the transition. */
  previewBorderRadius?: number;
  /** Explicit drag rejection for native containers that do not cancel Pressable. */
  maxPressDistance?: number;
};

function TapPreviewTrigger({
  onPress,
  enabled,
  maxDistance,
  ...props
}: Omit<ComponentProps<typeof View>, 'onPress'> & {
  onPress: (touch?: PreviewTouchCoordinates) => void;
  enabled: boolean;
  maxDistance: number;
}) {
  const tap = useTapGesture({
    enabled,
    maxDistance,
    runOnJS: true,
    onDeactivate: (event) => {
      if (!event.canceled)
        onPress({
          pageX: event.absoluteX,
          pageY: event.absoluteY,
          locationX: event.x,
          locationY: event.y,
        });
    },
  });

  return (
    <GestureDetector gesture={tap}>
      <View
        {...props}
        onAccessibilityTap={enabled ? () => onPress() : undefined}
        accessibilityActions={enabled ? [{ name: 'activate' }] : undefined}
        onAccessibilityAction={(event) => {
          if (enabled && event.nativeEvent.actionName === 'activate') onPress();
        }}
      />
    </GestureDetector>
  );
}

function PreviewableImageContent({
  source,
  previewUri,
  previewFallbackUri,
  contentFit = 'cover',
  placeholderContentFit = contentFit,
  cachePolicy = 'memory-disk',
  transition = 0,
  containerStyle,
  previewBorderRadius = 0,
  maxPressDistance,
  accessibilityLabel,
  accessibilityHint,
  onLoad,
  onLayout,
  ...imageProps
}: PreviewableImageProps) {
  const containerRef = useRef<NativeView>(null);
  const containerLayoutRef = useRef<LayoutRectangle | null>(null);
  const imageLayoutRef = useRef<LayoutRectangle | null>(null);
  const dimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const sourceLoadedRef = useRef(false);
  const boundsRef = useRef<ImagePreviewBounds | null>(null);
  const mountedRef = useRef(true);
  const openingRef = useRef(false);
  const [session, setSession] = useState<PreviewImage[] | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const measureSource = (onMeasured: () => void, touch?: PreviewTouchCoordinates) => {
    const origin = getPreviewContainerOrigin(touch);
    const finish = (x: number, y: number, width: number, height: number) => {
      openingRef.current = false;
      const layout = imageLayoutRef.current;
      if (!mountedRef.current) return;
      boundsRef.current =
        layout && width > 0 && height > 0 && layout.width > 0 && layout.height > 0
          ? {
              x: x + layout.x,
              y: y + layout.y,
              width: layout.width,
              height: layout.height,
              contentFit,
              borderRadius: previewBorderRadius,
              clip: { x, y, width, height },
            }
          : null;
      onMeasured();
    };
    const layout = containerLayoutRef.current;
    // Physical touches already provide the current window origin, including
    // native sheet/map offsets. Layout supplies size without another bridge trip.
    if (origin && layout) finish(origin.x, origin.y, layout.width, layout.height);
    else if (containerRef.current) containerRef.current.measureInWindow(finish);
    else finish(0, 0, 0, 0);
  };

  const openPreview = (touch?: PreviewTouchCoordinates) => {
    const dimensions = dimensionsRef.current;
    if (!previewUri || session || openingRef.current) return;
    openingRef.current = true;
    measureSource(() => {
      const thumbnailUri = sourceLoadedRef.current ? source.uri : (previewFallbackUri ?? source.uri);
      setSession([{ id: previewUri, uri: previewUri, thumbnailUri, ...dimensions }]);
    }, touch);
  };

  const triggerProps = {
    ref: containerRef,
    onLayout: (event) => {
      containerLayoutRef.current = event.nativeEvent.layout;
    },
    style: containerStyle,
    collapsable: false,
    accessible: !!previewUri || !!accessibilityLabel,
    accessibilityRole: previewUri ? 'button' : 'image',
    accessibilityLabel,
    accessibilityHint,
  } satisfies ComponentProps<typeof View>;
  const image = (
    <Image
      {...imageProps}
      source={source}
      contentFit={contentFit}
      contentPosition="center"
      placeholderContentFit={placeholderContentFit}
      cachePolicy={cachePolicy}
      transition={transition}
      accessible={false}
      onLoad={(event) => {
        sourceLoadedRef.current = true;
        const { width, height } = event.source;
        if (width > 0 && height > 0) dimensionsRef.current = { width, height };
        onLoad?.(event);
      }}
      onLayout={(event) => {
        imageLayoutRef.current = event.nativeEvent.layout;
        onLayout?.(event);
      }}
    />
  );

  return (
    <>
      {maxPressDistance === undefined ? (
        <Pressable {...triggerProps} disabled={!previewUri} onPress={(event) => openPreview(event.nativeEvent)}>
          {image}
        </Pressable>
      ) : (
        <TapPreviewTrigger
          {...triggerProps}
          enabled={!!previewUri}
          maxDistance={maxPressDistance}
          onPress={openPreview}
        >
          {image}
        </TapPreviewTrigger>
      )}
      {session ? (
        <ImagePreview
          visible
          images={session}
          getSourceBounds={() => boundsRef.current}
          onClose={() => setSession(null)}
        />
      ) : null}
    </>
  );
}

// A card can change its outer interaction state without re-sending image props to the native view.
const MemoizedPreviewableImageContent = memo(PreviewableImageContent);

/** Reset measurements and pending callbacks when a recycled card changes image. */
export default function PreviewableImage(props: PreviewableImageProps) {
  // Preview availability can change without changing the thumbnail identity.
  return <MemoizedPreviewableImageContent key={JSON.stringify([props.source.uri, props.recyclingKey])} {...props} />;
}
