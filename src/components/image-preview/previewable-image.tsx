import ImagePreview, { type ImagePreviewBounds, type PreviewImage } from '@/components/image-preview/image-preview';
import { StrictButton } from '@/components/ui/strict-button';
import { useImageLoading } from '@/hooks/use-image-loading';
import { getPreviewContainerOrigin, type PreviewTouchCoordinates } from '@/utils/image-preview-source';
import { RefreshCw } from '@tamagui/lucide-icons-2';
import { Image, type ImageProps, type ImageSource } from 'expo-image';
import { memo, type ComponentProps, type ComponentRef, type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LayoutRectangle, StyleProp, ViewInstance, ViewStyle } from 'react-native';
import { GestureDetector, Pressable, useTapGesture } from 'react-native-gesture-handler';
import { View, YStack } from 'tamagui';

const TRIGGER_STYLE = { flexGrow: 1 } as const;

export type PreviewableImageProps = Omit<ImageProps, 'source' | 'contentFit' | 'contentPosition' | 'children'> & {
  source: ImageSource & { uri: string };
  /** Full-size image URI. Omit for a non-interactive placeholder image. */
  previewUri?: string;
  /** Lower-resolution fallback while the displayed thumbnail is still loading. */
  previewFallbackUri?: string;
  contentFit?: 'cover' | 'contain';
  /** Layout of the image wrapper; `style` still belongs to the Image. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Non-interactive image annotation, replaced by the retry control on load failure. */
  overlay?: ReactNode;
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
  overlay,
  previewBorderRadius = 0,
  maxPressDistance,
  accessibilityLabel,
  accessibilityHint,
  onLoad,
  onLoadStart,
  onError,
  onLayout,
  ...imageProps
}: PreviewableImageProps) {
  const { t } = useTranslation();
  const { phase, controller, imageRef } = useImageLoading();
  const containerRef = useRef<Pick<ViewInstance, 'measureInWindow'> | null>(null);
  const containerLayoutRef = useRef<LayoutRectangle | null>(null);
  const imageLayoutRef = useRef<LayoutRectangle | null>(null);
  const dimensionsRef = useRef<{ width: number; height: number } | null>(null);
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
    if (!previewUri || session || openingRef.current) return;
    openingRef.current = true;
    measureSource(() => {
      const thumbnailUri = controller.getSnapshot().hasContent ? source.uri : (previewFallbackUri ?? source.uri);
      const images = [{ id: previewUri, uri: previewUri, thumbnailUri, ...dimensionsRef.current }];
      controller.beginRecovery(images);
      setSession(images);
    }, touch);
  };

  const triggerProps = {
    ref: (node: ViewInstance | ComponentRef<typeof View> | null) => {
      // Both trigger variants expose native measurement; Tamagui 2's ref type still names the View component.
      containerRef.current = node as Pick<ViewInstance, 'measureInWindow'> | null;
    },
    onLayout: (event) => {
      containerLayoutRef.current = event.nativeEvent.layout;
    },
    style: containerStyle ? TRIGGER_STYLE : undefined,
    collapsable: false,
    accessible: !!previewUri || !!accessibilityLabel,
    accessibilityRole: previewUri ? 'button' : 'image',
    accessibilityLabel,
    accessibilityHint,
  } satisfies ComponentProps<typeof Pressable>;
  const image = (
    <Image
      {...imageProps}
      ref={imageRef}
      source={source}
      contentFit={contentFit}
      contentPosition="center"
      placeholderContentFit={placeholderContentFit}
      cachePolicy={cachePolicy}
      transition={transition}
      accessible={false}
      onLoadStart={() => {
        controller.onLoadStart();
        onLoadStart?.();
      }}
      onLoad={(event) => {
        controller.onLoad();
        const { width, height } = event.source;
        if (width > 0 && height > 0) dimensionsRef.current = { width, height };
        onLoad?.(event);
      }}
      onError={(event) => {
        if (source.uri) controller.onError();
        onError?.(event);
      }}
      onLayout={(event) => {
        imageLayoutRef.current = event.nativeEvent.layout;
        onLayout?.(event);
      }}
    />
  );

  return (
    <>
      <View
        position="relative"
        self={containerStyle ? undefined : 'flex-start'}
        // Tamagui 2's style declarations do not include all of RN 0.88's StyleProp values.
        style={containerStyle as ComponentProps<typeof View>['style']}
      >
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
        {phase !== 'error' ? overlay : null}
        {phase === 'error' ? (
          <YStack fullscreen items="center" justify="center" pointerEvents="box-none">
            <StrictButton
              size="$2"
              fontSize="$caption"
              px="$2"
              bg="$background"
              rounded="$2"
              icon={<RefreshCw size={14} />}
              accessibilityLabel={`${t('imagePreviewLoadFailed')}. ${t('retry')}`}
              accessibilityHint={accessibilityLabel}
              onPress={controller.retry}
            >
              {t('retry')}
            </StrictButton>
          </YStack>
        ) : null}
      </View>
      {session ? (
        <ImagePreview
          visible
          images={session}
          getSourceBounds={() => boundsRef.current}
          onImageLoad={() => controller.confirmRecovery(session)}
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
