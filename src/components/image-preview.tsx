import { StrictButton as Button } from '@/components/strict-button';
import PreviewGallery, { type PreviewGalleryRef } from '@/components/image-preview-gallery';
import { useImagePreviewActions } from '@/components/use-image-preview-actions';
import { getPreviewSourceGeometry, type ImagePreviewBounds } from '@/utils/image-preview-source';
import { X } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { fitContainer } from 'react-native-zoom-toolkit';
import { Spinner, Text, XStack, YStack } from 'tamagui';

export type PreviewImage = {
  id: string;
  uri: string;
  thumbnailUri?: string;
  width?: number;
  height?: number;
};

export type { ImagePreviewBounds } from '@/utils/image-preview-source';

export type ImagePreviewProps = {
  visible: boolean;
  images: PreviewImage[];
  initialIndex?: number;
  getSourceBounds?: (index: number) => ImagePreviewBounds | null;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  /** Override the built-in save/share menu when provided. */
  onLongPress?: (image: PreviewImage, index: number) => void;
};

const TRANSITION_DURATION = 240;
const LOADING_INDICATOR_DELAY = 300;
type ImageTransform = { x: number; y: number; scale: number };

function PreviewLoadingIndicator() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Cached images usually finish before this timer, so no spinner is painted.
    const timer = setTimeout(() => setVisible(true), LOADING_INDICATOR_DELAY);
    return () => clearTimeout(timer);
  }, []);
  return visible ? <Spinner color="white" /> : null;
}

function PreviewPage({
  image,
  viewport,
  retry,
  onStatus,
  onDimensions,
  active,
  isClosing,
  galleryTransform,
  closingTransform,
}: {
  image: PreviewImage;
  viewport: { width: number; height: number };
  retry: number;
  onStatus: (status: 'loading' | 'loaded' | 'error') => void;
  onDimensions: (size: { width: number; height: number }) => void;
  active: boolean;
  isClosing: SharedValue<boolean>;
  galleryTransform: SharedValue<ImageTransform>;
  closingTransform: SharedValue<ImageTransform>;
}) {
  const size = image.width && image.height ? fitContainer(image.width / image.height, viewport) : viewport;
  const imageStyle = useAnimatedStyle(() => {
    const closing = isClosing.get();
    const current = galleryTransform.get();
    const target = closingTransform.get();
    // Animate the mounted image itself. Cancel the gallery's live transform so
    // its automatic rebound cannot alter the original dismissal trajectory.
    return {
      opacity: closing && !active ? 0 : 1,
      transform: [
        { translateX: closing && active ? (target.x - current.x) / current.scale : 0 },
        { translateY: closing && active ? (target.y - current.y) / current.scale : 0 },
        { scale: closing && active ? target.scale / current.scale : 1 },
      ],
    };
  });
  return (
    <Animated.View style={imageStyle}>
      <Image
        key={`${image.id}:${retry}`}
        source={{ uri: image.uri }}
        placeholder={image.thumbnailUri ? { uri: image.thumbnailUri } : undefined}
        placeholderContentFit="contain"
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={120}
        accessibilityLabel={image.id}
        onLoadStart={() => onStatus('loading')}
        onLoad={(event) => {
          onDimensions(event.source);
          onStatus('loaded');
        }}
        onError={() => onStatus('error')}
        style={size}
      />
    </Animated.View>
  );
}

function PreviewSession({
  images,
  initialIndex = 0,
  getSourceBounds,
  onClose,
  onIndexChange,
  onLongPress,
}: Omit<ImagePreviewProps, 'visible'>) {
  const { t } = useTranslation();
  const actions = useImagePreviewActions();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const startIndex = Math.max(0, Math.min(Math.trunc(initialIndex) || 0, images.length - 1));
  const [index, setIndex] = useState(startIndex);
  const [viewport, setViewport] = useState({ width: window.width, height: window.height });
  const [shown, setShown] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, 'loading' | 'loaded' | 'error'>>({});
  const [retries, setRetries] = useState<Record<string, number>>({});
  const [loadedDimensions, setLoadedDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const resolvedImages = images.map((image) =>
    image.width && image.height ? image : { ...image, ...loadedDimensions[image.id] },
  );
  const [closing, setClosing] = useState(false);
  const galleryRef = useRef<PreviewGalleryRef>(null);
  const closingRef = useRef(false);
  const closeFrameRef = useRef<number | null>(null);
  const progress = useSharedValue(0);
  const sourceReady = useSharedValue(false);
  const galleryReady = useSharedValue(false);
  const transitionStarted = useSharedValue(false);
  const pull = useSharedValue(0);
  const closeRequested = useSharedValue(false);
  const sourceTransform = useSharedValue({ x: 0, y: 0, scale: 1 });
  const sourceClip = useSharedValue<NonNullable<ReturnType<typeof getPreviewSourceGeometry>>['clip']>(null);
  const useSourceTransition = useSharedValue(false);
  const closingTransform = useSharedValue({ x: 0, y: 0, scale: 1 });
  const closingToSource = useSharedValue(false);
  const isClosing = useSharedValue(false);
  const galleryTransform = useSharedValue<ImageTransform>({ x: 0, y: 0, scale: 1 });
  const activeImage = images[index];
  const status = statuses[activeImage.id] ?? 'loading';

  // Shared by initialization's effect and dismissal; keep the effect dependency stable.
  const updateSourceTransform = useCallback(
    (nextIndex: number, size: typeof viewport) => {
      const geometry = getPreviewSourceGeometry(resolvedImages[nextIndex], size, getSourceBounds?.(nextIndex));
      if (!geometry) {
        useSourceTransition.set(false);
        sourceClip.set(null);
        return;
      }
      sourceTransform.set(geometry.transform);
      sourceClip.set(geometry.clip);
      useSourceTransition.set(true);
    },
    [resolvedImages, getSourceBounds, useSourceTransition, sourceClip, sourceTransform],
  );

  useEffect(() => {
    if (!shown || transitionStarted.get()) return;
    updateSourceTransform(startIndex, viewport);
    sourceReady.set(true);
  }, [shown, startIndex, viewport, updateSourceTransform, sourceReady, transitionStarted]);

  useAnimatedReaction(
    () => sourceReady.get() && galleryReady.get(),
    (ready) => {
      if (!ready || transitionStarted.get() || isClosing.get()) return;
      transitionStarted.set(true);
      progress.set(withTiming(1, { duration: TRANSITION_DURATION }));
    },
  );

  const close = (releasedPull?: number) => {
    if (closingRef.current) return;
    if (!transitionStarted.get()) {
      closingRef.current = true;
      onClose();
      return;
    }
    if (actions.dismissMenu()) return;
    actions.cancel();
    closingRef.current = true;
    setClosing(true);
    closeRequested.set(true);
    const state = galleryRef.current?.getState();
    const openingProgress = progress.get();
    const openingAmount = useSourceTransition.get() ? 1 - openingProgress : 0;
    const openingSource = sourceTransform.get();
    const openingScale = 1 + (openingSource.scale - 1) * openingAmount;
    const from = {
      x: openingSource.x * openingAmount + (state?.translateX ?? 0) * openingScale,
      y: openingSource.y * openingAmount + (releasedPull ?? state?.translateY ?? 0) * openingScale,
      scale: (state?.scale ?? 1) * openingScale,
    };
    updateSourceTransform(index, viewport);
    const toSource = useSourceTransition.get();
    const target = sourceTransform.get();
    // Hand the same image from gallery gestures to dismissal on one UI frame.
    scheduleOnUI(() => {
      'worklet';
      closingToSource.set(toSource);
      closingTransform.set(from);
      isClosing.set(true);
      if (toSource) closingTransform.set(withTiming(target, { duration: TRANSITION_DURATION }));
      progress.set(
        withTiming(0, { duration: TRANSITION_DURATION }, (finished) => {
          if (finished) scheduleOnRN(finishClose);
        }),
      );
    });
  };
  useEffect(
    () => () => {
      if (closeFrameRef.current !== null) cancelAnimationFrame(closeFrameRef.current);
    },
    [],
  );

  const finishClose = () => {
    // Let the final animated layout reach a frame before removing the native Modal.
    closeFrameRef.current = requestAnimationFrame(() => {
      closeFrameRef.current = requestAnimationFrame(() => {
        closeFrameRef.current = null;
        onClose();
      });
    });
  };

  const backgroundStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000',
    opacity: progress.get() * Math.max(0.25, 1 - Math.max(0, pull.get()) / viewport.height),
  }));
  const galleryStyle = useAnimatedStyle(() => {
    const closing = isClosing.get();
    const amount = !closing && useSourceTransition.get() ? 1 - progress.get() : 0;
    return {
      flex: 1,
      opacity: !transitionStarted.get()
        ? 0
        : closing
          ? closingToSource.get()
            ? 1
            : progress.get()
          : useSourceTransition.get()
            ? 1
            : progress.get(),
      transform: [
        { translateX: sourceTransform.get().x * amount },
        { translateY: sourceTransform.get().y * amount },
        { scale: 1 + (sourceTransform.get().scale - 1) * amount },
      ],
    };
  });
  const clipStyle = useAnimatedStyle(() => {
    const clip = sourceClip.get();
    const amount = useSourceTransition.get() && clip ? 1 - progress.get() : 0;
    return {
      position: 'absolute',
      overflow: 'hidden',
      left: (clip?.x ?? 0) * amount,
      top: (clip?.y ?? 0) * amount,
      width: viewport.width + ((clip?.width ?? viewport.width) - viewport.width) * amount,
      height: viewport.height + ((clip?.height ?? viewport.height) - viewport.height) * amount,
      borderRadius: (clip?.borderRadius ?? 0) * amount,
    };
  });
  const clipContentStyle = useAnimatedStyle(() => {
    const clip = sourceClip.get();
    const amount = useSourceTransition.get() && clip ? 1 - progress.get() : 0;
    // Keep the gallery's coordinates and gesture viewport full-screen as the crop opens.
    return {
      position: 'absolute',
      left: -(clip?.x ?? 0) * amount,
      top: -(clip?.y ?? 0) * amount,
      width: viewport.width,
      height: viewport.height,
    };
  });
  const chromeStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: insets.top + 8,
    left: 16,
    right: 16,
    opacity: progress.get() * Math.max(0, 1 - Math.max(0, pull.get()) / 100),
  }));

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={() => setShown(true)}
      onRequestClose={() => close()}
    >
      <StatusBar style="light" />
      <GestureHandlerRootView
        style={{ flex: 1 }}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width <= 0 || height <= 0) return;
          setViewport((previous) =>
            previous.width === width && previous.height === height ? previous : { width, height },
          );
        }}
      >
        <Animated.View pointerEvents="none" style={backgroundStyle} />
        <Animated.View pointerEvents={closing || actions.menuOpen ? 'none' : 'auto'} style={clipStyle}>
          <Animated.View style={clipContentStyle}>
            <Animated.View style={galleryStyle}>
              {shown ? (
                <PreviewGallery
                  ref={galleryRef}
                  data={resolvedImages}
                  initialIndex={startIndex}
                  keyExtractor={(image) => image.id}
                  viewport={viewport}
                  isClosing={isClosing}
                  onTap={() => close()}
                  onIndexChange={(nextIndex) => {
                    if (closingRef.current) return;
                    setIndex(nextIndex);
                    onIndexChange?.(nextIndex);
                  }}
                  onUpdate={({ translateX, translateY, scale, containerSize, childSize }) => {
                    'worklet';
                    galleryTransform.set({ x: translateX, y: translateY, scale });
                    if (!transitionStarted.get())
                      galleryReady.set(
                        Math.abs(containerSize.width - viewport.width) < 1 &&
                          Math.abs(containerSize.height - viewport.height) < 1 &&
                          childSize.width > 1 &&
                          childSize.height > 1,
                      );
                  }}
                  onLongPress={(nextIndex) => {
                    if (closingRef.current) return;
                    if (onLongPress) onLongPress(images[nextIndex], nextIndex);
                    else actions.openMenu(images[nextIndex]);
                  }}
                  onVerticalPull={({ translateY, released, velocityY }) => {
                    'worklet';
                    if (closeRequested.get()) return;
                    pull.set(translateY);
                    if (!released) return;
                    if (translateY > Math.min(140, viewport.height * 0.18) || (translateY > 40 && velocityY > 900)) {
                      closeRequested.set(true);
                      scheduleOnRN(close, translateY);
                      return true;
                    }
                  }}
                  renderItem={(image, pageIndex) => (
                    <PreviewPage
                      image={image}
                      viewport={viewport}
                      retry={retries[image.id] ?? 0}
                      active={pageIndex === index}
                      isClosing={isClosing}
                      galleryTransform={galleryTransform}
                      closingTransform={closingTransform}
                      onDimensions={({ width, height }) => {
                        if (image.width && image.height) return;
                        if (width > 0 && height > 0)
                          setLoadedDimensions((previous) => ({ ...previous, [image.id]: { width, height } }));
                      }}
                      onStatus={(nextStatus) =>
                        setStatuses((previous) =>
                          previous[image.id] === nextStatus ? previous : { ...previous, [image.id]: nextStatus },
                        )
                      }
                    />
                  )}
                />
              ) : null}
            </Animated.View>
          </Animated.View>
        </Animated.View>
        <Animated.View pointerEvents={closing ? 'none' : 'box-none'} style={chromeStyle}>
          <XStack items="center" justify="space-between" gap="$3">
            <Button
              circular
              width={44}
              height={44}
              bg="rgba(40,40,40,0.7)"
              p="$0"
              accessibilityLabel={t('closeImagePreview')}
              onPress={() => close()}
            >
              <X size={22} color="white" />
            </Button>
            {images.length > 1 ? (
              <Text
                color="white"
                fontSize="$footnote"
                accessibilityLabel={t('imagePreviewPage', { current: index + 1, total: images.length })}
              >
                {index + 1} / {images.length}
              </Text>
            ) : null}
          </XStack>
        </Animated.View>
        {!closing && actions.busy ? (
          <YStack position="absolute" b={insets.bottom + 28} l={20} r={20} items="center" gap="$2" pointerEvents="none">
            <Spinner color="white" />
            <Text color="white" fontSize="$footnote" accessibilityLiveRegion="polite">
              {t(actions.busy === 'save' ? 'saving' : 'imagePreviewPreparingShare')}
            </Text>
          </YStack>
        ) : !closing && status === 'loading' ? (
          <YStack position="absolute" b={insets.bottom + 28} l={0} r={0} items="center" pointerEvents="none">
            <PreviewLoadingIndicator key={`${activeImage.id}:${retries[activeImage.id] ?? 0}`} />
          </YStack>
        ) : !closing && status === 'error' ? (
          <YStack position="absolute" b={insets.bottom + 28} l={20} r={20} items="center" gap="$2">
            <Text color="white" fontSize="$footnote">
              {t('imagePreviewLoadFailed')}
            </Text>
            <Button
              bg="$color3"
              onPress={() => {
                setStatuses((previous) => ({ ...previous, [activeImage.id]: 'loading' }));
                setRetries((previous) => ({ ...previous, [activeImage.id]: (previous[activeImage.id] ?? 0) + 1 }));
              }}
            >
              {t('retry')}
            </Button>
          </YStack>
        ) : null}
        {actions.sheet}
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Unmount each session so reopening resets both gallery zoom and initial index. */
export default function ImagePreview(props: ImagePreviewProps) {
  if (!props.visible || props.images.length === 0) return null;
  return <PreviewSession {...props} />;
}
